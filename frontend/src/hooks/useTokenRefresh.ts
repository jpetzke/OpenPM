"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { decodeJwtExp, refreshAccessToken } from "@/lib/authClient";

/** How many seconds before `exp` to proactively refresh the token. */
const BUFFER_SECS = 5 * 60; // 5 minutes

/**
 * Schedules a silent token refresh 5 minutes before the access token expires.
 * Reschedules whenever the token changes. No-op when no token or no refreshToken.
 * Mount this in a long-lived layout component (e.g. projects/[id]/layout.tsx).
 */
export function useTokenRefresh(): void {
  const token = useAuthStore((s) => s.token);
  const refreshToken = useAuthStore((s) => s.refreshToken);

  useEffect(() => {
    if (!token || !refreshToken) return;

    const exp = decodeJwtExp(token);
    if (exp === null) return;

    const nowSecs = Date.now() / 1000;
    const secsUntilRefresh = exp - nowSecs - BUFFER_SECS;
    // If already within the buffer window (or past), refresh almost immediately
    const delayMs = Math.max(secsUntilRefresh * 1000, 200);

    const timerId = setTimeout(() => {
      refreshAccessToken().catch(() => {
        // Ignore — api.ts 401 interceptor will handle forced logout on next request
      });
    }, delayMs);

    return () => clearTimeout(timerId);
  }, [token, refreshToken]);
}
