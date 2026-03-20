/**
 * @file collectSecureValues.ts
 * @description Utility for securely retrieving values from multiple
 * FieldShieldInput fields simultaneously on form submission.
 *
 * @example
 * ```tsx
 * const refs = { ssn: ssnRef, apiKey: apiKeyRef, notes: notesRef };
 *
 * const handleSubmit = async () => {
 *   const values = await collectSecureValues(refs);
 *   await fetch("/api/submit", { body: JSON.stringify(values) });
 *
 *   purgeSecureValues(refs);
 * };
 * ```
 *
 * @module collectSecureValues
 */

import type { RefObject } from "react";
import type { FieldShieldHandle } from "../components/FieldShieldInput";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A map of field names to their FieldShieldHandle refs.
 * Keys become the property names in the resolved values object.
 *
 * @example
 * ```ts
 * const refs: FieldShieldRefMap = {
 *   ssn: ssnRef,
 *   apiKey: apiKeyRef,
 *   notes: notesRef,
 * };
 * ```
 */
export type FieldShieldRefMap = Record<
  string,
  RefObject<FieldShieldHandle | null>
>;

/**
 * The resolved values object returned by {@link collectSecureValues}.
 * Keys mirror the input `FieldShieldRefMap` — values are the retrieved
 * plaintext strings, or `""` if the ref was unmounted or null.
 */
export type SecureValues<T extends FieldShieldRefMap> = Record<keyof T, string>;

// ─── collectSecureValues ──────────────────────────────────────────────────────

/**
 * Retrieves real values from multiple FieldShieldInput fields in parallel
 * via `Promise.all`. Each value is fetched from the field's isolated Web
 * Worker memory — no plaintext ever exists on the main thread until this
 * call resolves.
 *
 * Null or unmounted refs resolve to `""` rather than throwing, so a missing
 * optional field never blocks form submission.
 *
 * @param refs - Named map of FieldShieldHandle refs to collect from.
 * @returns A promise resolving to an object with the same keys as `refs`,
 *   each containing the retrieved plaintext string.
 *
 * @example
 * ```tsx
 * const ssnRef    = useRef<FieldShieldHandle>(null);
 * const notesRef  = useRef<FieldShieldHandle>(null);
 *
 * const handleSubmit = async () => {
 *   const { ssn, notes } = await collectSecureValues({ ssn: ssnRef, notes: notesRef });
 *   await fetch("/api/patient", { body: JSON.stringify({ ssn, notes }) });
 * };
 * ```
 *
 * @remarks
 * **Why named keys instead of an array?** An array of refs would resolve to
 * an array of strings in positional order — callers would have to remember
 * which index corresponds to which field. A named map produces a typed object
 * where the field name is explicit at the call site and in the resolved value,
 * making accidental field-order bugs impossible.
 *
 * **Why not a hook?** This function has no React state, no side effects, and
 * no lifecycle dependency. Making it a hook would require consumers to call it
 * inside `useCallback` and follow Rules of Hooks unnecessarily. A plain async
 * function is the correct primitive here.
 */
export const collectSecureValues = async <T extends FieldShieldRefMap>(
  refs: T,
): Promise<SecureValues<T>> => {
  const entries = Object.entries(refs) as [
    keyof T,
    RefObject<FieldShieldHandle | null>,
  ][];

  const results = await Promise.allSettled(
    entries.map(
      ([, ref]) => ref.current?.getSecureValue() ?? Promise.resolve(""),
    ),
  );

  return Object.fromEntries(
    entries.map(([key], i) => {
      const result = results[i];
      if (result.status === "rejected") {
        console.warn(
          `[FieldShield] collectSecureValues: field "${String(key)}" failed to retrieve value.`,
          result.reason,
        );
        return [key, ""];
      }
      return [key, result.value];
    }),
  ) as unknown as SecureValues<T>;
};

// ─── purgeSecureValues ────────────────────────────────────────────────────────

/**
 * Calls `purge()` on every ref in the map, zeroing out worker memory for all
 * fields simultaneously. Call this immediately after `collectSecureValues`
 * resolves and the data has been sent to your backend.
 *
 * Null or unmounted refs are silently skipped.
 *
 * @param refs - Named map of FieldShieldHandle refs to purge.
 *
 * @example
 * ```ts
 * const values = await collectSecureValues(refs);
 * await sendToBackend(values);
 * purgeSecureValues(refs); // fire-and-forget, no await needed
 * ```
 *
 * @remarks
 * `purge()` is synchronous — it posts a PURGE message to the worker with no
 * response awaited. Calling `purgeSecureValues` immediately after
 * `collectSecureValues` is safe because both the real value retrieval and
 * the purge message travel through the same worker message queue in order.
 * The PURGE message will always be processed after the GET_TRUTH reply.
 */
export const purgeSecureValues = (refs: FieldShieldRefMap): void => {
  Object.values(refs).forEach((ref) => ref.current?.purge());
};
