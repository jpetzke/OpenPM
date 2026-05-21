# OpenPM — Road to Perfection

> Lebendes Referenz-Dokument. Definiert pro Feature/Detail den absolut perfekten Zielzustand, hält den aktuellen Ist-Stand fest und listet messbare Akzeptanz-Kriterien als Checkliste. Wird über viele Sessions hinweg fortgeschrieben.
>
> **Last update:** 2026-05-22 · **Stand:** OpenPM @ `main` (5f11d28)
> **Aktueller Gesamt-Score:** **40 / 100** (Review-Pass: ehrlichere Gewichtung gegen User-Story-Kern)

---

## 0. Wie dieses Dokument benutzt wird

- **🎯 Soll** beschreibt den perfekten Zustand. Nicht verhandelbar, sondern Maßstab.
- **📍 Ist** dokumentiert den aktuellen Stand mit Datei + Zeilenreferenzen.
- **✅ Checkliste** zerlegt das Soll in messbare Akzeptanz-Kriterien — pro PR abhakbar.
- **🛠 Vorgehen** skizziert den nächsten konkreten Schritt (nicht alle Schritte).
- **⚖️ Decision** markiert offene Trade-offs mit pragmatischem Default. Jonas kann überschreiben.

Reihenfolge der Sektionen orientiert sich am Nutzerpfad — vom ersten Öffnen bis zum täglichen Power-User-Workflow.

Statuslegende für Sub-Items:
- `[x]` erfüllt
- `[~]` teilweise erfüllt (siehe Kommentar)
- `[ ]` offen

---

## 1. Leitprinzipien

1. **Zuverlässigkeit > Geschwindigkeit > Features.** Lieber ein State-Item auslassen als eines erfinden.
2. **Reaktiv, nicht dekorativ.** Jede Animation transportiert Information.
3. **Progressive Disclosure.** Ruhezustand kompakt, Aktivität expandiert, Abschluss wieder kompakt.
4. **Keine toten Momente.** Zwischen Klick und Ergebnis passiert immer etwas Sichtbares.
5. **Single Cockpit.** Eine Seite pro Projekt — Chat dominiert, der Rest atmet drumherum.
6. **Quelle für jede Information.** Jeder State-Eintrag verweist auf das auslösende Dokument.
7. **Power-User-First.** Tastatur, Slash-Commands, Clipboard-Paste sind keine Add-ons.
8. **Self-hosted, KI-Provider-agnostisch.** OpenRouter / Azure austauschbar; eigene Infra zwingend.

### Konflikt-Resolver

Prinzip 1 (Reliability) und Prinzip 4 (No-Dead-Moments) kollidieren bei langsamen Operationen. Regel: **lange Operationen brauchen sichtbares Working-State mit echtem Status — nie Spinner ohne Info, nie Mock-Response.** Jonas sieht „extrahiere Kontakte…" mit pulsendem Label statt „fertig (gelogen)" als Optimierung.

Prinzip 3 (Progressive Disclosure) und Prinzip 7 (Power-User) kollidieren bei Defaults. Regel: **kompakter Default + sichtbarer Expand-Trigger.** Power-User-Detail nie aufgezwungen, immer eine Geste entfernt.

---

## 2. Status-Übersicht (Scorecard)

Formel: **Gesamt = Σ (Bereich-Score × Gewicht) / 100**. Gewichte spiegeln User-Story-Prioritäten (Reliability + Cockpit + Chat schwer, Polish leicht). Bereich-Score = % erfüllter Checklist-Items in der jeweiligen Sektion. Konsistenz-Regel: Score ≤ 30 wenn Kern-Feature der Sektion komplett fehlt, unabhängig von Drumherum-Punkten.

| Bereich | Gewicht | Score | Kurzbefund |
|---|---|---|---|
| A. Cockpit-Layout (Single Page) | 10 % | 10 / 100 | 3 Tab-Routen statt einer Seite — Kern-Soll verletzt |
| B. Chat-Interface | 8 % | 55 / 100 | Streaming + Tools da; Sessions, Inline-Mutation-Karten, Slash fehlen |
| C. Chat-Archiv & Sessions | 5 % | 15 / 100 | History-Endpoint da, kein Session-Modell, keine UI |
| D. Dokument-Upload-Flow | 7 % | 70 / 100 | Solide Drop-Zone + Progress; Clipboard-Paste fehlt |
| E. Live-Extraction-Feedback | 6 % | 60 / 100 | SSE-Stream da, Pro-Item-Live-Feed fehlt |
| F. State + Source-Attribution | 9 % | 50 / 100 | Dedup ok; Source nur in dynamic_sections + Tasks |
| G. State-UI (Status-Block) | 5 % | 50 / 100 | StateGrid existiert; kompakte Ruhe-Zeile fehlt |
| H. Reliability + Error-Paths | 9 % | 45 / 100 | Failure-Status da; Retry, Rollback unvollständig |
| I. Dokument-Lifecycle | 5 % | 25 / 100 | Delete da, Replace + Rollback fehlt |
| J. Briefing + Context-Window | 5 % | 60 / 100 | Briefing auto-rendered; Cap + Priorisierung fehlt |
| K. Token-Budget + Kosten | 5 % | 0 / 100 | Komplette Lücke |
| L. Format-Support (EML/Audio/Bilder) | 5 % | 35 / 100 | Doc/Text ok; EML/Audio/OCR fehlen |
| M. Onboarding + Multi-Projekt-Nav | 3 % | 35 / 100 | Sidebar da; Wizard fehlt |
| N. Clipboard-Paste | 2 % | 10 / 100 | Text-Modal existiert; Bild/Inline fehlt |
| O. Slash-Commands | 2 % | 0 / 100 | Nicht implementiert |
| P. Keyboard-Navigation | 2 % | 35 / 100 | Cmd+1/2/3 (deprecated nach Refactor); Cmd+K/N fehlen |
| Q. Session/Auth-Lifecycle | 3 % | 40 / 100 | JWT + Blocklist; Refresh + Recovery fehlen |
| R. Notifications & Recovery | 2 % | 25 / 100 | Toast da; Browser-Push fehlt |
| S. Bulk-Upload | 2 % | 45 / 100 | Pro-File ok, Gruppierung fehlt |
| T. Stale Detection | 2 % | 0 / 100 | Kein Cron |
| U. Export | 2 % | 0 / 100 | Komplett fehlend |
| V. Animationen + Timing | 3 % | 45 / 100 | Tailwind transitions da; Disziplin fehlt |
| W. Nicht-funktional (DevOps/Tests/Obs) | 4 % | 60 / 100 | Docker + Alembic + E2E vorhanden; Observability fehlt |
| **Summe** | **100 %** | — | — |

**Gesamt-Score: 40 / 100.** Berechnung: Σ Bereich × Gewicht. Korrektur gegen alten 68er-Wert: die alte Zahl überbewertete Backend-Infrastruktur und unterbewertete den Single-Cockpit-Verstoß. Reality-Check zeigt: Cockpit + Chat-Sessions + Source-Attribution + Token-Budget zusammen sind ~30 % Gewicht und alle unter 50 → Gesamt muss niedrig sein.

Score-Update-Pflicht: bei jedem PR der Items abhakt → Bereich-Score neu berechnen (`erfüllte Items / Gesamt-Items × 100`), dann Gesamt neu summieren. Helfer-Skript siehe Sektion 5.

---

## A. Cockpit-Layout (Single Page)

### 🎯 Soll
Ein Cockpit pro Projekt. Eine Route. Chat dominiert visuell und im DOM. Status-Block, Dokumente-Bereich, Chat-Archiv sind im Ruhezustand kompakt/collapsed. Sobald der Nutzer tippt oder einen alten Chat öffnet, expandieren die Chat-Region und alle anderen Bereiche weichen synchron nach oben. Zurück zum Cockpit über Klick auf Projektname oder Wischgeste (Mobile). Keine `/chat /state /upload` Sub-Routen — höchstens als Anchor-Deep-Links der einen Cockpit-Seite.

### 📍 Ist
- `frontend/src/app/projects/[id]/layout.tsx:1-79` rendert Sidebar + Header + Tabs + `{children}`.
- Drei separate Pages: `chat/page.tsx`, `state/page.tsx`, `upload/page.tsx`.
- `ProjectTabs.tsx` rendert eine Tab-Leiste — explizit Multi-Page.
- Cmd+1/2/3 wechselt zwischen Tabs (Layout-File Zeile 38-49).
- **Verstößt direkt gegen Single-Page-Anforderung der User Story.**

### ✅ Checkliste (Desktop)
- [ ] Neue Route `/projects/[id]/page.tsx` als einziger Einstieg, ohne Tabs.
- [ ] Chat-Input dauerhaft am unteren Viewport-Rand sichtbar.
- [ ] Status-Block (kompakte einzeilige Zusammenfassung) ist im Ruhezustand expanded, andere Bereiche collapsed.
- [ ] Klick / Fokus auf Chat-Input animiert Cockpit-Bereiche `translateY(-100%)` aus dem Viewport (synchron, 300 ms ease-out).
- [ ] Klick auf Projektname schließt Chat-Fullscreen, animiert Cockpit zurück (Esc-Verhalten siehe Sektion P).
- [ ] Old-Tab-Routen gelöscht (keine Backwards-Compat). Anchor `#docs|#state|#archive` öffnet Cockpit mit Bereich expanded — wird beim Scroll/Expand nicht in URL persistiert.
- [ ] Status-Block-Klick expandiert vollständigen Core-State inline.

