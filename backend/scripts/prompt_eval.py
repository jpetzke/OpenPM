"""Offline A/B eval for the chat-agent system prompt.

Drives the REAL agent loop (app.services.llm.agent_round + the real tool
message protocol from routers/chat.py) against canned fixtures with known
ground truth, then LLM-judges each answer. Compares BASELINE (the prompt
currently shipped in chat.py) against one or more CANDIDATE prompts.

Run inside the backend container:
    podman exec openpm-backend-1 python scripts/prompt_eval.py
    podman exec openpm-backend-1 python scripts/prompt_eval.py --variant candidate_v1
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys

from app.routers.chat import _ALL_TOOLS, _SYSTEM_PROMPT_STABLE
from app.services import llm as llm_service

# ---------------------------------------------------------------------------
# Fixtures — a realistic "Praktikum" project with KNOWN ground truth.
# The state digest deliberately carries SUMMARIES ONLY (no exact ECTS / page
# / stipend / hours numbers) so doc-load behaviour is actually exercised.
# ---------------------------------------------------------------------------

CONTEXT_BLOCK = """<project_context>
Projekt: Pflichtpraktikum Anna Müller | Kunde: Universität Beispielstadt | Status: active | Stand v7

[Projektstand]
Blocker: keine
Offene Tasks (3):
  - [t1] (open) Praktikumsbericht abgeben — nach Vorgaben der Praktikumsordnung einreichen
  - [t2] (open) Laufzettel unterschreiben lassen — vom Betreuer abzeichnen lassen
  - [t3] (blocked) Termin Zwischenpräsentation finden — wartet auf Rückmeldung des Betreuers
Deadlines (1):
  - Praktikumsende — 2026-08-31
Kontakte (2):
  - Anna Müller (Praktikantin) — anna.mueller@uni-beispielstadt.de
  - Prof. Dr. Schmidt (Betreuer)
Praktikumsregeln:
  - ECTS-Anrechnung gestaffelt nach Praktikumsdauer: Die Anrechnung in ECTS und die geforderte Mindestlänge des Berichts hängen von der Dauer ab; die genauen Stufen stehen in der Praktikumsordnung.

[Dokumente]  Format: <id> | <dateiname> | <status> | <zusammenfassung>
- d1 | Praktikumsordnung_2026.pdf | processed | Regelt Umfang, ECTS-Anrechnung gestaffelt nach Dauer und Abgabefristen des Pflichtpraktikums.
- d2 | Praktikumsvertrag_Mueller.pdf | processed | Vertrag zwischen Anna Müller und der Firma: Dauer, Vergütung, Wochenstunden, Betreuer.
- d3 | Kickoff_Notes.txt | processed | Notizen vom Auftaktgespräch mit offenen Punkten und Verantwortlichkeiten.
</project_context>"""

DOC_FULLTEXT = {
    "d1": """Praktikumsordnung 2026 — Studiengang Informatik

§ 4 Umfang und Anrechnung
Das Pflichtpraktikum wird je nach Dauer wie folgt angerechnet:
- 4 Wochen Vollzeit: 5 ECTS, Praktikumsbericht mindestens 8 Seiten
- 8 Wochen Vollzeit: 10 ECTS, Praktikumsbericht mindestens 15 Seiten
- 12 Wochen Vollzeit: 15 ECTS, Praktikumsbericht mindestens 20 Seiten
Eine anteilige Anrechnung für Zwischenzeiträume erfolgt nicht.

§ 5 Abgabefristen
Der Praktikumsbericht ist spätestens vier Wochen nach Ende des Praktikums einzureichen.
Der Laufzettel ist zusammen mit dem Bericht abzugeben.
""",
    "d2": """Praktikumsvertrag

Praktikantin: Anna Müller
Betreuer (Hochschule): Prof. Dr. Schmidt
Praktikumszeitraum: 01.07.2026 bis 31.08.2026
Dauer: 8 Wochen Vollzeit
Arbeitszeit: 38 Stunden pro Woche
Vergütung: 850 EUR pro Monat
""",
    "d3": """Kickoff-Notizen (12.05.2026)
