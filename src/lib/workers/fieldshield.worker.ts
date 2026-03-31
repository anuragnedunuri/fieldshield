/**
 * @file fieldshield.worker.ts
 * @description Web Worker for FieldShield — runs in an isolated thread,
 * stores the canonical input value in memory unreachable by the main thread,
 * performs pattern detection, and returns masked output for display.
 *
 * @security
 * The real input value (`internalTruth`) never leaves this worker unless
 * explicitly requested via a `GET_TRUTH` message with a private MessageChannel
 * port. It is intentionally excluded from all `UPDATE` responses sent to the
 * main thread.
 *
 * @remarks
 * **Self-contained by design** — this file has no imports. When FieldShield
 * is consumed as an npm library, the consuming application's bundler processes
 * worker files differently from regular source files. Relative imports inside
 * a worker may not resolve correctly depending on the bundler and its
 * configuration. To guarantee compatibility across all bundler setups (Vite,
 * Webpack, Rollup, esbuild), this worker receives everything it needs via
 * messages from the main thread rather than importing it statically.
 *
 * Built-in patterns are sent by `useFieldShield.ts` via a `CONFIG` message
 * immediately after the worker is created on mount. The single source of truth
 * for those patterns lives in `patterns.ts` on the main thread side.
 *
 * **API shape agnosticism** — the public API exposes `customPatterns` as an
 * array of objects (`{ name, regex }[]`). That conversion to
 * `Record<string, string>` happens in `useFieldShield.ts` via `toPatternRecord()`
 * before the CONFIG message is sent. This worker only ever receives Records —
 * it is completely agnostic to the public API shape and never needs to change
 * if the prop type changes.
 *
 * @module fieldshield.worker
 */

// ─── Type Definitions ────────────────────────────────────────────────────────

/**
 * Payload for the CONFIG message.
 *
 * @remarks
 * Both fields are `Record<string, string>` — plain string maps, not `RegExp`
 * objects. The structured clone algorithm used by `postMessage` cannot transfer
 * `RegExp` objects reliably across all environments. The worker constructs its
 * own `RegExp` instances from the received source strings via `compilePatterns`.
 *
 * The conversion from the public `CustomPattern[]` array to this Record shape
 * happens in `useFieldShield.ts` at the API boundary — not here.
 */
interface ConfigPayload {
  /**
   * Built-in patterns sourced from `patterns.ts`, sent by `useFieldShield` on
   * mount and on every reconfiguration. Stored separately from `userPatterns`
   * so the two sets can be reset independently without affecting each other.
   */
  defaultPatterns: Record<string, string>;

  /**
   * Developer-supplied patterns, already converted from the public array API
   * to a Record by `toPatternRecord()` in `useFieldShield.ts`. Same shape as
   * `defaultPatterns` — `compilePatterns` handles both identically.
   */
  customPatterns: Record<string, string>;
}

/** Payload for the PROCESS message. */
interface ProcessPayload {
  /** The real, unmasked text to scan and store. */
  text: string;
}

/**
 * Discriminated union of every message type this worker accepts.
 *
 * @remarks
 * TypeScript narrows the payload type inside each `switch` case automatically
 * because `type` is a string literal in each branch.
 */
type FieldShieldMessage =
  | { type: "CONFIG"; payload: ConfigPayload }
  | { type: "PROCESS"; payload: ProcessPayload }
  | { type: "GET_TRUTH" }
  | { type: "PURGE" };

/**
 * Shape of every UPDATE response posted back to the main thread.
 *
 * @remarks
 * The original unmasked value is intentionally absent from this interface.
 * It never travels back to the main thread except via a private MessageChannel
 * port in response to an explicit `GET_TRUTH` request.
 */
interface UpdateResponse {
  type: "UPDATE";
  /** Input text with sensitive spans replaced by `█` characters. */
  masked: string;
  /** Deduplicated list of pattern names that matched (e.g. `["SSN", "EMAIL"]`). */
  findings: string[];
}

// ─── Module State ─────────────────────────────────────────────────────────────

/**
 * Compiled RegExp objects built from the default patterns sent via CONFIG.
 *
 * Stored separately from `userPatterns` so the two sets can be reset
 * independently — a CONFIG update that changes custom patterns should not
 * accidentally wipe the built-in defaults, and vice versa.
 */
let defaultPatterns: Record<string, RegExp> = {};

/**
 * Compiled RegExp objects built from developer-supplied custom patterns
 * sent via CONFIG. Custom patterns can override defaults by using the same
 * key name — this is intentional for advanced use cases.
 */
let userPatterns: Record<string, RegExp> = {};

/**
 * The canonical, unmasked input value.
 *
 * @security This variable is **never** included in `UPDATE` responses.
 * It is only transmitted through a private `MessageChannel` port in response
 * to an explicit `GET_TRUTH` request from the main thread.
 */
let internalTruth = "";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compiles a `Record<string, string>` of regex source strings into a
 * `Record<string, RegExp>` of compiled regex objects with `gi` flags.
 *
 * @remarks
 * Invalid source strings are skipped with a console warning rather than
 * throwing — a single bad pattern should not crash the worker or prevent
 * other patterns from running.
 *
 * Both `defaultPatterns` and `userPatterns` pass through this function,
 * keeping the compilation logic in one place. The worker receiving two
 * Records of identical shape (rather than an array and a Record) is what
 * makes this single function sufficient for both.
 *
 * @param sources - Map of pattern name to regex source string.
 * @param label   - Label used in warning messages (`"default"` or `"custom"`).
 * @returns Map of pattern name to compiled `RegExp` with `gi` flags.
 */
