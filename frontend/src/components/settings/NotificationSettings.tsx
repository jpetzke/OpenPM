"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import {
  getNotificationPermission,
  notificationsSupported,
  requestNotificationPermission,
  type NotifPermission,
} from "@/lib/notifications";

/** Browser-notification opt-in (roadmap R). Single button → requestPermission;
 *  reflects granted/denied/unsupported state. */
export function NotificationSettings() {
  const [perm, setPerm] = useState<NotifPermission>("default");

  useEffect(() => {
    setPerm(getNotificationPermission());
  }, []);

  const enable = async () => {
    const result = await requestNotificationPermission();
    setPerm(result);
    if (result === "granted") toast.success("Browser-Benachrichtigungen aktiv");
    else if (result === "denied") toast.error("Benachrichtigungen blockiert — im Browser freigeben");
  };

  const unsupported = !notificationsSupported() || perm === "unsupported";

  return (
    <div
      className="rounded-lg border p-4"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Bell size={16} style={{ color: "var(--accent)" }} />
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Browser-Benachrichtigungen
        </h2>
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        Erhalte eine System-Benachrichtigung wenn ein Dokument fertig verarbeitet
        ist und der Tab nicht im Fokus steht.
      </p>
      {unsupported ? (
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Von diesem Browser nicht unterstützt.
        </span>
      ) : perm === "granted" ? (
        <span className="text-xs font-medium" style={{ color: "var(--success)" }}>
          ✓ Aktiv
        </span>
      ) : perm === "denied" ? (
        <span className="text-xs" style={{ color: "var(--danger)" }}>
          Blockiert — in den Browser-Einstellungen freigeben.
        </span>
      ) : (
        <button
          onClick={enable}
          className="text-sm px-3 py-1.5 rounded-md transition-default"
          style={{ background: "var(--accent)", color: "white" }}
        >
          Aktivieren
        </button>
      )}
    </div>
  );
}
