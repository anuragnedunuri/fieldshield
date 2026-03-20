/**
 * @file useFieldShield.ts
 * @description React hook that manages the lifecycle of the FieldShield Web Worker,
 * exposes masked output and pattern findings for rendering, and provides
 * imperative methods for secure value retrieval and memory purging.
 *
 * @example
 * ```tsx
 * const { masked, findings, processText, getSecureValue, purge } =
 *   useFieldShield([{ name: "EMPLOYEE_ID", regex: "EMP-\\d{6}" }]);
 * ```
 *
 * @module useFieldShield
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { FIELDSHIELD_PATTERNS } from "../patterns";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A custom sensitive-data pattern supplied by the consuming application.
 *
 * @remarks
 * The public API intentionally uses an array of objects rather than a plain
 * Record for two reasons:
 *
 * 1. **Order is preserved** — arrays have guaranteed iteration order. Developers
 *    who want to prioritise certain patterns can control the order they are
 *    applied.
 * 2. **Duplicate detection** — two entries with the same `name` are visible in
 *    an array and can be warned about. In a Record the second key silently
 *    overwrites the first.
 *
 * The array is converted to a `Record<string, string>` by {@link toPatternRecord}
 * before being sent to the worker, so the worker remains agnostic to the
 * public API shape.
 *
 * @example
 * ```ts
 * { name: "EMPLOYEE_ID", regex: "EMP-\\d{6}" }
 * ```
 */
export interface CustomPattern {
  /** Human-readable label shown in the findings list (e.g. `"EMPLOYEE_ID"`). */
  name: string;
  /**
   * Regular expression source string. Do **not** include delimiters (`/`) or
   * flags — the worker applies `gi` automatically.
   *
   * Use double backslashes for escape sequences since this is a string, not a
   * regex literal. For example: `"\\d{6}"` not `"\d{6}"`.
   */
  regex: string;
}

/**
 * Return value of {@link useFieldShield}.
 */
export interface UseFieldShieldReturn {
  /**
   * A copy of the current input value with sensitive spans replaced by
   * `█` characters. Safe to render directly in the UI.
   */
  masked: string;

  /**
   * Deduplicated list of pattern names that matched the current value
   * (e.g. `["SSN", "EMAIL"]`). Empty array when the field is clean.
   */
  findings: string[];

  /**
   * Send the current real value to the worker for pattern analysis.
   * Call this on every input change.
   *
   * @param text - The unmasked text to evaluate.
   */
  processText: (text: string) => void;

  /**
   * Retrieve the real, unmasked value from the worker's isolated memory
   * via a private `MessageChannel`. Use this on form submission rather than
   * maintaining a separate copy of the real value in the main thread.
   *
   * @returns A promise that resolves to the current unmasked value, or
   *   rejects with a timeout error if the worker does not respond within
   *   3 seconds.
   *
   * @example
   * ```ts
   * const handleSubmit = async () => {
   *   const realValue = await getSecureValue();
   *   await fetch("/api/save", { body: JSON.stringify({ value: realValue }) });
   * };
   * ```
   */
  getSecureValue: () => Promise<string>;