- Anna stellt Praktikumsbericht zusammen.
- Betreuer Prof. Dr. Schmidt muss Laufzettel abzeichnen.
- Termin für Zwischenpräsentation noch offen, Betreuer meldet sich.
""",
}

# Canned semantic-search backend: maps keyword -> (doc_id, snippet).
SEARCH_INDEX = [
    ("ects", "d1", "§ 4 Umfang und Anrechnung: Das Pflichtpraktikum wird je nach Dauer angerechnet. 8 Wochen Vollzeit: 10 ECTS ... (Liste gekürzt)"),
    ("anrechnung", "d1", "§ 4: Anrechnung gestaffelt nach Dauer. Eine anteilige Anrechnung für Zwischenzeiträume erfolgt nicht."),
    ("seiten", "d1", "Praktikumsbericht mindestens ... Seiten (abhängig von der Dauer)."),
    ("bericht", "d1", "§ 5 Abgabefristen: Der Praktikumsbericht ist spätestens vier Wochen nach Ende des Praktikums einzureichen."),
    ("frist", "d1", "§ 5: Der Praktikumsbericht ist spätestens vier Wochen nach Ende des Praktikums einzureichen."),
    ("abgabe", "d1", "§ 5: Der Praktikumsbericht ist spätestens vier Wochen nach Ende des Praktikums einzureichen."),
    ("vergütung", "d2", "Vergütung: 850 EUR pro Monat."),
    ("stipend", "d2", "Vergütung: 850 EUR pro Monat."),
    ("gehalt", "d2", "Vergütung: 850 EUR pro Monat."),
    ("stunden", "d2", "Arbeitszeit: 38 Stunden pro Woche."),
    ("hours", "d2", "Arbeitszeit: 38 Stunden pro Woche."),
    ("dauer", "d2", "Praktikumszeitraum: 01.07.2026 bis 31.08.2026. Dauer: 8 Wochen Vollzeit."),
]


def _canned_search(query: str, limit: int = 5) -> dict:
    q = query.lower()
    hits = []
    for kw, doc_id, snippet in SEARCH_INDEX:
        if kw in q:
            hits.append({"document_id": doc_id, "snippet": snippet, "score": 0.8})
    if not hits:
        hits.append({"document_id": "d1", "snippet": "Kein eindeutiger Treffer.", "score": 0.2})
    return {"results": hits[:limit]}


async def _execute_tool_fixture(name: str, args: dict) -> dict:
    if name == "list_documents":
        return {"documents": [
            {"id": "d1", "filename": "Praktikumsordnung_2026.pdf", "status": "processed"},
            {"id": "d2", "filename": "Praktikumsvertrag_Mueller.pdf", "status": "processed"},
            {"id": "d3", "filename": "Kickoff_Notes.txt", "status": "processed"},
        ]}
    if name == "search_documents":
        return _canned_search(args.get("query", ""), args.get("limit") or 5)
    if name == "get_document_content":
        did = args.get("document_id", "")
        return {"document_id": did, "content": DOC_FULLTEXT.get(did, "Dokument nicht gefunden.")}
    if name == "get_state_history":
        return {"changes": [{"version": 7, "triggered_by": "pipeline", "summary": "Vertrag importiert"}]}
    if name == "get_current_state":
        return {"note": "siehe project_context"}
    if name == "update_task_status":
        return {"ok": True, "title": args.get("task_id"), "new_status": args.get("status"),
                "undo_token": "tok123"}
    return {"error": f"unknown tool {name}"}


# ---------------------------------------------------------------------------
# Minimal agent loop (mirrors routers/chat.py::_run_agent message protocol).
# ---------------------------------------------------------------------------

MAX_ROUNDS = 5


async def run_agent(system_prompt: str, user_msg: str) -> dict:
    msgs = [
        {"role": "system", "content": system_prompt},
        {"role": "system", "content": CONTEXT_BLOCK},
        {"role": "user", "content": user_msg},
    ]
    final_text = ""
    tool_trace: list[dict] = []

    for round_idx in range(MAX_ROUNDS):
        tools = _ALL_TOOLS if round_idx < MAX_ROUNDS - 1 else None
        pending: list[dict] = []
        text_this_round = ""
        async for ev in llm_service.agent_round(msgs, tools=tools, purpose=f"eval_round_{round_idx}"):
            if ev["type"] == "content_delta":
                text_this_round += ev["delta"]
            elif ev["type"] == "tool_calls":
                pending = ev["calls"]
        if not pending:
            final_text = text_this_round
            break
        msgs.append({
            "role": "assistant", "content": text_this_round or None,
            "tool_calls": [
                {"id": tc["id"], "type": "function",
                 "function": {"name": tc["name"], "arguments": tc["arguments"]}}
                for tc in pending
            ],
        })
        for tc in pending:
            try:
                args = json.loads(tc["arguments"] or "{}")
            except json.JSONDecodeError:
                args = {}
            result = await _execute_tool_fixture(tc["name"], args)
            tool_trace.append({"name": tc["name"], "args": args})
            msgs.append({"role": "tool", "tool_call_id": tc["id"],
                         "content": json.dumps(result, default=str)})
    return {"text": final_text.strip(), "tools": tool_trace}


# ---------------------------------------------------------------------------
# Test battery — each case carries ground truth + expected behaviour.
# ---------------------------------------------------------------------------

CASES = [
    {"id": "open_tasks", "q": "Welche offenen Aufgaben gibt es?",
     "gt": "t1 (Praktikumsbericht abgeben) und t2 (Laufzettel unterschreiben lassen) sind offen; t3 ist blockiert. Antwort direkt aus dem Kontext, KEIN Tool nötig.",
     "no_tool": True},
    {"id": "ects_anna", "q": "Wie viele ECTS bekommt Anna für ihr Praktikum?",
     "gt": "Anna macht 8 Wochen (Vertrag) → 10 ECTS laut Praktikumsordnung. Korrekte Antwort: 10 ECTS. Erfordert Laden der Ordnung (Stufen stehen nicht im Kontext). Quelle nennen.",
     "no_tool": False},
    {"id": "ects_6w", "q": "Und wie viele ECTS gäbe es bei 6 Wochen Praktikum?",
     "gt": "Die Ordnung kennt nur 4/8/12 Wochen und sagt ausdrücklich: keine anteilige Anrechnung für Zwischenzeiträume. Korrekt: 6 Wochen ist keine vorgesehene Stufe / kein anteiliger Wert. FALSCH wäre jeder erfundene Zwischenwert (z. B. 7,5 ECTS).",
     "no_tool": False, "must_not_contain": ["7,5", "7.5", "anteilig 7"]},
    {"id": "report_pages", "q": "Wie lang muss Annas Praktikumsbericht mindestens sein?",
     "gt": "Anna: 8 Wochen → mindestens 15 Seiten. Erfordert Laden der Ordnung. Quelle nennen.",
     "no_tool": False},
    {"id": "quote_frist", "q": "Was genau steht in der Praktikumsordnung zur Abgabefrist des Berichts? Zitiere die Stelle.",
     "gt": "Wörtlich: 'Der Praktikumsbericht ist spätestens vier Wochen nach Ende des Praktikums einzureichen.' Muss Dokument vorher laden und wörtlich zitieren.",
     "no_tool": False},
    {"id": "mark_done", "q": "Markiere die Laufzettel-Aufgabe als erledigt.",
     "gt": "update_task_status(task_id=t2, status=done), dann kurze Bestätigung. Task-ID t2 aus dem Kontext.",
     "expect_tool": "update_task_status"},
    {"id": "end_date", "q": "Wann endet das Praktikum?",
     "gt": "2026-08-31. Direkt aus dem Kontext, KEIN Tool.",
     "no_tool": True},
    {"id": "contact", "q": "Wer ist die Praktikantin und wie erreiche ich sie?",
     "gt": "Anna Müller, anna.mueller@uni-beispielstadt.de. Direkt aus dem Kontext, KEIN Tool.",
     "no_tool": True},
    {"id": "stipend_en", "q": "What stipend does Anna receive per month?",
     "gt": "850 EUR per month (only in the contract d2 — must load it). Answer in English (mirror language).",
     "no_tool": False, "lang": "en"},
    {"id": "summary", "q": "Fasse den Projektstand kurz zusammen.",
     "gt": "Knappe Zusammenfassung aus dem Kontext: 8-Wochen-Pflichtpraktikum von Anna Müller, endet 31.08.2026, 3 Tasks (1 blockiert), Betreuer Prof. Schmidt. KEIN Tool. Nicht über-formatiert.",
     "no_tool": True},
    {"id": "blocked_why", "q": "Welche Aufgabe hängt gerade und warum?",
     "gt": "t3 (Termin Zwischenpräsentation) ist blockiert, wartet auf Rückmeldung des Betreuers. Direkt aus dem Kontext, KEIN Tool.",
     "no_tool": True},
    {"id": "hours", "q": "Wie viele Wochenstunden leistet Anna?",
     "gt": "38 Stunden pro Woche (nur im Vertrag d2 — muss geladen werden). Quelle nennen.",
     "no_tool": False},
]


JUDGE_SYS = """Du bist ein strenger Gutachter für Antworten eines Projektassistenten.
Bewerte NUR anhand der gelieferten Ground Truth und des Tool-Verlaufs. Gib reines JSON zurück, kein Markdown.
Felder:
- accuracy: 0-5 (stimmt der Inhalt mit der Ground Truth? falsche/abweichende Werte = niedrig)
- hallucination: true/false (wurde ein Wert, eine Zahl oder ein Zitat erfunden, das nicht aus den Quellen stammt?)
- grounding: 0-5 (richtiger Tool-Pfad genutzt? bei Dokumentfragen Quelle/Dateiname genannt? wörtliches Zitat nur nach Laden?)
- tool_use: 0-5 (kein Tool wenn Antwort im Kontext steht; Tool wenn nötig; richtiges Tool)
- conciseness: 0-5 (direkt, keine Füllphrasen, keine Wiederholung der Frage, keine Über-Formatierung)
- overall: 0-5
- notes: ein kurzer Satz, was gut/schlecht war."""


async def judge(case: dict, result: dict) -> dict:
    tools_str = ", ".join(f"{t['name']}({t['args']})" for t in result["tools"]) or "KEINE"
    prompt = f"""FRAGE: {case['q']}

