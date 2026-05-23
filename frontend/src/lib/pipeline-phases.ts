/**
 * Pipeline-Phase labels — die ZENTRALE Quelle der Wahrheit für alle UI-Texte
 * rund um die Verarbeitungs-Pipeline.
 *
 * Die Backend-Pipeline besteht aus 9 technischen Schritten (siehe
 * `backend/app/tasks/pipeline.py`). Wir mappen sie hier auf
 * benutzerfreundliche, deutsche Labels — KEINE technischen Begriffe wie
 * "LLM", "embed" oder "merge" sind im UI sichtbar.
 *
 * Wenn neue Schritte hinzukommen ODER vorhandene umbenannt werden, ist DAS
 * die Datei, die geändert wird.
 */

/** Original Backend-Step → benutzerfreundliches Label (9-Schritt-Modus). */
export const PIPELINE_STEP_LABELS: Record<string, string> = {
  queued: "Wird vorbereitet",
  parsing: "Datei wird gelesen",
  summarize_extract: "Inhalt wird analysiert",
  state_merge: "Mit Projektstatus zusammenführen",
  state_persist: "Status wird gespeichert",
  changelog: "Änderung protokollieren",
  git_commit: "Version festschreiben",
  embed: "Für Suche indizieren",
  briefing: "Briefing aktualisieren",
  // Legacy / aggregierte Phasen (Backend hat sie früher manchmal genutzt).
  enrich: "Für Suche indizieren",
  complete: "Abgeschlossen",
};

/**
 * Default-Phasen-Mapping (kompakter Modus mit 4 Phasen).
 * Wird genutzt, wenn die UI nicht jeden einzelnen Schritt nennen soll, sondern
 * vier grobe Phasen anzeigt.
 */
export const PIPELINE_PHASE_LABELS = {
  read: "Datei wird gelesen",
  analyze: "Inhalt wird analysiert",
  merge: "Status wird zusammengeführt",
  index: "Wird durchsuchbar gemacht",
} as const;

export type PipelinePhase = keyof typeof PIPELINE_PHASE_LABELS;

export const STEP_TO_PHASE: Record<string, PipelinePhase> = {
  queued: "read",
  parsing: "read",
  summarize_extract: "analyze",
  state_merge: "merge",
  state_persist: "merge",
  changelog: "merge",
  git_commit: "merge",
  embed: "index",
  briefing: "index",
  enrich: "index",
};

/** Fixed order of the 4 phases as shown in the UI chip row. */
export const PHASE_ORDER: ReadonlyArray<PipelinePhase> = [
  "read",
  "analyze",
  "merge",
  "index",
];

/** Map a raw backend step name to its phase index (0-3) or null if unknown. */
export function phaseIndexForStep(raw: string | null | undefined): number {
  if (!raw) return 0;
  const phase = STEP_TO_PHASE[raw];
  if (!phase) return 0;
  return PHASE_ORDER.indexOf(phase);
}

/** Liefert ein benutzerfreundliches Label für einen rohen Backend-Step. */
export function labelForPipelineStep(raw: string | null | undefined): string {
  if (!raw) return "Aktivität";
  return PIPELINE_STEP_LABELS[raw] ?? raw.replaceAll("_", " ");
}

/** Liefert das aggregierte Phasen-Label (4 Phasen statt 9 Steps). */
export function labelForPipelinePhase(raw: string | null | undefined): string {
  if (!raw) return "Aktivität";
  const phase = STEP_TO_PHASE[raw];
  if (phase) return PIPELINE_PHASE_LABELS[phase];
  return PIPELINE_STEP_LABELS[raw] ?? raw.replaceAll("_", " ");
}