### ✅ Checkliste (Mobile)
- [ ] < 768 px Viewport: Chat öffnet sich als Fullscreen-View (kein Cockpit darunter sichtbar).
- [ ] Cockpit-Sektionen als Bottom-Sheet erreichbar (Tap auf „Projekt-Info"-Icon im Header).
- [ ] Swipe-Down auf Chat-Header schließt Fullscreen zurück zum Cockpit.
- [ ] Touch-Targets ≥ 44 px Höhe.

### ✅ Checkliste (Continuity während Aktivität)
- [ ] Während Chat offen + neuer Upload läuft: ephemeral Banner über Chat-Top („Upload: brief.pdf — verarbeitet…").
- [ ] Pipeline-Complete während Chat offen: Banner wechselt zu „brief.pdf fertig: 3 Tasks, 1 Deadline" mit Klick → öffnet Doc-Card im darunterliegenden Cockpit.
- [ ] Banner auto-dismiss nach 8 s, manuell schließbar.

### 🛠 Vorgehen
1. Cockpit-Page-Komponente in `page.tsx` aufsetzen; bestehende Sub-Pages als Sektionen kompositionell wiederverwenden (`<DocumentsSection collapsed/>`, `<StateSection compact/>`).
2. CSS-Grid mit `grid-template-rows` für Expand/Collapse (Framer-Motion nur wenn nötig).
3. Sub-Routen-Pages und `ProjectTabs.tsx` löschen.
4. SSE-Connection-Lifecycle: bleibt auf Layout-Level verbunden (gehört zu W. Performance).

### ⚖️ Decisions
- **Deep-Link-Verhalten** → Anchor-Hash `#docs|#state|#archive` öffnet Cockpit mit entsprechendem Bereich expanded. Anchor wird beim manuellen Scroll/Collapse aus URL entfernt. Kein `?section=` Query-Param (würde wie Route wirken). Bookmarks funktionieren.
- **Esc-Verhalten** → siehe Sektion P (zweistufig: erstes Esc = Input unfokussieren, zweites Esc = Chat schließen).

---

## B. Chat-Interface

### 🎯 Soll
Der Chat ist die Hauptinteraktion. Token-Streaming wirkt natürlich und nicht ruckelig. Tool-Use sichtbar als kompakte Inline-Pille mit Expand auf Detail. State-Mutationen vom Agent erscheinen als interaktive Artifact-Karten im Stream mit 30 s Undo-Window. Undo wirkt **nur auf die einzelne Mutation**, nie auf den ganzen State (kein Git-Revert). Datei-Anhänge per Büroklammer; sie wandern parallel ins Dokument-Set und werden extrahiert. Input-Feld auto-resized (max 6 Zeilen). Modell-Wahl per Inline-Dropdown ohne Settings-Sprung. Slash-Commands per Autocomplete-Popup über dem Input.

### 📍 Ist
- `frontend/src/components/chat/ChatInterface.tsx` — Streaming via `useChatStream`, optimistic Messages, Tool-Indicator-Liste (`activeTools.join(", ")`) am Boden — funktioniert, aber **flach + textuell**, nicht als Inline-Pille pro Tool-Call.
- `ChatMessage.tsx` rendert Markdown sauber; **kein Mutation-Artifact-Card-Block**.
- `ChatInput.tsx` Auto-Resize bis 120 px (~6 Zeilen) ✓.
- Modell-Wahl-Dropdown vorhanden ✓.
- **Kein** Datei-Anhang-Button im Chat.
- **Kein** Slash-Command-Autocomplete.
- Fehler-Banner solide (provider_config_corrupt, no_active_provider).

### ✅ Checkliste
- [x] Token-Streaming wortweise (natürlich, nicht ruckelig).
- [x] Markdown-Rendering inkl. Code / Listen.
- [x] Modell-Dropdown im Chat-Input.
- [x] Abort-Button während Streaming.
- [~] Tool-Use-Indikator (vorhanden, aber als Footer-Text, nicht inline pro Call).
- [ ] Inline-Pille pro Tool-Call (`🔍 Durchsuche Dokumente…` → collapsed `🔍 3 Dokumente durchsucht`).
- [ ] Tool-Pille expandierbar mit Argument + Ergebnis-Auszug.
- [ ] Mutation-Artifact-Karte (`✓ Task X als erledigt markiert [Rückgängig]`).
- [ ] Undo-Button schaltet nach 30 s grau aus und verschwindet.
- [ ] Undo = inverse Operation auf das einzelne Item (Task-Status zurück), nie Git-Revert.
- [ ] Datei-Anhang-Button (Büroklammer) im Input.
- [ ] Drop von Datei auf Chat-Input → Upload + Inline-Referenzkarte über der Nachricht.
- [ ] Slash-Command-Autocomplete (siehe Sektion O).
- [x] Shift+Enter = Newline, Enter = Send (Desktop).
- [ ] Mobile: Enter = Newline, Send-Button explizit (Touch).
- [ ] Empty-State zeigt 3 statische Beispiel-Prompts: „Was sind die offenen Tasks?", „Welche Deadlines stehen an?", „Fasse den aktuellen Status zusammen".

### 🛠 Vorgehen
1. Streaming-Throttle (aktuell 12 char/frame) bleibt Implementation-Detail; Wert frei tunebar wenn Stream als ruckelig empfunden wird.
2. Tool-Use-Event-Schema im SSE-Stream erweitern (`tool_call_start`, `tool_call_end` mit args + summary).
3. `ChatMessage` um neuen Block-Typ `tool_use_pill` erweitern.
4. Mutation-Artifact: Backend sendet bei `update_task_status` ein zusätzliches `mutation_card`-Event mit Undo-Token (Redis-Key, TTL 30 s, payload = `{tool_name, original_value, new_value, target_id}`).
5. Undo-Endpoint `POST /api/projects/{id}/chat/mutations/{undo_token}/revert` → ruft inverse Operation auf (z.B. `update_task_status(id, original_status)`), erzeugt neuen Changelog-Eintrag mit `triggered_by=undo`.

### ⚖️ Decisions
- **Datei-im-Chat-Race** → Datei wird beim Drop/Paste sofort hochgeladen (HTTP 201) und als Pipeline-Job gequeued. Inline-Referenzkarte erscheint ab Upload-Complete (nicht ab Extraction-Done). Chat-Nachricht kann sofort gesendet werden, LLM sieht initial nur Dateiname + „Verarbeitung läuft". Sobald Extraction durch ist, ist die Datei in `get_document_content` abrufbar.
- **Mutation-Undo-Scope** → genau eine Mutation, nie eine ganze Version. State-Version-Revert nur für Doc-Delete (Sektion I).

---

## C. Chat-Archiv & Session-Modell

### 🎯 Soll
Vergangene Chats sind eigenständige Sessions mit eigenem Verlauf, auto-generiertem Titel und Datum. Sidebar / Bereich im Cockpit zeigt alle Sessions des Projekts. Klick öffnet die Session geladen im Chat-Interface. Inline-Suche über alle Session-Titel + Nachrichten-Volltext. Sessions sind **immutable Snapshots** — jede Message ist mit der State-Version zum Antwort-Zeitpunkt verknüpft, damit alte Chats kohärent bleiben auch wenn der State weiterzieht.

### 📍 Ist
- Backend: `ChatMessage` Model existiert (`models/state.py`) — flach pro `project_id`. **Keine Session-Tabelle, keine Session-ID-Spalte.**
- `chat.py::get_chat_history` liefert *alle* Messages des Projekts in Reihenfolge — also ein einziger endloser Chat.
- `chat_messages.state_version` Feld bereits vorhanden (siehe `models/state.py`) ✓ — wird genutzt für historische Konsistenz.
- Frontend: kein Archiv-UI, keine Sidebar-Sektion „Vergangene Chats".

### ✅ Checkliste
- [ ] DB-Migration: Neue Tabelle `chat_sessions` (id, project_id, title, summary, created_at, last_message_at, message_count, archived_at NULL).
- [ ] `chat_messages.session_id` als FK; Alembic-Backfill: alle Bestehenden in eine „Migration"-Session pro Projekt mit Titel „Importierter Verlauf".
- [ ] Endpoint `POST /api/projects/{id}/chat/sessions` (neuer Chat) + `GET .../sessions` (Liste) + `GET .../sessions/{sid}/messages`.
- [ ] Auto-Titel: nach erster User-Message via kurzem LLM-Call (Output max 60 Token, fallback = erste 40 Zeichen der ersten Message). Kosten siehe Sektion K (wird im Token-Counter mitgezählt).
- [ ] Manuell editierbarer Titel (PATCH `/sessions/{sid}`).
- [ ] Frontend: Chat-Archiv-Bereich im Cockpit (collapsed, expand-Klick zeigt Liste).
- [ ] Inline-Suchfeld beim Expand, Debounce 300 ms, filtert nach Titel + Nachrichten-Volltext (Postgres `to_tsvector` mit deutscher Stopword-Liste; Fallback `ILIKE`).
- [ ] „Neuer Chat"-Button erzeugt frische Session, aktiver Chat-Switch ohne Page-Reload.
- [ ] Keyboard-Shortcut Ctrl/Cmd+N startet neue Session.
- [ ] Beim Cockpit-Mount: letzte Session innerhalb 24 h wird automatisch geladen (collapsed im Input). Älter → frische Slot, leer.
- [ ] Session-Delete archiviert (soft-delete via `archived_at`), versteckt aus Liste, behält DB-Daten.
- [ ] Historische Render-Konsistenz: beim Öffnen alter Session wird `state_version` pro Message in Tool-Pillen sichtbar („antwortet basierend auf State v12").

### ⚖️ Decisions
- **New-vs-Continue Default** → Cockpit-Mount zeigt letzte aktive Session aus den letzten 24 h. Nach 24 h Inaktivität → frischer Slot. Cmd+N immer = neue Session. „Neuer Chat"-Button immer = neue Session. Kein impliziter Auto-Split bei Idle.
- **Titel-Generierung-Kosten** → ~50 Output-Token pro Session = vernachlässigbar; trotzdem im Cost-Dashboard sichtbar als eigene Kategorie „titles".
- **Session-Delete-Cascade** → Soft-delete. Chat-Messages bleiben in DB für Audit. Suche/Liste filtert default `archived_at IS NULL`.
- **State-Version-Verlinkung** → Existierendes Feld nutzen. Zeigt bei alten Chats dezentes Badge „aus v12" wenn aktuelle Version > 12. Klick erklärt im Tooltip „State hat sich seit dieser Antwort weiterentwickelt — neue Frage stellen für aktuelle Info".

---

## D. Dokument-Upload-Flow

### 🎯 Soll
Drag & Drop auf gesamte Seite (nicht nur Zone). Datei-Picker via Button. Clipboard-Paste (Ctrl+V) für Bild + Text. Multi-File OK. Während Upload: Pro-Datei-Zeile als organische neue Zeile im Dokumente-Bereich (kein Modal, kein Toast). Inline-Progressbar mit 4 sichtbaren Phasen-Labels (Default-Modus) und Detail-Toggle für alle 9 internen Steps (Power-User-Modus). Sofortiges Cancel pro Datei während HTTP-Upload + Pipeline-Abbruch während Backend-Run. Duplikat-Detection per Hash. Bei Fehlern: Zeile bleibt expanded mit Retry-Button und konkretem Fehler.

### 📍 Ist
- `DropZone.tsx` solide: enter-counter gegen Flicker [[feedback_visual-consistency-openpm]], multi-file, MAX_SIZE 50 MB, cancel via UploadHandle.
- `routers/documents.py:34-36` ALLOWED: PDF/DOCX/DOC/XLSX/XLS/RTF/TXT/MD/CSV/JSON/HTML/HTM/LOG. **Keine** Bilder, **kein** EML, **kein** Audio.
- `TextPasteModal` für Plaintext-Paste vorhanden, aber separates Modal, nicht inline im Chat/Drop.
- Drag-Zone ist Container-bound, nicht page-wide.
- 9 Backend-Steps (`queued → parsing → summarize_extract → state_merge → state_persist → changelog → git_commit → embed → briefing`) — UI zeigt aktuell alle.

### ✅ Checkliste
- [x] Drag-Enter / Leave ohne Flicker (enter-counter).
- [x] Multi-File-Upload parallel.
- [x] Pro-Datei-Fehler isoliert.
- [x] Cancel während HTTP-Upload (via `UploadHandle.abort()`).
- [x] Size-Limit-Toast.
- [ ] Pipeline-Cancel-Endpoint `DELETE /api/projects/{id}/documents/{doc_id}?cancel_pipeline=true` → ARQ Job-Cancel + Doc-Status `cancelled`.
- [ ] Page-wide Drag-Overlay (Drop anywhere auf der Cockpit-Seite, außer auf Chat-Input).
- [ ] Drop auf Chat-Input = Anhang an aktuelle Nachricht (siehe Sektion B).
- [ ] Drop überall sonst = neues Dokument.
- [ ] Ctrl+V Paste-Handler: Bild aus Clipboard → Upload als `screenshot-{YYYY-MM-DD-HHmmss}.png`; Text > 200 Zeichen → `TextPasteModal` vorbefüllt; Text ≤ 200 Zeichen + Chat-Input fokussiert → normales Paste in Input (siehe Sektion N).
- [ ] Datei-Anhang aus Chat-Input (Büroklammer-Icon).
- [ ] Bei `unsupported_media_type`: konkreter Hinweis welche Formate erlaubt sind + Vorschlag „Inhalt als Text einfügen?".
- [ ] Per-File-Retry-Button auf gefailten Upload-Zeilen.
- [ ] Fortschrittsanzeige Default-Modus zeigt 4 Phasen: **Hochladen → Parsen → Extrahieren → Mergen**. Mapping: `queued+upload→Hochladen`, `parsing→Parsen`, `summarize_extract→Extrahieren`, `state_merge+state_persist+changelog+git_commit+embed+briefing→Mergen`.
- [ ] „Details"-Toggle pro Doc-Card öffnet alle 9 Backend-Steps mit Status + Timing.
- [ ] Duplikat-Detection: SHA-256 Hash des File-Bytes als `documents.content_hash`. Bei identischem Hash im Projekt → Confirm-Dialog „Diese Datei existiert schon als X. Trotzdem hochladen?".
- [ ] Hash-Index: `CREATE INDEX idx_documents_project_hash ON documents (project_id, content_hash)`.

### 🛠 Vorgehen
1. Drag-Overlay als globaler Layer im Cockpit (`onDragEnter` window-level Listener). Chat-Input fängt sein eigenes drop-Event ab und stoppt Propagation.
2. Clipboard-Listener (`onPaste`) auf Cockpit-Root mit Conflict-Detection.
3. Phasen-Mapping (9 Steps → 4 sichtbare Phasen) in `frontend/src/lib/pipeline-phases.ts`.
4. Hash beim Upload server-seitig berechnen (kein Frontend-Hash — File könnte groß sein).
5. Pipeline-Cancel: ARQ unterstützt `redis.set(f"cancel:{job_id}", "1")` → Pipeline checkt vor jedem Step.

---

## E. Live-Extraction-Feedback

### 🎯 Soll
Während Extraction läuft, erscheint unter der Datei-Zeile ein Live-Feed mit einzeln eingetrudelten Fakten. Jedes Item klickbar (Hover-Tooltip mit Source-Doc, Klick öffnet State-Bereich expanded auf dem Item):
- `→ Neuer Kontakt: Thomas Müller (Projektleiter)` ← linked to contact_id
- `→ Deadline aktualisiert: Lieferung bis 14.06.` ← linked to deadline_id
- `→ Task erkannt: API-Dokumentation erstellen` ← linked to task_id

Nach Abschluss collapsed der Feed zu einer Zusammenfassungs-Zeile (`3 Tasks, 1 Deadline, 1 Kontakt extrahiert`). Status-Block oben animiert Count-Up auf neue Zahlen. Bei Fehlern bleibt der Feed expanded mit dezentem Warn-Indikator. Auto-Collapse pausiert wenn neue Aktivität in der Region läuft.

### 📍 Ist
- `tasks/pipeline.py:114 _log_pipeline` published 8 Step-Events nach Redis `pipeline:{project_id}`.
- `_extracted_summary` (Z. 159) sammelt counts pro Item-Typ — **wird berechnet, aber nicht als eigenes Event published**.
- Frontend `LiveExtractionPanel`, `ActivityTimeline`, `DocumentCard` zeigen Step-Progress + Statuszeile — **aber keinen Item-für-Item-Live-Feed**.
- `ChangeSession.aggregate_summary` rollt counts pro Session auf — wird genutzt für „X neue Tasks"-Badge.

### ✅ Checkliste
- [x] SSE-Stream pro Projekt.
- [x] Step-Events pro Dokument (8 Steps).
- [x] Aggregierte Session-Counts.
- [ ] Neues Event `extracted_item` pro Item-Typ während Extraction: `{type: "task"|"contact"|..., item_id, title, action: "added"|"updated"}`.
- [ ] Pro Dokument-Zeile ein expandierbarer Live-Feed der Events.
- [ ] Live-Item Hover-Tooltip zeigt Source-Doc + Confidence; Klick scrollt zum State-Item und highlightet es (500 ms Flash).
- [ ] Feed collapsed nach Abschluss zu einzeiliger Summary mit 3 s Delay — **pausiert** wenn neue Doc-Activity im Bereich läuft.
- [ ] Bei Fehler bleibt Feed expanded + Warn-Indikator (kein Auto-Collapse).
- [ ] Count-Up-Animation auf Status-Block-Zahlen (200 ms ease-out).
- [ ] Pulsierende Phasen-Label (Opacity-Loop 0.5 → 1.0 in 1.5 s).
- [ ] „SSE getrennt"-Banner wenn `connectionState !== "connected"` (existiert in Upload-Page-Header — auf Cockpit übertragen).

### 🛠 Vorgehen
1. `_log_pipeline` um zweites Event `extracted_item` erweitern, das `_extracted_summary` zerlegt und einzeln streamt.
2. **Throttle nur bei Burst:** wenn Items innerhalb < 50 ms eintrudeln, künstlicher 200 ms Delay zwischen ihnen (gemütliches Eintrudeln). Andernfalls direkt streamen. Keine künstliche Gesamt-Verzögerung.
3. Pipeline-Store erweitert um Map `docId → ExtractedItem[]`.
4. `DocumentCard` rendert Feed-Block, der Items per CSS-Transition einfaded.

---

## F. State-Management & Source-Attribution

### 🎯 Soll
Jedes Item im State (Contact / Task / Deadline / Decision / Blocker / dynamic_section.item) trägt eine `source_document_ids: string[]` Spalte. Bei Merge wird angefügt, nicht überschrieben — eine Information aus 3 Dokumenten = 3 Source-IDs. State-Mutationen via Chat-Tool tragen Source `chat:{session_id}`. Manuelle Edits tragen `manual:{user_id}`. Briefing rendert die Quelle pro Eintrag (verkürzter Dateiname). Klick auf Quelle springt zum Dokument. Jedes Extraction-Item trägt **verpflichtend** ein `confidence`-Feld (`high|medium|low`); Low-Confidence-Items werden im UI gelb hinterlegt mit „Bitte prüfen".

### 📍 Ist
- `state_manager.py::merge_state` dedupliziert Contacts (email/name), Deadlines (title+date), Decisions (append-only).
- `dynamic_sections[].source_document_ids` ✓ vorhanden.
- `Task.source_document_id` (singular, FK auf Document) ✓ — siehe `TaskCard.tsx` Z. 70.
- Contact / Deadline / Decision / Blocker: **kein source_document_id Feld im JSON-Schema des State** (Schema in `services/extraction.py` zeigt nur title/email/date/etc.).
- Briefing-Renderer (`briefing.py`): Decisions zeigen `source_filename`, andere nicht.
- Anti-Halluzination-Prompt ✓ (`extraction.py` "Erfinde nichts.").
- TaskCard zeigt `source_document_id` als rohe UUID — **nicht als Dateiname**.
- ChangeSession trackt `document_ids` pro Burst — kann für Migration-Inferenz genutzt werden.

### ✅ Checkliste
- [x] Extraction-Prompt verbietet Halluzination.
- [x] Dedup-Logik pro Item-Typ.
- [x] Source-Attribution für Tasks + Dynamic Sections.
- [ ] State-JSON-Schema erweitert: alle Core-Items haben `source_document_ids: string[]` (statt singular).
- [ ] Task-Migration: bestehendes `source_document_id` → `source_document_ids: [old_id]`.
- [ ] Backfill bestehender States via Inferenz: pro State-Version → `change_session_documents` der Version → diese Doc-IDs sind Quelle für alle in dieser Version *neu hinzugekommenen* Items. Items aus älteren Versionen ohne ableitbare Quelle → markiert mit `"legacy:pre-migration"`, im UI dezent angezeigt als „Quelle vor Migration verloren".
- [ ] Merge mergt Source-IDs (Set-Union), überschreibt nicht.
- [ ] Briefing rendert pro Item eine Quelle-Zeile (Dateiname verkürzt, Klick → Dokument-Drawer).
- [ ] Chat-State-Mutations setzen `source = "chat:{session_id}"`. Bei Session-Soft-Delete bleibt Source-String erhalten, UI rendert „aus archiviertem Chat".
- [ ] Manuelle Edits (zukünftig) setzen `source = "manual:{user_id}"`.
- [ ] TaskCard auflöst Source-ID(s) zu Filename(n) via `useQuery(["documents", projectId])`. Bei Multi-Source: „aus 3 Dokumenten" mit Hover-Liste.
- [ ] Source-Pille überall (TaskCard, ContactCard, BlockerCard, DecisionCard, DynamicItem).
- [ ] Confidence-Feld **verpflichtend** im Extraction-JSON-Schema (`enum: [high, medium, low]`, nicht optional).
- [ ] Extraction-Prompt erweitert: „Setze `confidence: 'low'` wenn die Information mehrdeutig, fragmentiert oder spekulativ wäre. Lieber low als gar nicht extrahieren — aber Erfindung bleibt verboten."
- [ ] Medium/Low-Confidence-Items: gelber Border-Akzent + „Bitte prüfen"-Badge in allen Card-Komponenten.
- [ ] Konflikt-Resolution: Doc A sagt Deadline 14.06., Doc B sagt 16.06. → **dedupliziere nicht** (zwei Items mit gleichem Titel, verschiedenem Datum), beide Items mit Source-Attribution sichtbar, Briefing zeigt beide als „konfligierend: 14.06. (Doc A) vs 16.06. (Doc B)". State-Manager bekommt neue Methode `detect_conflicts()` die auf identischen Titel + abweichende Detail-Felder prüft.

### ⚖️ Decisions
- **Confidence-Score** → Verpflichtend. Fehlendes Feld in LLM-Output → Re-Prompt mit Schema-Schärfung (siehe Sektion H). Nicht „fehlend = high"; das würde das Feature stilllegen.
- **Migration-Backfill** → 2-Pass-Ansatz: Pass 1 inferenziell aus change_session_documents (genau dort wo eindeutig), Pass 2 `legacy:pre-migration` für Rest. Kein leerer Backfill.
- **Konflikt-Strategie** → Beide Items behalten, im UI explizit als Konflikt markieren, User entscheidet manuell. Auto-Resolution wäre eine Halluzinations-Variante.

---

## G. State-UI (Cockpit-Block)

### 🎯 Soll
Ruhezustand: eine Zeile `3 offene Tasks · Nächste Deadline: 14.06. · 1 Blocker · Letztes Update: vor 2h`. Klick expandiert zu vollständigem Core-State (Tasks, Kontakte, Deadlines, Blocker, Entscheidungen + Custom-Felder). Echtzeit-Highlight bei State-Änderung: betroffene Zeile pulsiert Background-Color für 500 ms. Versions-Footer: `Zuletzt geändert vor 2h · Version 14 · Historie ansehen`.

### 📍 Ist
- `StateGrid.tsx` rendert Sections + Card-Komponenten ✓.
- `StateTimeline.tsx` zeigt letzte 5 Changelog-Einträge mit Klick auf Diff-Modal ✓.
- **Keine** kompakte Ein-Zeilen-Zusammenfassung als Ruhezustand.
- **Keine** Highlight-Flash-Animation bei State-Update.
- Nächste Deadline nicht vorhanden — muss aus `state.core.deadlines` errechnet werden.

### ✅ Checkliste
- [x] StateGrid mit Sektions-Karten.
- [x] Changelog-Timeline mit Diff-Modal.
- [ ] `StatusSummaryRow` Komponente: zählt open_tasks (status != done), findet nächste Deadline, zählt Blocker, formatiert `last_change` relativ.
- [ ] Klick auf Summary expandiert StateGrid darunter mit Slide-Down (300 ms ease-out).
- [ ] Pipeline-Event `state_changed` triggert Highlight-Flash auf betroffener Section-Card.
- [ ] Versions-Footer mit Link auf Timeline-Modal.
- [ ] Empty-State (siehe zentrale Definition in Sektion 3 Cross-Cutting).

### 🛠 Vorgehen
**Nächste-Deadline-Logik** (deterministisch, ein Ort, von Frontend + Briefing-Renderer geteilt):
```
deadlines = state.core.deadlines.filter(status != "resolved")
upcoming = deadlines.filter(date >= today).sort_by(date asc)
overdue  = deadlines.filter(date <  today).sort_by(date asc)
next     = upcoming[0] if upcoming else overdue[0] if overdue else None
```
Bei mehreren am selben Tag → alphabetisch nach Titel. Anzeige: bei upcoming „Nächste Deadline: 14.06.", bei overdue „Überfällig seit 12.06." (rot).

---

## H. Reliability & Error-Paths

### 🎯 Soll
Kein gescheitertes Dokument korrumpiert den State. Jeder Pipeline-Schritt ist idempotent oder transaktional. Parsing-Failure → Doc bleibt im Status `failed`, State unverändert. Retry-Policy ist **pro Error-Klasse differenziert**, nicht uniform. Pro-Datei sichtbarer Fehlerstatus mit konkretem Grund + Retry-Button. State-Schema-Mismatch (LLM liefert kaputtes JSON) → Re-Prompt mit JSON-Schema-Injektion, dann `failed`. Embedding-Failure ist nicht-fatal (Doc geht auf `completed_partial`, Suche meldet Lücke).

### 📍 Ist
- `tasks/pipeline.py` nutzt PostgreSQL Advisory Lock pro Project (verhindert parallele State-Konflikte) ✓.
- `_translate_error` (Z. 193) übersetzt Fehler in deutsche Texte ✓.
- Doc-Status: pending/processing/completed/failed ✓.
- Extraction parsing-failure → leerer Delta (extraction.py fallback) — verhindert Korruption, aber **silent**.
- **Kein** automatisches Retry.
- **Kein** Retry-Button im UI.
- **Kein** Health-Check pro Pipeline-Schritt.

### ✅ Checkliste
- [x] Pro-Doc-Failure-Isolation (Lock + per-doc transaction).
- [x] Übersetzte Fehlermeldungen.
- [x] Kein State-Update bei Extraction-Fail.
- [ ] Retry-Policy pro Error-Klasse (siehe Tabelle unten).
- [ ] Retry-Button auf gefailter DocumentCard → ARQ Re-Enqueue mit Retry-Counter-Reset.
- [ ] `Document.error_message` Spalte mit konkretem Fehlertext.
- [ ] `Document.error_class` Spalte (`parse_error|llm_timeout|llm_invalid_json|llm_rate_limit|llm_5xx|embedding_failed|transcription_failed|...`).
- [ ] `Document.retry_count` Spalte (Reset bei manuellem Retry).
- [ ] Bei neuem Pipeline-Run werden `error_message` + `error_class` gecleart.
- [ ] Error-Banner pro Doc mit expandierbarem Detail-Block.
- [ ] Pipeline schreibt jeden Schritt-Failure in `pipeline_logs` mit Stacktrace (debug-Flag-gesteuert).
- [ ] Bei `llm_invalid_json` zweiter Versuch mit verschärftem System-Prompt: konkrete JSON-Schema-Block injiziert (`{"type":"object","required":[...],"properties":{...}}`) + Beispiel-Output am Ende. Retry-Counter pro Step.
- [ ] Embedding-Failure → Doc-Status `completed_partial`, State + Briefing OK, `search_documents`-Tool im Chat warnt „Suche aktuell auf X von Y Docs eingeschränkt".
- [ ] Healthcheck-Endpoint `/api/health`: `/live` (200 wenn Prozess läuft) + `/ready` (testet LLM + Redis + Qdrant + DB).

### Retry-Policy-Tabelle

| Error-Class | Retries | Backoff | Final-State |
|---|---|---|---|
| `llm_rate_limit` (429) | 5 | 30 s / 60 s / 120 s / 300 s / 600 s | `failed` |
| `llm_timeout` | 3 | 2 s / 8 s / 30 s | `failed` |
| `llm_5xx` (500–599) | 3 | 5 s / 15 s / 45 s | `failed` |
| `llm_invalid_json` | 1 Re-Prompt mit Schema-Injektion | 0 s | `failed` |
| `parse_error` (kreuzberg) | 0 | — | `failed` (manueller Retry möglich) |
| `embedding_failed` | 2 | 10 s / 30 s | `completed_partial` |
| `transcription_failed` | 1 | 30 s | `failed` |
| `state_lock_timeout` | 3 | 1 s / 3 s / 10 s | `failed` |

---

## I. Dokument-Lifecycle: Delete / Update / Replace

### 🎯 Soll
**Delete (Default — sanft):** Source-ID aus allen State-Items entfernen (`source_document_ids` Array). Re-Komposition-Regel pro Item: siehe unten. Qdrant-Vektoren des Docs werden gelöscht. Doc-File wird soft-deleted (`archived_at` gesetzt, nicht hard-removed). Diff-Preview-Modal vor Bestätigung.

**Delete (alternativ — Git-Revert):** Hard-Rollback auf State-Version vor Upload. Verwirft alle Änderungen die seit dem Upload kamen — gefährlich, klar als „Auf Vorversion zurücksetzen" benannt mit Warnung. Nur als expliziter Modal-Switch.

**Replace (v2 statt v1):** Zwei-Phasen-Flow:
1. *Simulation*: Backend lädt v2 hoch, parsed + extrahiert, berechnet hypothetischen State-Merge. Liefert Diff-Preview zurück (`{additions, removals, modifications}`).
2. *Commit*: User bestätigt → v1 wird archiviert, Source-IDs auf v2 umgepointet, Diff committet, neuer Changelog-Eintrag mit `triggered_by=replace`.

**Undo:** 30 s Toast nach Delete → Re-Insert + Source-IDs restoren + Qdrant Re-Index.

### 📍 Ist
- `DELETE /api/projects/{id}/documents/{doc_id}` existiert (Annahme — bestätigen via `routers/documents.py`).
- **Kein** State-Rollback bei Delete.
- **Kein** Replace-Flow.
- Git-Repo pro Projekt vorhanden (`storage/projects/{id}/git/state.json`) — Revert technisch trivial.
- **Kein** Undo-Toast.

### ✅ Checkliste
- [ ] DB: `documents.replaces_document_id` FK (nullable, self-referential).
- [ ] DB: `documents.archived_at` Timestamp; List-Endpoint filtert default `archived_at IS NULL`.
- [ ] Delete-Endpoint Default = Sanft. Optional Query `?strategy=git_revert` für Hard-Variante.
- [ ] Re-Komposition-Regel pro Item nach Source-Removal:
  - Wenn `source_document_ids` nach Removal leer **UND** Item nicht via Chat-Mutation/manuell geändert → Item wird entfernt.
  - Wenn `source_document_ids` leer **UND** Item hat `last_modified_source` ∈ `{chat:*, manual:*}` → Item bleibt mit Source `orphaned:{deleted_doc_id}`, UI markiert „Quell-Dokument gelöscht".
  - Wenn `source_document_ids` nach Removal noch ≥ 1 Eintrag → Item bleibt unverändert.
- [ ] `state_items.last_modified_source` als implizites Tracking (im JSON: `source_document_ids: [...]` + `last_modified_source: "..."`).
- [ ] Replace-Endpoint Phase 1: `POST /api/projects/{id}/documents/{doc_id}/replace?dry_run=true` → Diff-Preview ohne State-Commit.
- [ ] Replace-Endpoint Phase 2: `POST /api/projects/{id}/documents/{doc_id}/replace` → Commit.
- [ ] UI: Document-Card-Menü mit „Ersetzen…" + „Löschen…" → öffnet Modal mit Diff-Preview-Vorschau (additions grün, removals rot, modifications gelb).
- [ ] 30 s Undo-Toast nach Delete (Re-Insert + Source-IDs restoren + Qdrant Re-Index).
- [ ] Cascade-Behandlung beim Delete:
  - Qdrant-Vektoren: hart löschen.
  - `pipeline_logs`: behalten (Audit-Trail).
  - `change_session_documents`: behalten (historische Aggregation).
  - `chat_messages.state_version`: unverändert (Messages sind immutable, zeigen nur dezentes „Quell-Doc gelöscht"-Badge bei Tool-Use-Pillen die diese Doc-ID referenzieren).

### ⚖️ Decisions
- **Default-Delete = Sanft.** Git-Revert nur als expliziter Modal-Switch mit Warnung „Verwirft auch alle Änderungen seit Upload".
- **Replace = Zwei-Phasen.** Garantiert Diff-Preview vor Commit, kein blindes Überschreiben.
- **Orphaned-Items.** Chat- oder manuell-geänderte Items überleben Doc-Delete als „verwaist" sichtbar — Prinzip 6 (Quelle pro Info) erlaubt diese Ausnahme weil User-Intent dokumentiert ist.

---

## J. Briefing & Context-Window

### 🎯 Soll
Compiled Briefing = aktueller System-Prompt für Chat. **Soft-Limit 1000 Token** (sichtbarer Hinweis bei Überschreitung), **Hard-Cap 1500 Token** (nie überschreiten). Bei Überschreitung: Priorisierungs-Strategie (default unten, projekt-overrideable). Custom-Felder werden gekürzt. Briefing wird nur regeneriert wenn State-Version sich seit letztem Briefing geändert hat (Caching). Briefing-Token-Count steht in DB pro Version.

### Default-Priorisierungs-Reihenfolge
1. Offene Blocker (alle, sind kritisch)
2. Offene Tasks (max 10, sortiert nach Deadline asc)
3. Nächste 3 Deadlines
4. Letzte 5 Decisions (chronologisch absteigend)
5. Top-5-Kontakte (nach Anzahl Source-Docs)
6. Custom-Felder (gekürzt auf ~50 Token pro Feld)
7. Dynamic Sections (Top 3 Items pro Sektion)

Projekt-Setting `briefing_priority_order` (JSONB) kann Reihenfolge überschreiben.

### 📍 Ist
- `services/briefing.py::render_briefing` rendert Markdown ohne Token-Limit.
- Wird nach State-Persist in Pipeline-Step 8 (enrich) generiert ✓.
- **Keine** Token-Count-Erfassung.
- **Keine** Truncation-Strategie.
- **Keine** Priorisierung — schlicht alles raus.
- **Kein** Caching (jeder Pipeline-Run regeneriert).

### ✅ Checkliste
- [x] Auto-Render nach State-Merge.
- [x] Wird im Chat-System-Prompt eingebettet.
- [ ] Token-Counter pro generiertem Briefing (tiktoken `cl100k_base` für GPT-Modelle, fallback `len(text) / 4`).
- [ ] Truncation-Strategy implementiert mit Default-Priorisierung oben.
- [ ] `projects.briefing_priority_order` JSONB-Spalte (nullable, default = NULL = Default-Reihenfolge).
- [ ] `projects.briefing_token_count` Integer.
- [ ] `projects.briefing_was_truncated` Boolean.
- [ ] `projects.briefing_state_version` Integer (für Caching: regeneriere nur wenn `current_state.version > briefing_state_version`).
- [ ] Caching-Skip in Pipeline-Step 8: wenn State-Version unverändert seit letztem Briefing → skip render, log „briefing_cached".
- [ ] UI zeigt Briefing-Größe + Truncation-Hinweis als Badge im Status-Block-Footer.
- [ ] Per-Item-Source-Reference im Briefing (siehe Sektion F).
- [ ] Settings-Page für `briefing_priority_order` (drag-sortierbare Liste).

---

## K. Token-Budget & Kosten-Transparenz

### 🎯 Soll
Pro Chat-Message: Token-Verbrauch (Input + Output) + USD-Schätzung sichtbar als dezente Subzeile. Pro Pipeline-Run: kumulierte Kosten pro Doc. Pro Projekt: Gesamt-Verbrauch in einer Settings-Sub-Page mit Tages-/Modell-Auflösung. Pricing-Tabelle ist statisch im Code (Source of Truth) + optionaler Live-Refresh über LiteLLM/Helicone API. Optional pro Projekt: monatlicher Budget-Cap mit Soft-Warning bei 80 % und Hard-Block neuer Operations bei 100 %. Laufende Pipelines/Chats dürfen abschließen.

### 📍 Ist
- **Komplette Lücke.** Kein Tracking in `llm.py`, kein Feld in `chat_messages`, kein Endpoint, kein UI.

### ✅ Checkliste
- [ ] `llm.py` extrahiert `usage.prompt_tokens` + `usage.completion_tokens` aus Response (OpenAI-kompatible Schema).
- [ ] `chat_messages.token_usage` JSONB (`{prompt, completion, model, cost_usd, purpose}` — purpose ∈ `chat|title|tool_call`).
- [ ] `documents.extraction_token_usage` JSONB.
- [ ] Pricing-Modul `agent_config.PRICING`: `{model_id: {input_per_1k: 0.0025, output_per_1k: 0.01}}`. Editor-friendly Python-Dict.
- [ ] Optional Live-Refresh: `scripts/refresh_pricing.py` zieht Daten von LiteLLM oder Helicone-API in eine cache-DB-Tabelle `pricing_cache`. Fallback bei Network-Fail = statisches Modul.
- [ ] Aggregations-Endpoint `GET /api/projects/{id}/usage?period=30d` → `{daily: [...], by_model: [...], by_purpose: [...]}`.
- [ ] UI: pro Chat-Message kleine Subzeile (`gpt-4o · 1.2k in · 380 out · ≈ $0.012`).
- [ ] Cockpit: Status-Block-Footer optional `Verbrauch heute: $0.42`.
- [ ] Settings-Seite mit Verbrauchsdiagramm (Bar pro Tag, Stack pro Modell).
- [ ] Settings-Seite zeigt „Diese Woche: gpt-4o $0.42 — hypothetisch mit claude-haiku $0.08" als Power-User-Anreiz für Modell-Switch.
- [ ] `projects.monthly_budget_usd` Decimal nullable.
- [ ] Soft-Warning Toast bei 80 % monatlich erreicht.
- [ ] Hard-Block: bei 100 % wirft `llm.complete()` `BudgetExceededError` **am Anfang neuer Operations**. Laufende Pipelines/Chats schließen ab (sonst korrupter State).
- [ ] Telemetry-Aggregation läuft als ARQ Cron stündlich → cached pro Projekt für schnelles UI-Rendering.

---

## L. Format-Support: EML / Audio / Bilder

### 🎯 Soll
**EML:** Direkt parsen (eml-parser oder mailparser). Subject + From + To + Date + Body extrahieren. Attachments werden als separate Sub-Dokumente mit `parent_document_id = EML-ID` indiziert und rekursiv durch die Pipeline geschickt.

**Audio:** Upload (mp3/m4a/wav/ogg) → Whisper-Transkription. **Default-Provider = `local`** (whisper.cpp lokal, Self-hosted-Prinzip wahrt). Opt-in für `openai` mit klarer Datenschutz-Warnung in Settings. Original-Audio + Transkript koexistieren in einem Document (zwei Repräsentationen). Pipeline-Step `transcribe` vor `parsing`.

**Bilder:** PNG / JPG / WEBP. OCR via Kreuzberg (bereits installiert) — Pipeline erkennt `mimetype.startswith("image/")` automatisch. Bild bleibt als Vorschau verfügbar. HEIC nur wenn explizit gewünscht (braucht pyheif, zusätzliche System-Lib).

### 📍 Ist
- `routers/documents.py:34-36` ALLOWED-Liste: nur Doc/Text/Office.
- `kreuzberg` ist installiert und unterstützt laut Doku PDF + Office + Bilder via OCR — **OCR-Pfad in Pipeline nicht wired**.
- Whisper: kein Code.
- EML: kein Code.

### ✅ Checkliste
- [ ] ALLOWED erweitert: `eml, png, jpg, jpeg, webp, mp3, m4a, wav, ogg`.
- [ ] HEIC als Phase-5b-Add wenn iOS-Workflow konkret nachgefragt.
- [ ] EML-Parser-Service `services/email_parser.py` → strukturiertes `{subject, from, to, date, body, attachments[]}` → in Plain-Text-Format für Pipeline.
- [ ] DB: `documents.parent_document_id` FK (nullable, self-ref). Attachments setzen Parent = EML-Doc.
- [ ] DB: `documents.source_format` Enum-Spalte (`pdf|docx|txt|md|eml|image|audio|spreadsheet|text|...`).
- [ ] Image-OCR-Service via Kreuzberg — Pipeline-Step erkennt MIME-Type.
- [ ] Audio-Step: neuer Pipeline-Step `transcribe` (vor `parsing`). Setting `WHISPER_PROVIDER = "local"|"openai"|"off"`, Default `local`.
- [ ] Local Whisper: bundled mit Docker-Image (whisper.cpp + small.de Modell, ~500 MB).
- [ ] OpenAI Whisper opt-in: Settings-Page zeigt Warnung „Audio verlässt deine Infrastruktur. Daten gehen an OpenAI." mit explizitem Checkbox-Confirm.
- [ ] Audio bleibt als `storage/projects/{id}/{uuid}.m4a`; Transkript-Text in `documents.extracted_text`. **Ein Document** mit `source_format=audio` + zwei Repräsentationen.
- [ ] Pro Format ein Test-Fixture in `tests/fixtures/`.
- [ ] Frontend DocumentCard zeigt format-spezifisches Icon (Mail / Mic / Image / FileText).
- [ ] Pipeline-Card zeigt extra Step „Transkribieren" bei Audio (auch in 4-Phasen-Default sichtbar als zusätzliche Phase 0).

### ⚖️ Decisions
- **Whisper-Default = local.** Self-hosted-Prinzip. Cloud-Whisper opt-in mit Datenschutz-Warning.
- **EML-Attachments als Sub-Dokumente.** Parent-FK ermöglicht UI-Gruppierung („Mail mit 3 Anhängen") ohne flache Dokumenten-Liste zu verwässern.
- **HEIC ausgeschlossen für v1.** Reaktiv nachziehen wenn iOS-Workflow konkret.
- **Audio = ein Document, zwei Repräsentationen.** Verhindert dass UI-Listen mit Audio + Transkript-Duplikat zugemüllt werden.

---

## M. Onboarding & Multi-Projekt-Navigation

### 🎯 Soll
**Fresh-Install-Onboarding:** Wenn `get_active_provider()` 503 → Auto-Redirect auf `/onboarding`. 3-Schritt-Wizard:
1. Provider konfigurieren (OpenRouter Key oder Azure OpenAI).
2. Modell-Test-Button („Verbindung testen") — macht 1-Token-Roundtrip und reportet Latenz + Cost.
3. Erstes Projekt anlegen + erste Datei hochladen.

**Multi-Projekt-Navigation:** AppSidebar links mit Liste aller nicht-archivierten Projekte, „+ Neues Projekt"-Button oben. Klick wechselt Projekt im Cockpit ohne Page-Reload. Sidebar collapsible (Icon-only Mode), State persistent in localStorage. Archivierte Projekte unter „Archiv" Sub-Sektion (collapsed default).

### 📍 Ist
- `AppSidebar.tsx` existiert ✓ (genaues Verhalten unverifiziert).
- Demo-User wird auto-erstellt ✓ (`demo@openmp.ai / passwort` per main.py startup).
- Provider-Setup-Page unter `/settings` vorhanden (provider_config.py / app_settings.py).
- **Kein** Onboarding-Wizard.
- **Kein** „Provider-Verbindung testen"-Button.
- **Keine** Projekt-Archivierung.

### ✅ Checkliste
- [x] Demo-User auto-Seed.
- [x] AppSidebar mit Projekt-Liste.
- [x] Settings-Page für Provider.
- [ ] First-Login-Check: API liefert `503 no_active_llm_provider` → Frontend redirected auf `/onboarding` statt Error-Banner.
- [ ] Onboarding-Page 3-Step-Wizard (Provider → Test → Projekt+Upload).
- [ ] „Verbindung testen"-Button macht 1-Token-Call (`prompt: "ok"`, `max_tokens: 1`) und reportet Latenz + Cost ($0.000…).
- [ ] Sidebar collapsible mit `ChevronLeft` Toggle, Zustand in localStorage (`sidebar_collapsed`).
- [ ] Sidebar-Badge pro Projekt: kombiniert (a) Anzahl aktiver Pipelines (Pulsing-Dot), (b) Anzahl failed Docs (rot), (c) Anzahl ungelesener State-Änderungen seit `user_project_views.last_seen_at`.
- [ ] DB: `user_project_views` (user_id, project_id, last_seen_at) — wird beim Cockpit-Mount aktualisiert.
- [ ] DB: `projects.archived_at` Timestamp nullable.
- [ ] Sidebar-Sub-Sektion „Archiv" (collapsed default) zeigt archivierte Projekte.
- [ ] Projekt-Header-Menü: „Archivieren" + „Aus Archiv holen".
- [ ] „+ Neues Projekt"-Button oben in Sidebar, öffnet Modal mit Name + optional Beschreibung.
- [ ] Mobile: Sidebar als Drawer (Hamburger oben links).

---

## N. Clipboard-Paste

### 🎯 Soll
Ctrl+V auf der Cockpit-Seite:
- **Bild im Clipboard** → Upload als `screenshot-{YYYY-MM-DD-HHmmss}.png`, Standard-Pipeline.
- **Text im Clipboard** (> 200 Zeichen) → öffnet TextPasteModal mit vorbefülltem Text + auto-Titel (erste 60 Zeichen).
- **Text im Clipboard** (≤ 200 Zeichen) **UND** Chat-Input fokussiert → Standard-Paste in Chat-Input.
- **Text im Clipboard** (≤ 200 Zeichen) **UND** Chat-Input nicht fokussiert → trotzdem TextPasteModal (kurze Notiz auch ein Dokument wert).

Im Chat-Input: Paste eines Bildes hängt es als Anhang an die Nachricht (siehe Sektion B).

### 📍 Ist
- `TextPasteModal.tsx` existiert, aber nur per Button erreichbar.
- **Kein** globaler Paste-Listener.
- **Kein** Bild-Paste-Handling.

### ✅ Checkliste
- [x] TextPasteModal existiert.
- [ ] Globaler `onPaste` Handler im Cockpit (page-level), stoppt nicht Propagation in editable Elements.
- [ ] Bild-Paste → File-Konstruktion aus `ClipboardItem.getType("image/png")` → uploadFile. Dateiname-Format `screenshot-{YYYY-MM-DD-HHmmss}.png`.
- [ ] Text-Paste-Schwelle: 200 Zeichen — gewählt weil typischer Slack/Mail-Schnipsel-Schnitt darüber liegt; konfigurierbar via Project-Setting `paste_threshold_chars` (Default 200).
- [ ] Conflict-Detection: Chat-Input fokussiert + Text ≤ 200 → normales Paste. Bild fokussiert oder Text > 200 → Modal.
- [ ] Bild-Paste im Chat-Input hängt Bild als Anhang (siehe Sektion B Datei-Anhang-Flow).
- [ ] Mehrere Bilder im Clipboard (z.B. via Browser-Auswahl) → mehrere Uploads.

---

## O. Slash-Commands

### 🎯 Soll
Im Chat-Input erkennen wir `/` am Zeilenanfang → Autocomplete-Dropdown filterbar. Commands führen lokale Frontend-Logik aus, **ohne LLM-Roundtrip** → kostet null Token. `/search` ist Ausnahme (Qdrant-Backend-Call ohne LLM-Wrapper).

| Command | Aktion | LLM? |
|---|---|---|
| `/status` | Rendert aktuellen Core-State inline | nein |
| `/tasks` | Listet offene Tasks (sortiert nach Deadline) | nein |
| `/deadlines` | Listet anstehende Deadlines, gefolgt von Overdue | nein |
| `/blockers` | Listet offene Blocker | nein |
| `/contacts` | Listet Kontakte | nein |
| `/search <query>` | Direkter Qdrant-Query, rendert Treffer als Liste | nein (Embedding-Call ja, LLM-Wrapper nein) |
| `/export` | Triggert Markdown-Download (siehe Sektion U) | nein |
| `/cancel` | Bricht laufende Pipelines im Projekt ab | nein |
| `/clear` | Schließt aktive Chat-Session, startet neue | nein |
| `/version` | Zeigt aktuelle State-Version + letzten Changelog-Eintrag | nein |
| `/help` | Listet alle Commands | nein |

### 📍 Ist
- **Nicht implementiert.**

### ✅ Checkliste
- [ ] Slash-Command-Registry als Frontend-Module `frontend/src/lib/slash-commands.ts` mit Handler-Funktionen.
- [ ] Autocomplete-Popover über Chat-Input (Trigger: `/` als erstes Zeichen, schließt bei Space + Argument-Start).
- [ ] Tab / Enter wählt Command aus, scrollt mit Pfeiltasten.
- [ ] Argument-Parsing (`/search foo bar` → query="foo bar").
- [ ] Render-Logik pro Command: erzeugt eine assistant-style Message inline ohne API-Call. Markierung als `local_command` damit klar ist dass es kein LLM-Output war.
- [ ] `/search` macht direkten `POST /api/projects/{id}/search` (Embedding der Query + Qdrant-Lookup, kein Chat-Endpoint).
- [ ] `/cancel` ruft pro laufender Pipeline `DELETE /api/projects/{id}/documents/{doc_id}?cancel_pipeline=true`.
- [ ] `/clear` ruft `POST /api/projects/{id}/chat/sessions` (neue Session) und switched UI.
- [ ] `/help` zeigt formatierte Tabelle aller Commands.
- [ ] Slash-Command-Messages erscheinen mit dezenter Markierung „lokal" + zero token-cost subzeile.

---

## P. Keyboard-Navigation

### 🎯 Soll
Plattform-Konvention: Mac = Cmd, Linux/Windows = Ctrl. Alle Shortcuts dual gebunden.

| Shortcut | Aktion |
|---|---|
| Cmd/Ctrl+K | Globale Suche (Spotlight-Stil über Projekte/Chats/Dokumente) |
| Cmd/Ctrl+N | Neuer Chat in aktivem Projekt |
| Cmd/Ctrl+/ | Slash-Command-Cheat-Sheet öffnen |
| Cmd/Ctrl+B | Sidebar toggle |
| Cmd/Ctrl+Enter | Chat-Senden (im Input) |
| **Esc (1×)** | Wenn Input fokussiert → unfokussieren. Wenn Modal offen → Modal schließen. |
| **Esc (2×)** | Wenn Chat fullscreen offen → Chat schließen, zurück zum Cockpit. |
| Cmd/Ctrl+, | Settings öffnen (Mac-Konvention, auf allen Plattformen aktiv) |
| Cmd/Ctrl+U | File-Picker-Dialog öffnen |
| Cmd/Ctrl+Shift+A | Projekt archivieren (mit Confirm) |

### 📍 Ist
- `CommandPalette.tsx` existiert ✓ — Verhalten unbestätigt.
- Cmd+1/2/3 für Tab-Switch (entfällt nach Single-Page-Refactor).
- **Kein** Cmd+N, Cmd+K, Cmd+B Mapping bestätigt.

### ✅ Checkliste
- [x] CommandPalette-Komponente vorhanden.
- [~] Cmd+1/2/3 Navigation (deprecated, entfernt nach Cockpit-Migration).
- [ ] Cmd+K öffnet CommandPalette mit Such-Modus (Projekte + Chats + Dokumente).
- [ ] Cmd+N startet neue Chat-Session.
- [ ] Cmd+B toggled Sidebar.
- [ ] Esc zweistufig: erstes Esc unfokussiert Input → zweites Esc schließt Chat. Modal hat Vorrang.
- [ ] Cmd+, öffnet Settings (auch unter Linux/Windows, weil Konsistenz wichtiger als reine Plattform-Konvention).
- [ ] Cmd+U triggert File-Picker.
- [ ] Cmd+/ als Modal mit Shortcuts-Cheat-Sheet.
- [ ] Conflict-Vermeidung: Shortcuts feuern nicht wenn IME-Composing (Asiatische Sprachen) aktiv.
- [ ] Shortcuts global registriert in `frontend/src/lib/keybindings.ts` (eine Quelle der Wahrheit).

---

## Q. Session / Auth-Lifecycle

### 🎯 Soll
JWT (Access-Token) mit 24 h TTL + Refresh-Token mit 30 d TTL. Silent Refresh 5 min vor JWT-Ablauf. Bei Refresh-Fail während Chat: Toast „Sitzung abgelaufen — bitte neu einloggen", letzte ungeschickte Message wird im localStorage gepuffert und nach Re-Login automatisch gesendet. Multi-Tab-safe.

### Migration
- **Phase 1 (schnell):** Refresh-Token im localStorage. Kompatibel mit aktueller JWT-Store-Architektur.
- **Phase 2 (sicher):** Refresh-Token wandert in HttpOnly-Cookie + SameSite=Lax. Access-Token bleibt im Memory (`authStore`). Erfordert CSRF-Schutz für refresh-Endpoint.

### 📍 Ist
- HS256 JWT mit Redis-Blocklist für Logout ✓ (siehe CLAUDE.md).
- JWT im `authStore` (localStorage, persisted).
- Demo-User auto-erstellt ✓.
- TTL aktuell unbekannt — bestätigen in `auth.py`.
- **Kein** Refresh-Token-Flow.
- **Kein** Silent-Refresh.
- **Kein** Message-Puffer bei Token-Expiry.

### ✅ Checkliste
- [x] JWT + Blocklist.
- [ ] Phase 1: Refresh-Token-Modell (`refresh_tokens` Tabelle: id, user_id, expires_at, revoked_at, last_used_at).
- [ ] Phase 1: `POST /auth/refresh` Endpoint (input: refresh_token; output: neues JWT).
- [ ] Phase 1: `authStore` persistiert Refresh-Token im localStorage.
- [ ] Phase 1: Frontend Refresh-Timer 5 min vor JWT-Ablauf (`exp` claim).
- [ ] 401-Interceptor im `lib/api.ts` versucht Silent-Refresh; bei Erfolg Request retryen mit neuem Token.
- [ ] Bei finalem Auth-Fail: Toast + Message-Puffer in localStorage (`pending_chat_messages` Map, Key = `{project_id}:{session_id}:{timestamp}`) + Redirect Login.
- [ ] Nach Re-Login: Puffer-Inhalt für aktuelles Projekt wird beim Mount automatisch durch-iteriert (älteste zuerst).
- [ ] Multi-Tab: Puffer-Key inkludiert Timestamp → Last-Write-Wins-Race vermieden. Bei Refresh wird zentral via `BroadcastChannel` zwischen Tabs synchronisiert (vermeidet 5 parallele Refresh-Calls).
- [ ] Logout invalidiert Refresh-Token (DB-Update `revoked_at = now()`).
- [ ] Phase 2: Refresh-Token wandert in HttpOnly-Cookie. CSRF-Token in Response-Header.

---

## R. Notifications & Recovery

### 🎯 Soll
**Toast (in-app):** Erfolg / Info / Fehler (sonner schon vorhanden).
**Browser-Notification (opt-in):** Bei Pipeline-Abschluss wenn Tab nicht fokussiert → System-Notification. Funktioniert ohne Service-Worker via Web Notifications API direkt (Tab muss noch existieren).
**Tab-Close-Recovery (v2, optional):** Wenn echte Tab-Close-Toleranz nötig → später Service-Worker. Für v1 verzichten — komplex, browser-unzuverlässig, schmaler Use-Case.

### 📍 Ist
- `sonner` Toast-Lib im Frontend ✓ (siehe DropZone.tsx).
- **Kein** Browser-Notification-Permission-Flow.
- **Kein** Service-Worker.

### ✅ Checkliste
- [x] Toast-Infra.
- [ ] Settings-Page: einzelner „Browser-Notifications aktivieren"-Button. Klick triggert `Notification.requestPermission()`. Bei `granted` → Status-Anzeige „aktiv".
- [ ] Pipeline-Complete-Hook im Frontend (im `useProjectSSE`): wenn `document.hidden === true` und Permission `granted` → `new Notification("OpenPM", {body: "brief.pdf fertig — 3 Tasks extrahiert", icon, tag: project_id})`.
- [ ] `tag` parameter verhindert Stacking gleicher Projekt-Notifications.
- [ ] Notification-Click handler: fokussiert Tab + scrollt zum Doc-Card (window.focus + DOM-anchor).
- [ ] Multi-Projekt: pro Projekt eigener Notification-Tag.
- [ ] Failed-Pipeline-Notification rot-Akzent (per `requireInteraction: true` damit User es sieht).

### ⚖️ Decisions
- **Kein Service-Worker für v1.** Web Notifications API direkt reicht. Service-Worker erst wenn echte Tab-Close-Tolerance gewünscht — dann eigene Roadmap-Item.

---

## S. Bulk-Upload-Verhalten

### 🎯 Soll
Bei 5+ gleichzeitig hochgeladenen Dateien: Datei-Zeilen unter Gruppen-Header `5 Dateien hochgeladen`. Live-Feed aggregiert Counts (`2 von 5 fertig · 1 Fehler`). Gruppe expandierbar auf Einzel-Ebene. Pipeline läuft trotzdem pro Doc (Backend unverändert), nur die UI gruppiert. Gruppen-Bildung nutzt **ChangeSession** (Backend hat das schon) statt Frontend-Heuristik.

### 📍 Ist
- Pro-Datei-Cards solide (`DocumentCard`).
- Pipeline-Store hält `pipelines[docId]` Map ✓.
- ChangeSession-Modell aggregiert Burst-Uploads im Backend ✓.
- **Keine** Gruppen-Aggregation in UI.

### ✅ Checkliste
- [x] Pro-Doc-Tracking.
- [x] Backend ChangeSession existiert.
- [ ] `BulkUploadGroup` Komponente: gruppiert Docs nach `change_session_id` (vom Backend geliefert, nicht Frontend-Heuristik).
- [ ] Schwelle: Gruppen-Anzeige aktiv ab ChangeSession-Member-Count ≥ 5. Konfigurierbar via `frontend/src/lib/ui-config.ts`.
- [ ] Group-Header mit Live-Counts (`processing`, `done`, `failed`).
- [ ] Klick auf Header expandiert zu Einzelzeilen.
- [ ] Status-Block animiert summen alle Items der Gruppe.
- [ ] ChangeSession schließt nach 30 s ohne neuen Upload (Backend-seitig) → Gruppe wird im UI als „abgeschlossen" markiert.
- [ ] Aggregierte Extraction-Summary nach Session-Close (`8 neue Tasks, 3 Deadlines aktualisiert, 2 Fehler`).

---

## T. Stale Detection

### 🎯 Soll
Cron-Job (ARQ) läuft 1× täglich:
- Markiert abgelaufene Deadlines als `overdue`.
- Markiert Projekte ohne Upload > 14 Tage als `stale`.
- Generiert eine **statische Notiz** (kein LLM-Call, kein Token-Kosten) die als System-Banner über dem Cockpit erscheint: „Letzter Upload vor 18 Tagen. 2 Deadlines überfällig."

### 📍 Ist
- ARQ Worker existiert; `close_idle_change_sessions` als Beispiel-Cron-Task vorhanden (pipeline.py:248).
- **Keine** Deadline-Stale-Logik.
- **Keine** Project-Stale-Flag.

### ✅ Checkliste
- [ ] ARQ Cron-Task `mark_stale_deadlines` (täglich, 06:00 UTC).
- [ ] `state.core.deadlines[i].status = "overdue"` automatisch wenn `date < today`.
- [ ] `projects.last_activity_at` Spalte (Update bei jedem Doc-Upload + jeder Chat-Message).
- [ ] `projects.stale_marker` Boolean (true wenn `last_activity_at > 14 Tage`).
- [ ] Cockpit-Banner (über Status-Block) wenn `stale_marker = true`: statischer Template-Text mit Counts, dismissable per X-Button (Dismissal in `user_project_views`).
- [ ] Status-Block-Summary zeigt überfällige Deadlines explizit rot.
- [ ] Kein LLM-Call für Stale-Briefing. Template hardcoded in `services/stale_notice.py` (German + English).

---

## U. Export

### 🎯 Soll
- **State als Markdown:** `/export` Slash-Command oder Settings-Button → lädt `briefing.md` herunter.
- **Chat als Markdown:** Pro Session ein Export-Button → `chat-{title}-{date}.md`.
- **Voller Projekt-Snapshot (ZIP):** Da OpenPM auf Source-Backlinks lebt, muss ein Snapshot die Original-Dokumente enthalten — sonst ist der State ohne Bezug. ZIP ist kein optionales Add, sondern die *richtige* Export-Form für Compliance/Übergabe.

### ZIP-Layout
```
project-{slug}-{YYYY-MM-DD}.zip
├── README.md                    # erklärt Inhalt + Generierungs-Datum
├── briefing.md                  # rendered briefing
├── state.json                   # vollständiger State (current version)
├── state-history.json           # alle Versionen + Changelog
├── documents.csv                # Tabelle: id, filename, format, uploaded_at, source_count
├── documents/
│   ├── {original-filename-1}    # mit Original-Bytes
│   └── {original-filename-2}
└── chats/
    ├── {session-title-1}-{date}.md
    └── {session-title-2}-{date}.md
```

### 📍 Ist
- **Komplett fehlend.**

### ✅ Checkliste
- [ ] `GET /api/projects/{id}/export/briefing.md` (Content-Type text/markdown).
- [ ] `GET /api/projects/{id}/chat/sessions/{sid}/export.md`.
- [ ] `GET /api/projects/{id}/export.zip` (streamt zip via `aiozipstream` o.ä.).
- [ ] ZIP-Generation läuft als ARQ-Job (bei großen Projekten > 100 MB), Status-Polling via `GET /api/projects/{id}/export.zip/status`.
- [ ] Frontend-Buttons in Settings-Page + Status-Block-Footer.
- [ ] Slash-Command `/export` triggert briefing.md Download direkt.
- [ ] „Voll-Export"-Button öffnet Confirm-Modal (Größenwarnung) und triggert ARQ-Job.

---

## V. Animationen & Timing-Disziplin

### 🎯 Soll
Konsistente Timings über das ganze System:

| Pattern | Dauer | Easing |
|---|---|---|
| Expand / Collapse | 250–300 ms | ease-out |
| Fade-In neue Elemente | 150 ms | ease-in |
| Count-Up (Zahlen) | 200 ms | ease-out |
| Highlight-Flash (State-Update) | 500 ms | ease-in-out |
| Pulse (Processing) | 1500 ms Loop | ease-in-out |
| Auto-Collapse nach Upload | 3 s Delay + 300 ms Collapse | ease-out |
| Chat öffnen / schließen | 300 ms | ease-out |

Keine bounce/elastic/spring-Easings.

### 📍 Ist
- Tailwind `transition-default` als Standard (siehe `globals.css`).
- Tatsächliche Werte und Konsistenz nicht zentral dokumentiert / erzwungen.
- Count-Up + Highlight-Flash + Auto-Collapse → vermutlich noch nicht implementiert.

### ✅ Checkliste
- [ ] `tailwind.config` mit Custom-Easing-Tokens + Duration-Tokens (`duration-expand`, `duration-pulse`, etc.).
- [ ] CSS-Variable `--timing-expand: 300ms`, `--timing-pulse: 1500ms` etc.
- [ ] CountUp-Komponente (animiert von alter zu neuer Zahl via requestAnimationFrame).
- [ ] Pulse-Klasse mit definiertem Keyframe `@keyframes pipeline-pulse`.
- [ ] Highlight-Flash-Hook (`useFlashOnChange(value)` → fügt Klasse für 500 ms hinzu).
- [ ] Visuelle Tests nur für **Start- und End-State** (Playwright Screenshot vor Trigger + nach Animationsende). Keine Mid-Animation-Frames (flaky pro GPU/Browser).
- [ ] `prefers-reduced-motion`-Media-Query respektieren: Animationen auf 0 ms reduzieren wenn User OS-Setting hat.

---

## W. Nicht-funktionale Anforderungen

### 🎯 Soll
- **Self-hosted** (Docker Compose, Hetzner).
- **Tests:** Kritische Pfade vollständig abgedeckt (Pipeline-Steps, State-Mutations, Auth-Flow, Source-Attribution-Migration). Coverage ≥ 80 % als Heuristik, nicht als Ziel.
- **Migrations:** Alembic, alle Schema-Änderungen reversibel.
- **Logging:** structlog mit Request-ID-Korrelation.
- **Healthcheck:** `/api/health/live` + `/api/health/ready`.
- **Observability:** Latency-Metriken pro Pipeline-Step, Token-Throughput, Failure-Rate. Prometheus-kompatible Endpoint optional.
- **SSE-Connection-Lifecycle:** Persistent über Layout-Wechsel, kein Reconnect bei Cockpit-Section-Switch.
- **Docs:** CLAUDE.md + Provider-Setup + Deployment-Guide aktuell.
- **CI:** GitHub-Actions für Lint + Test + Type-Check.

### 📍 Ist
- Docker Compose mit dev-override ✓.
- Alembic-Migrations ✓.
- structlog ✓.
- Playwright E2E vorhanden [[reference_e2e-suite]] — 3 passing / 2 failing.
- pytest mit asyncio_mode auto ✓.
- CI: unbekannt — `.github/workflows/` check needed.
- Healthcheck: unbekannt.

### ✅ Checkliste — Tests / CI
- [x] Docker Compose dev + prod.
- [x] Alembic.
- [x] structlog.
- [x] Playwright E2E (Auth-Setup + Upload-Pipeline).
- [ ] E2E grün (aktuell 2 failing — siehe [[reference_e2e-suite]]).
- [ ] Pytest Coverage ≥ 80 % als Heuristik. Primärziel: kritische Pfade (Pipeline-Steps, State-Merge, Auth-Refresh, Doc-Delete-Re-Komposition, Source-Migration) explizit testen.
- [ ] GitHub-Actions CI (lint + test + type-check pro PR).
- [ ] Pre-commit Hook (ruff + mypy + eslint).

### ✅ Checkliste — Observability
- [ ] `/api/health/live` (200 wenn Prozess läuft).
- [ ] `/api/health/ready` (testet LLM-Provider + Redis + Qdrant + DB).
- [ ] Prometheus-Endpoint `/metrics` mit Histogrammen pro Pipeline-Step-Duration.
- [ ] Counter: `extraction_total{model, status}`, `chat_messages_total{model}`, `pipeline_errors_total{error_class}`.
- [ ] Optional Grafana-Dashboard-Template als `.json` im Repo (`ops/grafana/`).

### ✅ Checkliste — Deployment / Docs
- [ ] Deployment-Guide (Hetzner Cloud-VPS-Setup mit Docker Compose, Let's Encrypt, Caddy als Reverse-Proxy).
- [ ] Update-Guide (`docker compose pull && docker compose up -d` + Alembic-Migration-Step).
- [ ] Provider-Setup-Guide für OpenRouter und Azure OpenAI separat.
- [ ] CLAUDE.md aktuell.

### Backup-Strategie (eigener Mini-Abschnitt — wegen Self-hosted-Anforderung)
- [ ] Daily-Backup-Skript (`scripts/backup.sh`): `pg_dump`, Qdrant-Snapshot (`/snapshots` API), tar von `storage/`.
- [ ] Zielort konfigurierbar via `.env`: lokales Verzeichnis (Default), optional S3-kompatibler Object-Storage (z.B. Hetzner Storage Box / Backblaze B2).
- [ ] Retention: 7 daily / 4 weekly / 12 monthly.
- [ ] Restore-Anleitung als Markdown im Deployment-Guide.
- [ ] Optional als ARQ-Cron-Task im Worker bei Single-Node-Deploy.

---

## 3. Cross-Cutting Concerns

### Empty States (zentral definiert, in allen Sektionen referenziert)

| Bereich | Empty-Zustand-Text |
|---|---|
| Dokumente | „Dokumente hier ablegen oder über den Upload-Button hinzufügen." + Drag-Highlight |
| Chat (keine Session) | „Stell eine Frage zu diesem Projekt." + 3 statische klickbare Prompts (siehe B) |
| State | „Der Projektstatus wird automatisch aufgebaut, sobald Dokumente hochgeladen werden." |
| Chat-Archiv | „Noch keine vergangenen Chats. Nutze Cmd+N für einen neuen." |
| Suche (keine Treffer) | „Keine Treffer für ‚{query}'. Andere Begriffe versuchen?" |
| Settings (Provider) | „Kein Provider konfiguriert. Onboarding-Wizard starten." |

### Visuelle Konsistenz
Dark Theme mit Indigo-Akzent. Token-System wird **durchgehend** benutzt — keine hartcodierten Hex-Werte.

| CSS-Variable | Zweck |
|---|---|
| `--bg-base` | App-Hintergrund |
| `--bg-surface` | Karten / Sektion-Container |
| `--bg-elevated` | Inputs / Modals / Buttons |
| `--bg-overlay` | Modal-Hintergrund |
| `--accent` | Indigo-Primary |
| `--accent-subtle` | Indigo-Tint für Backgrounds |
| `--danger` / `--danger-subtle` | Fehler |
| `--warning` | Warnung (Low-Confidence, Overdue) |
| `--text-primary` / `--text-secondary` / `--text-muted` | Text-Hierarchie |
| `--border` / `--border-strong` | Linien |

Cards `rounded-lg`. Borders über `--border`/`--border-strong`. [[feedback_visual-consistency-openpm]]

### Verifikation
Vor jedem „Done"-Claim: Playwright oder Browser-Verify [[feedback_verify-ui-in-browser]]. Type-Check + Lint allein reichen nicht.

### SSE-Quirk
Live-Stream geht **direkt zum Backend** über `NEXT_PUBLIC_API_URL`, nicht über Next.js Dev-Proxy (gzip bricht Streaming). [[project_sse-next-dev-gzip]]

### Backend Python
Immer `source backend/.venv/bin/activate` — System-Python 3.14 ist defekt. [[reference_backend-venv-python]]

---

## 4. Roadmap (Priorisierungs-Vorschlag)

Zeitangaben = **ideal fulltime**. Für Jonas (Werkstudent, nicht fulltime) realistisch ~2× ansetzen.

### Phase 1a — Cockpit-Skelett (2-3 Tage, **Hard-Dependency** für alles andere)
Single-Page-Shell ohne Inhalt — vorhandene Sub-Components werden als Sektionen kompositionell wiederverwendet. Ohne diese Basis sind B/D/E/G nicht voll umsetzbar.

1. Cockpit-Page `/projects/[id]/page.tsx` mit Grid-Layout (Status / Docs / Archive / Chat-Input).
2. Sub-Routen entfernen, ProjectTabs.tsx löschen.
3. Anchor-Deep-Link-Logik.

### Phase 1b — UX-Grundbau (2 Wochen)
Auf Cockpit-Skelett aufbauend:
4. Status-Block-Summary + Highlight-Flash (G).
5. Chat-Sessions + Auto-Titel + Archiv-UI (C).
6. Inline-Tool-Pillen + Mutation-Artifact-Cards (B).
7. Slash-Commands + Keyboard-Shortcuts (O, P).
8. Live-Extraction-Feed pro Doc (E).

### Phase 2 — Zuverlässigkeit (1.5 Wochen)
9. Source-Attribution-Schema-Migration + Re-Render (F).
10. Retry-Policy + Error-Klassen + Healthcheck (H).
11. Document-Delete-Re-Komposition + Undo (I).
12. Document-Replace mit Diff-Preview (I).
13. Konflikt-Resolution im Merge (F).

### Phase 3 — Skalierbarkeit (1 Woche)
14. Token-Tracking + Cost-Dashboard (K).
15. Briefing-Token-Cap + Priorisierung + Caching (J).
16. Bulk-Upload-Gruppierung via ChangeSession (S).

### Phase 4 — Format-Expansion (1.5 Wochen)
17. EML-Parser + Image-OCR via Kreuzberg (L).
18. Audio + local-Whisper-Integration (L).

### Phase 5a — UX-Polish (1 Woche)
19. Clipboard-Paste (N).
20. Browser-Notifications (R).
21. Animations-Disziplin (V).

### Phase 5b — Daten-Lifecycle (1 Woche)
22. Export inkl. ZIP-Snapshot (U).
23. Onboarding-Wizard (M).
24. Stale-Detection (T).
25. Backup-Skript + Deployment-Guide (W).

---

## 5. Pflege dieses Dokuments

- Nach jedem PR der ein Sub-Item abhakt → entsprechende Checkbox setzen + Bereich-Score neu berechnen + Gesamt-Score neu summieren.
- Wenn ein neuer Aspekt auftaucht (Bug, Idee, User-Feedback) → neue Sub-Sektion oder Sub-Item.
- Decisions werden nicht gelöscht, sondern ergänzt: `~~Alt~~ → Neu (Grund, Datum)`.
- Score-Update spätestens alle 2 Wochen oder bei größeren Merges.
- Last-update-Stempel ganz oben aktualisieren.

### Score-Helper

Bereich-Score = `(Anzahl [x] + 0.5 × Anzahl [~]) / Total-Items × 100`, gerundet auf 5er-Schritte.

Gesamt-Score = `Σ (Bereich-Score × Gewicht) / 100`.

Quick-Script `scripts/score.py` (TBD):
```bash
python scripts/score.py road_to_perfection.md
# Output:
# A. Cockpit-Layout      10 / 100   (1/10 items)
# B. Chat-Interface      55 / 100   (8/15 items, 2 partial)
# ...
# Gesamt: 40 / 100
```
Parses Markdown-Checklisten + Scorecard-Gewichts-Tabelle, gibt Drift-Warnung wenn Tabellen-Score vom berechneten abweicht > 5 Punkte.
