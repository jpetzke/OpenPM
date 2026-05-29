import { create } from "zustand";

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;
  // Global overlays driven by keyboard shortcuts (single source: keybindings.ts).
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (value: boolean) => void;
  toggleCommandPalette: () => void;
  shortcutsModalOpen: boolean;
  setShortcutsModalOpen: (value: boolean) => void;
  toggleShortcutsModal: () => void;
}

// Read initial value from localStorage synchronously (client-only)
function readInitialCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("sidebar_collapsed") === "true";
  } catch {
    return false;
  }
}

export const useUiStore = create<UiState>()((set) => ({
  sidebarCollapsed: readInitialCollapsed(),
  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarCollapsed;
      try {
        localStorage.setItem("sidebar_collapsed", String(next));
      } catch {
        // ignore
      }
      return { sidebarCollapsed: next };
    }),
  setSidebarCollapsed: (value) =>
    set(() => {
      try {
        localStorage.setItem("sidebar_collapsed", String(value));
      } catch {
        // ignore
      }
      return { sidebarCollapsed: value };
    }),
  commandPaletteOpen: false,
  setCommandPaletteOpen: (value) => set({ commandPaletteOpen: value }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  shortcutsModalOpen: false,
  setShortcutsModalOpen: (value) => set({ shortcutsModalOpen: value }),
  toggleShortcutsModal: () => set((s) => ({ shortcutsModalOpen: !s.shortcutsModalOpen })),
}));