  /**
   * Zero out the stored value in the worker's memory and confirm deletion.
   * Call this after successful form submission or on session logout.
   *
   * @remarks
   * Useful for compliance environments (HIPAA, PCI-DSS, SOC 2) that require
   * demonstrable cleanup of sensitive data from application memory.
   */
  purge: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Milliseconds to wait for a GET_TRUTH reply before rejecting the promise. */
const GET_TRUTH_TIMEOUT_MS = 3_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts the public-facing `CustomPattern[]` array into the
 * `Record<string, string>` shape the worker expects.
 *
 * @remarks
 * **Boundary conversion** — this is the single place where the public API
 * shape (array) is translated into the internal implementation shape (Record).
 * The worker is completely agnostic to the fact that the prop is an array.
 * If the public API ever changes shape, only this function needs updating —
 * the worker never changes.
 *
 * If duplicate `name` values are present, the last one wins — same behaviour
 * as a plain object assignment. A future enhancement could warn on duplicates
 * before converting.
 *
 * @param patterns - Array of custom pattern objects from the consumer.
 * @returns A `Record` mapping pattern name to regex source string.
 *
 * @example
 * ```ts
 * toPatternRecord([{ name: "EMPLOYEE_ID", regex: "EMP-\\d{6}" }])
 * // → { EMPLOYEE_ID: "EMP-\\d{6}" }
 * ```
 */
const toPatternRecord = (patterns: CustomPattern[]): Record<string, string> =>
  Object.fromEntries(patterns.map((p) => [p.name, p.regex]));

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages a {@link fieldshield.worker | FieldShield Web Worker} for the lifetime of
 * the consuming component, keeping the worker alive across pattern updates to
 * avoid losing `internalTruth`.
 *
 * @param customPatterns - Optional additional patterns to layer on top of the
 *   built-in defaults. Changing this array reconfigures the worker without
 *   terminating it, preserving any value already in memory.
 *
 * @returns {@link UseFieldShieldReturn}
 *
 * @remarks
 * **Two-effect design** — worker creation and pattern configuration are
 * intentionally split into separate `useEffect` calls:
 *
 * - Effect 1 (`[]` deps): Creates the worker once on mount, immediately sends
 *   the built-in default patterns from `patterns.ts` via CONFIG, and terminates
 *   only on unmount. The worker's `internalTruth` survives prop changes.
 * - Effect 2 (`[patternsString]` deps): Sends an updated CONFIG message
 *   whenever `customPatterns` changes. Sends both default and custom patterns
 *   together so the worker always has the full active set. No teardown occurs,
 *   so stored values are preserved.
 *
 * Combining these into one effect would destroy and recreate the worker —
 * and its stored `internalTruth` — on every pattern update.
 *
 * **Cancelled flag** — a boolean closed over by the `onmessage` handler
 * guards against stale worker responses arriving after the component unmounts.
 * The cleanup function flips it to `true` before terminating the worker. Any
 * message that arrives after that point is discarded, preventing a state update
 * on an unmounted component.
 *
 * React 18 no longer warns on unmounted state updates, but the race condition
 * still exists. The flag makes the hook correct by definition rather than
 * correct by luck.
 */
export const useFieldShield = (
  customPatterns: CustomPattern[] = [],
): UseFieldShieldReturn => {
  const [masked, setMasked] = useState("");
  const [findings, setFindings] = useState<string[]>([]);
  const workerRef = useRef<Worker | null>(null);

  /**
   * Stable JSON string used as the dependency for Effect 2.
   * Avoids re-running the effect when the array reference changes but its
   * contents are identical — JSON.stringify produces the same string for
   * structurally equal arrays regardless of reference identity.
   */
  const patternsString = JSON.stringify(customPatterns);

  // ── Effect 1: Worker lifecycle (mount / unmount only) ─────────────────────
  useEffect(() => {
    /**
     * Cancelled flag — declared inside this effect so both the onmessage
     * handler and the cleanup function close over the same variable in memory.
     *
     * When cleanup sets `cancelled = true`, the onmessage handler sees the
     * updated value immediately on its next invocation — because both hold a
     * reference to the same memory address, not a copy of the value.
     *
     * This is the closure-as-reference property: the handler captures the
     * address of `cancelled`, not its value at definition time.
     */
    let cancelled = false;

    workerRef.current = new Worker(
      new URL("../workers/fieldshield.worker.ts", import.meta.url),
      { type: "module" },
    );

    workerRef.current.onmessage = (e: MessageEvent) => {
      // Guard — discard any response that arrives after component unmount.
      // Covers the race where the worker posts an UPDATE in the same tick
      // that terminate() is called.
      if (cancelled) return;

      if (e.data?.type === "UPDATE") {
        setMasked(e.data.masked);
        setFindings(e.data.findings);
      }
    };

    /**
     * Send built-in default patterns to the worker immediately after creation.
     *
     * The worker is self-contained — it has no imports and cannot reach
     * `patterns.ts` directly. This CONFIG message is the mechanism by which
     * the worker receives its initial pattern set. Without this, the worker
     * would start with empty pattern objects and detect nothing.
     *
     * `customPatterns` is empty at this point — Effect 2 handles custom
     * pattern delivery and runs after this effect completes.
     *
     * Both defaultPatterns and customPatterns are sent as Record<string, string>
     * — the conversion from the public array API happens here via toPatternRecord,
     * not inside the worker. The worker is agnostic to the public API shape.
     */
    workerRef.current.postMessage({
      type: "CONFIG",
      payload: {
        defaultPatterns: FIELDSHIELD_PATTERNS, // already a Record — no conversion needed
        customPatterns: toPatternRecord([]), // empty on mount, Effect 2 delivers these
      },
    });

    return () => {
      // Flip the flag BEFORE terminating so any in-flight response that
      // arrives after this point is discarded by the guard above.
      cancelled = true;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []); // Empty deps — intentional. Worker must not be recreated on re-renders.

  // ── Effect 2: Pattern reconfiguration (runs when customPatterns changes) ───
  useEffect(() => {
    if (!workerRef.current) return;

    /**
     * Resend both default and custom patterns together.
     *
     * The worker replaces its entire pattern set on every CONFIG message.
     * Sending only the custom patterns would wipe the defaults. Sending both
     * together ensures the worker always has the complete active set.
     *
     * toPatternRecord() converts the public array API to Record here at the
     * boundary — the worker receives two Records of identical shape and never
     * needs to know the prop was originally an array.
     */
    workerRef.current.postMessage({
      type: "CONFIG",
      payload: {
        defaultPatterns: FIELDSHIELD_PATTERNS,
        customPatterns: toPatternRecord(
          JSON.parse(patternsString) as CustomPattern[],
        ),
      },
    });
  }, [patternsString]); // Only reconfigures — never terminates the worker.

  // ── Callbacks ─────────────────────────────────────────────────────────────

  /**
   * Sends `text` to the worker for pattern analysis and storage.
   *
   * Stable across renders because `useCallback` has empty deps — the function
   * reads `workerRef.current` at call time rather than closing over a snapshot
   * of the ref value at definition time.
   */
  const processText = useCallback((text: string): void => {
    workerRef.current?.postMessage({
      type: "PROCESS",
      payload: { text },
    });
  }, []);

  /**
   * Opens a private `MessageChannel`, transfers `port2` to the worker with
   * the `GET_TRUTH` message, and resolves with the reply on `port1`.
   *
   * Only `port1` (retained on the main thread) can receive the reply.
   * Browser extensions monitoring `postMessage` on the page cannot intercept
   * `MessageChannel` port messages — they are point-to-point, not broadcast.
   *
   * A `setTimeout` guard rejects the promise if the worker does not reply
   * within {@link GET_TRUTH_TIMEOUT_MS} — preventing a silent hang if the
   * worker was terminated before the response was sent.
   */
  const getSecureValue = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        resolve("");
        return;
      }

      const { port1, port2 } = new MessageChannel();

      const timeout = setTimeout(() => {
        port1.close();
        reject(
          new Error(
            `[FieldShield] getSecureValue timed out after ${GET_TRUTH_TIMEOUT_MS}ms.`,
          ),
        );
      }, GET_TRUTH_TIMEOUT_MS);

      port1.onmessage = (event: MessageEvent<{ text: string }>) => {
        clearTimeout(timeout);
        resolve(event.data.text);
      };

      // Transfer port2 to the worker — it no longer exists on the main thread
      // after this call. The worker replies on port2; we receive on port1.
      workerRef.current.postMessage({ type: "GET_TRUTH" }, [port2]);
    });
  }, []);

  /**
   * Posts a PURGE message to zero out `internalTruth` in worker memory.
   * Call after form submission or on session logout.
   */
  const purge = useCallback((): void => {
    workerRef.current?.postMessage({ type: "PURGE" });
  }, []);

  return { masked, findings, processText, getSecureValue, purge };
};
