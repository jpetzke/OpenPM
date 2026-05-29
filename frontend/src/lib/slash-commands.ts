/**
 * Slash-command registry for OpenPM chat.
 * All commands run client-side — zero LLM round-trips.
 */

export type SlashCommandName =
  | "status"
  | "tasks"
  | "deadlines"
  | "blockers"
  | "contacts"
  | "search"
  | "export"
  | "cancel"
  | "clear"
  | "version"
  | "help";

export interface SlashCommandDef {
  name: SlashCommandName;
  description: string;
  hint?: string;
  takesArg?: boolean;
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  { name: "status",    description: "Projekt-Zusammenfassung (Aufgaben, Fristen, Blocker…)" },
  { name: "tasks",     description: "Offene Aufgaben nach Fälligkeitsdatum" },
  { name: "deadlines", description: "Bevorstehende & überfällige Fristen" },
  { name: "blockers",  description: "Offene Blocker" },
  { name: "contacts",  description: "Kontaktliste" },
  { name: "search",    description: "Semantische Dokumentensuche", hint: "<Suchbegriff>", takesArg: true },
  { name: "export",    description: "Kompiliertes Briefing als .md herunterladen" },
  { name: "cancel",    description: "Laufende Pipelines abbrechen" },
  { name: "clear",     description: "Neuen Chat starten" },
  { name: "version",   description: "Aktuelle State-Version & letzter Changelog" },
  { name: "help",      description: "Alle Slash-Befehle anzeigen" },
];

/**
 * Returns commands whose name starts with `fragment` (case-insensitive).
 * Only called when input starts with `/` and has no space yet (or is exactly `/`).
 */
export function matchSlashCommands(input: string): SlashCommandDef[] {
  if (!input.startsWith("/")) return [];
  const fragment = input.slice(1).toLowerCase();
  return SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(fragment));
}

/**
 * Parses a `/name [arg]` string.
 * Returns null if the input is not a slash command.
 */
export function parseSlashCommand(
  input: string,
): { name: SlashCommandName; arg: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const [rawName, ...rest] = trimmed.slice(1).split(" ");
  const name = rawName.toLowerCase() as SlashCommandName;
  if (!SLASH_COMMANDS.find((c) => c.name === name)) return null;
  return { name, arg: rest.join(" ").trim() };
}
