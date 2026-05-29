/**
 * authClient.ts — token refresh helpers, pending-message buffer, and
 * cross-tab coordination via BroadcastChannel.
 */

import { useAuthStore } from "@/store/authStore";

// ---------------------------------------------------------------------------
// JWT exp decoding
// ---------------------------------------------------------------------------

/** Decode the `exp` claim from a JWT's payload segment. Returns null on error. */
export function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // base64url → base64 standard
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    const payload = JSON.parse(json) as Record<string, unknown>;
    const exp = payload["exp"];
    if (typeof exp === "number") return exp;
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// BroadcastChannel cross-tab coordination
// ---------------------------------------------------------------------------

const BC_CHANNEL = "openpm-auth";

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(BC_CHANNEL);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// In-flight refresh deduplication
// ---------------------------------------------------------------------------

let _refreshInFlight: Promise<string | null> | null = null;

/**
 * Refresh the access token using the stored refresh token.
 * Multiple concurrent callers share a single in-flight promise (deduped).
 * On success: updates authStore + broadcasts new token to other tabs.
 * On failure: returns null (caller should clear auth + redirect).
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (_refreshInFlight) return _refreshInFlight;

  _refreshInFlight = _doRefresh().finally(() => {
    _refreshInFlight = null;
  });

  return _refreshInFlight;
}

async function _doRefresh(): Promise<string | null> {
  const { refreshToken, user } = useAuthStore.getState();
  if (!refreshToken || !user) return null;

  try {
    // Use raw fetch to avoid circular dependency with api.ts interceptors
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      token_type: string;
    };

    useAuthStore
      .getState()
      .setAuth(user, data.access_token, data.refresh_token);

    // Notify other tabs so they adopt the new token instead of refreshing
    const bc = getBroadcastChannel();
    if (bc) {
      bc.postMessage({
        type: "TOKEN_REFRESHED",
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      bc.close();
    }

    return data.access_token;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cross-tab listener — adopt token refreshed by another tab
// ---------------------------------------------------------------------------

let _bcListenerStarted = false;

/** Call once (e.g. in a global layout) to listen for token refreshes from other tabs. */
export function startBroadcastChannelListener(): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  if (_bcListenerStarted) return () => {};
  _bcListenerStarted = true;

  const bc = new BroadcastChannel(BC_CHANNEL);
  bc.addEventListener(
    "message",
    (ev: MessageEvent<{ type: string; access_token: string; refresh_token: string }>) => {
      if (ev.data?.type !== "TOKEN_REFRESHED") return;
      const { user } = useAuthStore.getState();
      if (!user) return;
      // Another tab already did the refresh — adopt its tokens
      useAuthStore.getState().setAuth(user, ev.data.access_token, ev.data.refresh_token);
      // Cancel any in-flight refresh this tab started (it's now stale)
      _refreshInFlight = null;
    },
  );

  return () => {
    bc.close();
    _bcListenerStarted = false;
  };
}

// ---------------------------------------------------------------------------
// Pending message buffer
// ---------------------------------------------------------------------------

const PENDING_KEY = "pending_chat_messages";

interface PendingMessage {
  projectId: string;
  sessionId: string | null;
  content: string;
  ts: number;
}

function readBuffer(): Record<string, PendingMessage> {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PendingMessage>;
  } catch {
    return {};
  }
}

function writeBuffer(data: Record<string, PendingMessage>): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(data));
  } catch {
    // storage quota exceeded or unavailable — silently skip
  }
}

/**
 * Persist a message that failed to send due to auth expiry.
 * Key: `${projectId}:${sessionId ?? "none"}:${Date.now()}`
 */
export function bufferPendingMessage(
  projectId: string,
  sessionId: string | null,
  content: string,
): void {
  const buf = readBuffer();
  const key = `${projectId}:${sessionId ?? "none"}:${Date.now()}`;
  buf[key] = { projectId, sessionId, content, ts: Date.now() };
  writeBuffer(buf);
}

/**
 * Return all buffered messages for the given project sorted by ts ASC,
 * and remove them from storage atomically.
 */
export function takePendingMessages(
  projectId: string,
): { sessionId: string | null; content: string; ts: number }[] {
  const buf = readBuffer();
  const matching: [string, PendingMessage][] = Object.entries(buf).filter(
    ([, v]) => v.projectId === projectId,
  );
  // Remove matched entries
  for (const [k] of matching) {
    delete buf[k];
  }
  writeBuffer(buf);
  return matching
    .map(([, v]) => ({ sessionId: v.sessionId, content: v.content, ts: v.ts }))
    .sort((a, b) => a.ts - b.ts);
}
