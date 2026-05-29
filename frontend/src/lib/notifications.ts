/**
 * Browser notifications (roadmap R). Web Notifications API directly — no
 * service worker (v1: tab must still exist). Opt-in via the settings page.
 */

export type NotifPermission = NotificationPermission | "unsupported";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotifPermission {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotifPermission> {
  if (!notificationsSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

interface NotifyOptions {
  title: string;
  body: string;
  /** Stacking key — same tag replaces the previous notification (per project). */
  tag?: string;
  /** Keep visible until dismissed (used for failures). */
  requireInteraction?: boolean;
  onClick?: () => void;
}

/** Fire a notification if granted + supported. No-op otherwise. */
export function notify(opts: NotifyOptions): void {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
      requireInteraction: opts.requireInteraction ?? false,
    });
    if (opts.onClick) {
      n.onclick = () => {
        window.focus();
        opts.onClick?.();
        n.close();
      };
    }
  } catch {
    // ignore — some browsers throw if constructed without a user gesture
  }
}
