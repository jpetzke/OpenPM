/**
 * Central UI tunables. Single source of truth for thresholds referenced
 * across components, so the values don't drift between ChatInput, the
 * page-level paste handler and the bulk-upload grouping.
 */

/** Paste text longer than this (chars) is treated as a document, not inline
 *  input. Roadmap N default = 200 (typical Slack/mail snippet cutoff). */
export const PASTE_THRESHOLD_CHARS = 200;

/** Show the bulk-upload group header once a ChangeSession has at least this
 *  many member documents (roadmap S). */
export const BULK_UPLOAD_THRESHOLD = 5;