GROUND TRUTH / ERWARTETES VERHALTEN: {case['gt']}
Erwartung Tool-Nutzung: {'KEIN Tool' if case.get('no_tool') else ('Tool ' + case['expect_tool'] if case.get('expect_tool') else 'Dokument laden (search/get_document_content)')}

ASSISTENT-ANTWORT:
{result['text']}

TOOL-VERLAUF DES ASSISTENTEN: {tools_str}

Bewerte als JSON."""
    try:
        resp, _ = await llm_service.complete(
            [{"role": "system", "content": JUDGE_SYS}, {"role": "user", "content": prompt}],
            purpose="general",
        )
    except Exception as e:  # judge prompt itself can trip Azure's filter — that's an
        # eval artifact, not a property of the agent prompt under test. Don't abort.
        return {"overall": -1, "accuracy": -1, "hallucination": False, "grounding": -1,
                "tool_use": -1, "conciseness": -1, "notes": f"JUDGE SKIPPED: {str(e)[:60]}"}
    raw = resp.choices[0].message.content or "{}"
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"overall": 0, "accuracy": 0, "hallucination": True, "grounding": 0,
                "tool_use": 0, "conciseness": 0, "notes": f"judge parse fail: {raw[:120]}"}


# ---------------------------------------------------------------------------

def load_variant(name: str) -> str:
    if name == "baseline":
        return _SYSTEM_PROMPT_STABLE
    # candidate variants live in candidate_prompts.py next to this script
    from candidate_prompts import VARIANTS
    return VARIANTS[name]


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", default="baseline")
    ap.add_argument("--only", default=None, help="run a single case id")
    args = ap.parse_args()

    system_prompt = load_variant(args.variant)
    cases = [c for c in CASES if (not args.only or c["id"] == args.only)]

    print(f"\n=== VARIANT: {args.variant} | {len(cases)} cases ===\n", flush=True)
    dims = ["accuracy", "grounding", "tool_use", "conciseness", "overall"]
    totals = {d: 0.0 for d in dims}
    halluc = 0
    judged = 0

    for c in cases:
        result = await run_agent(system_prompt, c["q"])
        j = await judge(c, result)
        if j.get("overall") == -1:
            print(f"[{c['id']:14}] {j.get('notes')}", flush=True)
            continue
        judged += 1
        # hard anti-hallucination check on banned substrings
        banned = c.get("must_not_contain", [])
        forced_halluc = any(b.lower() in result["text"].lower() for b in banned)
        if forced_halluc:
            j["hallucination"] = True
            j["accuracy"] = min(j.get("accuracy", 0), 1)
            j["overall"] = min(j.get("overall", 0), 1)
        for d in dims:
            totals[d] += float(j.get(d, 0) or 0)
        if j.get("hallucination"):
            halluc += 1
        tools = ",".join(t["name"] for t in result["tools"]) or "-"
        print(f"[{c['id']:14}] ov={j.get('overall')} acc={j.get('accuracy')} "
              f"grnd={j.get('grounding')} tool={j.get('tool_use')} conc={j.get('conciseness')} "
              f"hall={'Y' if j.get('hallucination') else 'n'} | tools={tools}", flush=True)
        print(f"   note: {j.get('notes','')}", flush=True)
        print(f"   ans:  {result['text'][:240].replace(chr(10),' ')}", flush=True)
        print(flush=True)

    n = max(judged, 1)
    print(f"=== AVERAGES (judged {judged}/{len(cases)}) ===", flush=True)
    for d in dims:
        print(f"  {d:12}: {totals[d]/n:.2f}", flush=True)
    print(f"  hallucinations: {halluc}/{judged}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
