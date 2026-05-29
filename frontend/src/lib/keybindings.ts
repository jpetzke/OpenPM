/**
 * Single source of truth for global keyboard shortcuts (roadmap P).
 *
 * Platform convention: Mac = ⌘ (metaKey), Linux/Windows = Ctrl. All shortcuts
 * are dual-bound. The actual handlers live in `useGlobalKeybindings`; this file
 * defines the binding metadata so the cheat-sheet (Cmd+/) and the handler stay
 * in sync.
 *
 * Cross-component actions are dispatched as window CustomEvents so that the
 * component owning the behaviour (chat input file picker, cockpit new-chat)
 * stays the single owner while the keymap stays centralized here.
 */

export const KEY_EVENT_NEW_CHAT = "openpm:new-chat";
export const KEY_EVENT_OPEN_FILE_PICKER = "openpm:open-file-picker";

export type ShortcutId =
  | "command_palette"
  | "new_chat"
  | "shortcuts_cheatsheet"
  | "toggle_sidebar"
  | "open_settings"
  | "open_file_picker";

export interface KeyBinding {
  id: ShortcutId;
  /** Single character key (lower-case) compared against `e.key`. */
  key: string;
  description: string;
}

export const KEY_BINDINGS: KeyBinding[] = [
  { id: "command_palette", key: "k", description: "Globale Suche öffnen (Projekte / Chats / Dokumente)" },
  { id: "new_chat", key: "n", description: "Neuen Chat im aktiven Projekt starten" },
  { id: "shortcuts_cheatsheet", key: "/", description: "Tastenkürzel-Übersicht anzeigen" },
  { id: "toggle_sidebar", key: "b", description: "Sidebar ein-/ausklappen" },
  { id: "open_settings", key: ",", description: "Einstellungen öffnen" },
  { id: "open_file_picker", key: "u", description: "Datei-Auswahl öffnen" },
];

/** True when the platform-correct modifier (⌘ on Mac, Ctrl elsewhere) is held. */
export function isMod(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey;
}

/** True when the user is mid-IME-composition (e.g. CJK) — shortcuts must not
 *  fire and steal the composition. */
export function isComposing(e: KeyboardEvent): boolean {
  // `keyCode === 229` is the legacy composing signal some IMEs still emit.
  return e.isComposing || (e as KeyboardEvent & { keyCode?: number }).keyCode === 229;
}

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

/** Human-readable label, e.g. "⌘K" on Mac, "Ctrl+K" elsewhere. */
export function shortcutLabel(key: string): string {
  const mod = isMacPlatform() ? "⌘" : "Ctrl+";
  const k = key === "," ? "," : key === "/" ? "/" : key.toUpperCase();
  return `${mod}${k}`;
}