const compilePatterns = (
  sources: Record<string, string>,
  label: string,
): Record<string, RegExp> => {
  const compiled: Record<string, RegExp> = {};

  for (const [name, source] of Object.entries(sources)) {
    try {
      compiled[name] = new RegExp(source, "gi");
    } catch {
      console.warn(
        `[FieldShield] Skipping invalid ${label} pattern "${name}".`,
      );
    }
  }

  return compiled;
};

// ─── Core Logic ───────────────────────────────────────────────────────────────

/**
 * Scans `text` against all active patterns (defaults merged with custom) and
 * returns a masked copy alongside a list of matching pattern names.
 *
 * @param text - The unmasked input string to evaluate.
 * @returns An object containing:
 *   - `masked`   — `text` with all sensitive spans replaced by `█` characters.
 *   - `findings` — Deduplicated array of pattern names that matched.
 *
 * @remarks
 * **Two `lastIndex` resets per pattern** are required because `RegExp` objects
 * with the `g` flag maintain a stateful `lastIndex` cursor:
 *
 * - Reset #1 before `test()` — ensures the test always starts from position 0.
 * - Reset #2 before `replace()` — `test()` advances `lastIndex` to the end of
 *   the first match; without this reset, `replace()` would start scanning from
 *   that offset and miss all occurrences before it.
 *
 * **Merge order** — `userPatterns` is spread after `defaultPatterns` so custom
 * patterns with the same key name override the default. This is intentional.
 */
const processTextLogic = (
  text: string,
): { masked: string; findings: string[] } => {
  let maskedText = text;
  const findings: string[] = [];

  // Merge default and custom — custom keys override defaults of the same name.
  const allPatterns = { ...defaultPatterns, ...userPatterns };

  for (const [name, regex] of Object.entries(allPatterns)) {
    regex.lastIndex = 0; // Reset #1 — before test()

    if (regex.test(text)) {
      findings.push(name);
      regex.lastIndex = 0; // Reset #2 — test() advanced lastIndex; reset before replace()

      maskedText = maskedText.replace(regex, (match) =>
        // Replace each matched character 1:1 with a block character.
        // Preserving length keeps character positions in `masked` aligned
        // with `realValueRef` on the main thread — essential for correct
        // partial selection copy behaviour.
        "█".repeat(match.length),
      );
    }
  }

  return {
    masked: maskedText,
    // Deduplicate via Set — spread back to array for JSON serialisation.
    findings: [...new Set(findings)],
  };
};

// ─── Message Handler ──────────────────────────────────────────────────────────

/**
 * Central message dispatcher for the FieldShield worker.
 *
 * @remarks
 * `self` in a `DedicatedWorkerGlobalScope` is the worker's global object —
 * the equivalent of `window` on the main thread, but fully isolated from it.
 */
self.onmessage = (e: MessageEvent<FieldShieldMessage>): void => {
  const message = e.data;

  switch (message.type) {
    /**
     * CONFIG — (re)build the active pattern sets without recreating the worker.
     *
     * Receives two Records of identical shape — `defaultPatterns` and
     * `customPatterns`. Both pass through `compilePatterns` identically.
     * The fact that `customPatterns` originated as a public array API is
     * invisible here — `toPatternRecord()` in `useFieldShield.ts` handled that
     * conversion before this message was sent.
     *
     * Called by `useFieldShield` in two situations:
     *   1. Immediately after the worker is created on mount.
     *   2. Whenever the `customPatterns` prop changes.
     */
    case "CONFIG": {
      defaultPatterns = compilePatterns(
        message.payload.defaultPatterns,
        "default",
      );
      userPatterns = compilePatterns(message.payload.customPatterns, "custom");
      break;
    }

    /**
     * PROCESS — store the real value and post masked output back to the
     * main thread.
     *
     * Only `masked` and `findings` are transmitted — `internalTruth` stays
     * in worker memory and is never included in this response.
     */
    case "PROCESS": {
      internalTruth = message.payload.text;
      const { masked, findings } = processTextLogic(internalTruth);

      self.postMessage({
        type: "UPDATE",
        masked,
        findings,
      } satisfies UpdateResponse);

      break;
    }

    /**
     * GET_TRUTH — return `internalTruth` exclusively on the provided
     * `MessageChannel` port.
     *
     * The caller transfers `port2` with the message. We reply on it. Only the
     * caller's `port1` can receive this reply — browser extensions monitoring
     * `postMessage` on the page cannot intercept `MessageChannel` port messages
     * because they are point-to-point, not broadcast.
     */
    case "GET_TRUTH": {
      const replyPort = e.ports[0];
      if (replyPort) {
        replyPort.postMessage({ text: internalTruth });
      } else {
        console.warn(
          "[FieldShield] GET_TRUTH received with no MessagePort — " +
            "caller will time out. Pass port2 via the transfer array.",
        );
      }
      break;
    }

    /**
     * PURGE — zero out `internalTruth` and confirm deletion.
     *
     * Intended for use on form submission, session logout, or component
     * unmount in compliance-sensitive environments (HIPAA, PCI-DSS, SOC 2).
     */
    case "PURGE": {
      internalTruth = "";
      self.postMessage({ type: "PURGED" });
      break;
    }

    default: {
      console.warn(
        `[FieldShield] Worker received unknown message type: "${(message as { type: string }).type}"`,
      );
      break;
    }
  }
};
