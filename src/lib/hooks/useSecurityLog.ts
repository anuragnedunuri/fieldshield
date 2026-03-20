/**
 * @file useSecurityLog.ts
 * @description Hook that maintains a typed, auto-timestamped log of FieldShield
 * security events — copy blocks, cut blocks, paste detections, submissions,
 * and memory purges.
 *
 * @example
 * ```tsx
 * const { events, makeClipboardHandler, pushEvent, clearLog } = useSecurityLog();
 *
 * <FieldShieldInput
 *   label="SSN"
 *   onSensitiveCopyAttempt={makeClipboardHandler("copy_cut")}
 *   onSensitivePaste={makeClipboardHandler("paste")}
 * />
 *
 * <ol>
 *   {events.map(ev => <li key={ev.id}>{ev.field} — {ev.type}</li>)}
 * </ol>
 * ```
 *
 * @module useSecurityLog
 */

import { useState, useCallback, useRef } from "react";
import type { SensitiveClipboardEvent } from "../components/FieldShieldInput";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Discriminated union of all event types the log can record.
 *
 * - `COPY_BLOCKED`    — user attempted to copy sensitive data; clipboard received masked text.
 * - `CUT_BLOCKED`     — user attempted to cut sensitive data; clipboard received masked text.
 * - `PASTE_DETECTED`  — user pasted content containing sensitive patterns.
 * - `SUBMIT`          — form was submitted via `collectSecureValues`.
 * - `PURGE`           — worker memory was zeroed after submission.
 * - `CUSTOM`          — application-defined event pushed via `pushEvent` directly.
 */
export type SecurityEventType =
  | "COPY_BLOCKED"
  | "CUT_BLOCKED"
  | "PASTE_DETECTED"
  | "SUBMIT"
  | "PURGE"
  | "CUSTOM";

/**
 * A single entry in the security event log.
 */
export interface SecurityEvent {
  /** Auto-incrementing unique identifier — safe to use as a React key. */
  id: number;

  /**
   * Human-readable time string derived from the event timestamp.
   * Formatted via `Date.toLocaleTimeString()` at the moment the event is pushed.
   */
  timestamp: string;

  /**
   * The field that produced the event. Sourced from `SensitiveClipboardEvent.fieldLabel`
   * for clipboard events, or supplied directly for SUBMIT / PURGE events.
   */
  field: string;

  /** Discriminated event type. See {@link SecurityEventType}. */
  type: SecurityEventType;

  /**
   * Pattern names active at the time of the event (e.g. `["SSN", "EMAIL"]`).
   * Empty array for SUBMIT, PURGE, and CUSTOM events that carry no findings.
   */
  findings: string[];

  /**
   * Optional human-readable detail string for display in the log UI.
   * For clipboard events this is a truncated preview of the masked value.
   */
  detail?: string;
}

/**
 * Options accepted by {@link useSecurityLog}.
 */
export interface UseSecurityLogOptions {
  /**
   * Maximum number of events retained in the log. Oldest events are dropped
   * when the limit is exceeded.
   *
   * @defaultValue 20
   */
  maxEvents?: number;
}

/**
 * Return value of {@link useSecurityLog}.
 */
export interface UseSecurityLogReturn {
  /**
   * The current list of security events, newest first.
   * Safe to map directly as React children — each entry has a stable `id`.
   */
  events: SecurityEvent[];

  /**
   * Push any event into the log manually. Use this for SUBMIT and PURGE events
   * that are not produced by a clipboard callback.
   *
   * @example
   * ```ts
   * pushEvent({ field: "All fields", type: "SUBMIT", findings: [], detail: "3 fields submitted" });
   * ```
   */
  pushEvent: (event: Omit<SecurityEvent, "id" | "timestamp">) => void;

  /**
   * Returns a `SensitiveClipboardEvent` handler ready to wire directly into
   * `onSensitiveCopyAttempt` or `onSensitivePaste`.
   *
   * Pass `"copy_cut"` for `onSensitiveCopyAttempt` — the handler inspects
   * `e.eventType` internally to distinguish copy from cut.
   * Pass `"paste"` for `onSensitivePaste`.
   *
   * @example
   * ```tsx
   * <FieldShieldInput
   *   onSensitiveCopyAttempt={makeClipboardHandler("copy_cut")}
   *   onSensitivePaste={makeClipboardHandler("paste")}
   * />
   * ```
   */
  makeClipboardHandler: (
    context: "copy_cut" | "paste",
  ) => (e: SensitiveClipboardEvent) => void;

  /**
   * Clears all events from the log, resetting it to an empty state.
   * Resets the internal ID counter.
   */
  clearLog: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Maintains a capped, auto-timestamped log of FieldShield security events.
 *
 * @param options - Optional configuration. See {@link UseSecurityLogOptions}.
 * @returns {@link UseSecurityLogReturn}
 *
 * @remarks
 * **ID counter** — the counter lives in a `useRef`.
 * It is only ever incremented inside `pushEvent` and read to generate IDs —
 * nothing renders based on its value.
 *
 * **Stable callbacks** — `pushEvent` and `makeClipboardHandler` are both
 * wrapped in `useCallback`. `makeClipboardHandler` depends on `pushEvent`
 * which is itself stable, so the returned handler references are stable across
 * renders and safe to pass as props without triggering child re-renders.
 *
 * **Newest-first ordering** — events are prepended (`[newEvent, ...prev]`)
 * so index 0 is always the most recent. This matches the expected rendering
 * order for audit log UIs.
 */
export const useSecurityLog = (
  options: UseSecurityLogOptions = {},
): UseSecurityLogReturn => {
  const { maxEvents = 20 } = options;

  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const counterRef = useRef(0);

  // ── pushEvent ──────────────────────────────────────────────────────────────

  const pushEvent = useCallback(
    (event: Omit<SecurityEvent, "id" | "timestamp">): void => {
      const id = ++counterRef.current;
      const timestamp = new Date().toLocaleTimeString();
      setEvents((prev) =>
        [{ ...event, id, timestamp }, ...prev].slice(0, maxEvents),
      );
    },
    [maxEvents],
  );

  // ── makeClipboardHandler ───────────────────────────────────────────────────

  /**
   * Factory that returns a clipboard event handler for the given context.
   *
   * Inspects `e.eventType` to distinguish copy from cut — this avoids needing
   * two separate handler factories and keeps the prop wiring simple.
   *
   * The `detail` field is truncated to 32 characters with an ellipsis so the
   * log UI stays compact even with long field values.
   */
  const makeClipboardHandler = useCallback(
    (context: "copy_cut" | "paste") =>
      (e: SensitiveClipboardEvent): void => {
        const type: SecurityEventType =
          context === "paste"
            ? "PASTE_DETECTED"
            : e.eventType === "cut"
              ? "CUT_BLOCKED"
              : "COPY_BLOCKED";

        pushEvent({
          field: e.fieldLabel,
          type,
          findings: e.findings,
          detail: `${e.masked.slice(0, 32)}${e.masked.length > 32 ? "…" : ""}`,
        });
      },
    [pushEvent],
  );

  // ── clearLog ───────────────────────────────────────────────────────────────

  const clearLog = useCallback((): void => {
    setEvents([]);
    counterRef.current = 0;
  }, []);

  return { events, pushEvent, makeClipboardHandler, clearLog };
};
