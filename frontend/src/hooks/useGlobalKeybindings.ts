"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUiStore } from "@/store/uiStore";
import {
  isComposing,
  isMod,
  KEY_EVENT_NEW_CHAT,
  KEY_EVENT_OPEN_FILE_PICKER,
} from "@/lib/keybindings";

/**
 * Mounts the global keyboard shortcuts (roadmap P) from a single place.
 * Cross-component actions go out as window CustomEvents; overlay toggles flip
 * the shared ui store. Esc handling stays local to the components that own the
 * relevant context (cockpit two-stage Esc, modals).
 */
export function useGlobalKeybindings() {
  const router = useRouter();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette);
  const toggleShortcutsModal = useUiStore((s) => s.toggleShortcutsModal);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isMod(e) || isComposing(e)) return;

      switch (e.key) {
        case "k":
          e.preventDefault();
          toggleCommandPalette();
          break;
        case "n":
          if (e.shiftKey) return; // leave Cmd+Shift+N to the browser
          e.preventDefault();
          window.dispatchEvent(new CustomEvent(KEY_EVENT_NEW_CHAT));
          break;
        case "/":
          e.preventDefault();
          toggleShortcutsModal();
          break;
        case "b":
          e.preventDefault();
          toggleSidebar();
          break;
        case ",":
          e.preventDefault();
          router.push("/settings");
          break;
        case "u":
          e.preventDefault();
          window.dispatchEvent(new CustomEvent(KEY_EVENT_OPEN_FILE_PICKER));
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router, toggleSidebar, toggleCommandPalette, toggleShortcutsModal]);
}
