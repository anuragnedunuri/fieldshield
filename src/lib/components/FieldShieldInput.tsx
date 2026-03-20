/**
 * @file FieldShieldInput.tsx
 * @description FieldShield input component — protects sensitive text fields
 * from browser extension DOM scraping, automated screen scrapers, and
 * accidental clipboard exfiltration to LLMs.
 *
 * @example Standard mode
 * ```tsx
 * const ref = useRef<FieldShieldHandle>(null);
 *
 * const handleSubmit = async () => {
 *   const value = await ref.current?.getSecureValue();
 *   await fetch("/api/save", { body: JSON.stringify({ value }) });
 *   ref.current?.purge();
 * };
 *
 * <FieldShieldInput
 *   ref={ref}
 *   label="Patient Notes"
 *   onSensitiveCopyAttempt={(e) =>
 *     toast.warning(`Blocked ${e.findings.join(", ")} from clipboard`)
 *   }
 * />
 * ```
 *
 * @example Textarea
 * ```tsx
 * <FieldShieldInput ref={ref} label="Clinical Notes" type="textarea" />
 * ```
 *
 * @example Accessibility mode (WCAG 2.1 AA / Section 508)
 * ```tsx
 * <FieldShieldInput ref={ref} label="SSN" a11yMode />
 * ```
 *
 * @module FieldShieldInput
 */

import React, {
  useRef,
  useId,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useFieldShield, type CustomPattern } from "../hooks/useFieldShield";
import { FIELDSHIELD_PATTERNS } from "../patterns";
import "../styles/fieldshield.css";

// ─── Public Types ─────────────────────────────────────────────────────────────

/**
 * Imperative methods exposed to a parent component via `ref`.
 *
 * @example
 * ```tsx
 * const ref = useRef<FieldShieldHandle>(null);
 * <FieldShieldInput ref={ref} label="Notes" />
 *
 * // On submit:
 * const value = await ref.current?.getSecureValue();
 * ```
 */
export interface FieldShieldHandle {
  /**
   * Retrieves the real, unmasked value from the worker's isolated memory.
   * @see {@link UseFieldShieldReturn.getSecureValue}
   */
  getSecureValue: () => Promise<string>;

  /**
   * Zeros out the stored value in worker memory.
   * @see {@link UseFieldShieldReturn.purge}
   */
  purge: () => void;
}

/**
 * Payload delivered to `onSensitiveCopyAttempt` and `onSensitivePaste`
 * callbacks whenever a clipboard event involves sensitive data.
 */
export interface SensitiveClipboardEvent {
  /** ISO 8601 timestamp of when the event occurred. */
  timestamp: string;

  /** The `label` prop of the field that triggered the event. */
  fieldLabel: string;

  /**
   * Pattern names that were active at the time of the event.
   * Example: `["SSN", "PHONE"]`
   */
  findings: string[];

  /**
   * The masked text written to (copy/cut) or read from (paste) the clipboard.
   * Sensitive spans replaced by `█`. The real value is never included here.
   */
  masked: string;

  /** Whether the event originated from a copy, cut, or paste action. */
  eventType: "copy" | "cut" | "paste";
}

/**
 * Props accepted by {@link FieldShieldInput}.
 */
export interface FieldShieldInputProps {
  /**
   * Visible label text linked to the input via `htmlFor`/`id`.
   * Also used as the field identifier in clipboard event payloads.
   * When omitted, no `<label>` element is rendered — the field falls back
   * to `"Protected field"` for screen reader announcements.
   */
  label?: string;

  /**
   * Renders either a single-line `<input>` or a multi-line `<textarea>`.
   * Textarea mode also enables auto-grow behaviour — the field expands
   * vertically as the user types past the initial height.
   *
   * @defaultValue "text"
   */
  type?: "text" | "textarea";

  /** Native `placeholder` attribute forwarded to the underlying element. */
  placeholder?: string;

  /**
   * Additional sensitive-data patterns to layer on top of the built-in
   * defaults (SSN, EMAIL, PHONE, CREDIT_CARD, IBAN, AI_API_KEY, AWS_ACCESS_KEY).
   *
   * @example
   * ```tsx
   * customPatterns={[{ name: "EMPLOYEE_ID", regex: "EMP-\\d{6}" }]}
   * ```
   */
  customPatterns?: CustomPattern[];

  /**
   * Additional CSS class applied to the outermost container `<div>`.
   * Merged with the internal `fieldshield-container` class.
   */
  className?: string;

  /** Inline styles applied to the outermost container `<div>`. */
  style?: React.CSSProperties;

  /**
   * Fires whenever the masked value or findings change — after each Worker
   * UPDATE response. Gives the parent visibility into field state WITHOUT
   * exposing the real value. The real value is only available via
   * `ref.current.getSecureValue()`.
   *
   * @param masked   - Current masked display string (e.g. `"SSN: ███-██-████"`).
   * @param findings - Deduplicated list of matched pattern names.
   */
  onChange?: (masked: string, findings: string[]) => void;

  /**
   * When `true`, disables DOM scrambling and renders a native
   * `type="password"` input instead. Pattern detection and clipboard
   * protection remain active.
   *
   * Use this mode for WCAG 2.1 AA / Section 508 compliance — screen readers
   * handle `type="password"` fields natively and cannot interact with the
   * scrambled overlay used in standard mode.
   *
   * @defaultValue false
   */
  a11yMode?: boolean;

  /**
   * Fired when the user copies or cuts from the field while sensitive
   * patterns are present. The clipboard receives the masked text instead
   * of the real value.
   *
   * Use this to surface a toast notification or write a security audit log.
   *
   * @param event - Details of the blocked clipboard operation.
   */
  onSensitiveCopyAttempt?: (event: SensitiveClipboardEvent) => void;

  /**
   * Fired when the user pastes content into the field that contains sensitive
   * patterns. The paste is allowed to proceed — the user may legitimately be
   * entering their own data — but the event is surfaced for auditing or UX
   * feedback.
   *
   * @param event - Details of the detected paste content.
   */
  onSensitivePaste?: (event: SensitiveClipboardEvent) => void;

  /**
   * Fired when the field receives focus. Forwarded directly from the
   * underlying `<input>` or `<textarea>` element.
   */
  onFocus?: (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;

  /**
   * Fired when the field loses focus. Forwarded directly from the
   * underlying `<input>` or `<textarea>` element.
   */
  onBlur?: (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;

  /**
   * Disables the field when `true`. Forwarded to the underlying element and
   * reflected on the container via the `data-disabled` attribute for CSS
   * styling hooks.
   *
   * @defaultValue false
   */
  disabled?: boolean;

  /**
   * Marks the field as required. Sets `aria-required` on the underlying
   * element so screen readers announce the field as mandatory.
   *
   * @defaultValue false
   */
  required?: boolean;

  /**
   * Maximum number of characters the field will accept. Forwarded to the
   * underlying element's native `maxLength` attribute. Also caps the amount
   * of text the worker processes on each keystroke.
   */
  maxLength?: number;

  /**
   * Initial number of visible text rows. Only applies when `type="textarea"`.
   * Sets a minimum height — the field still auto-grows beyond this value as
   * the user types.
   *
   * @defaultValue 3
   */
  rows?: number;

  /**
   * Hint to the browser about which virtual keyboard to display on mobile.
   * Does not affect input behaviour or value handling — the field always
   * operates as `type="text"` internally, preserving scrambling and worker
   * isolation regardless of this value.
   *
   * Use this instead of `type="number"` or `type="email"` — those change
   * browser validation and value parsing in ways that break DOM scrambling.
   * `inputMode` gives the correct mobile keyboard without any side effects.
   *
   * @example
   * ```tsx
   * // Numeric keypad for SSN / credit card fields
   * <FieldShieldInput inputMode="numeric" label="SSN" />
   *
   * // Phone keypad with +, *, # keys
   * <FieldShieldInput inputMode="tel" label="Phone" />
   *
   * // Email keyboard with @ key prominent
   * <FieldShieldInput inputMode="email" label="Email" />
   * ```
   *
   * @defaultValue "text"
   */
  inputMode?:
    | "text"
    | "numeric"
    | "decimal"
    | "tel"
    | "email"
    | "search"
    | "url"
    | "none";
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * A drop-in replacement for `<input>` or `<textarea>` in contexts where
 * sensitive data is typed or pasted by users.
 *
 * **Threat model (what this protects against)**
 * - Browser extensions reading `input.value` via DOM inspection
 * - Session recording tools (FullStory, LogRocket) capturing field content
 * - Automated scrapers walking the DOM
 * - Users accidentally copying sensitive text into LLMs via clipboard
 *
 * **Out of scope**
 * - Extensions with kernel-level or debugger access
 * - OS-level keyloggers
 * - Network interception (use TLS)
 *
 * @remarks
 * Uses `forwardRef` so parent components can hold a {@link FieldShieldHandle}
 * ref and call `getSecureValue()` on form submission without maintaining a
 * separate copy of the real value on the main thread.
 */
export const FieldShieldInput = forwardRef<
  FieldShieldHandle,
  FieldShieldInputProps
>(
  (
    {
      label,
      type = "text",
      placeholder,
      customPatterns = [],
      className,
      style,
      onChange,
      a11yMode = false,
      onSensitiveCopyAttempt,
      onSensitivePaste,
      onFocus,
      onBlur,
      disabled = false,
      required = false,
      maxLength,
      rows = 3,
      inputMode = "text",
    },
    ref,
  ) => {
    const { masked, findings, processText, getSecureValue, purge } =
      useFieldShield(customPatterns);

    const isUnsafe = findings.length > 0;

    /** Fallback for aria-label when no visible label is provided. */
    const ariaLabel = label ?? "Protected field";

    /**
     * Ref for the real `<input>` element — populated when `type="text"`.
     * Null when a textarea is rendered.
     */
    const inputRef = useRef<HTMLInputElement>(null);

    /**
     * Ref for the real `<textarea>` element — populated when `type="textarea"`.
     * Null when an input is rendered.
     */
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    /**
     * Ref for the hidden auto-grow div used to measure textarea height.
     * Mirrors the textarea's content so CSS can expand the field naturally.
     * Only relevant when `type="textarea"`.
     */
    const growRef = useRef<HTMLDivElement>(null);

    /**
     * Holds the canonical real input value on the main thread.
     *
     * **Why a ref, not state?**
     * State updates are asynchronous — reading state on the very next keystroke
     * risks a stale snapshot. A ref update is synchronous and does not schedule
     * a re-render, which is exactly what character-by-character DOM
     * reconstruction requires.
     *
     * **Why needed in a11yMode?**
     * In a11yMode `input.value` holds the real text and could be read directly.
     * However, `handleCopy` is shared between both modes and always reads from
     * `realValueRef` — keeping both modes on the same code path avoids branching
     * inside `handleCopy` at the cost of a harmless redundant write.
     */
    const realValueRef = useRef<string>("");

    /**
     * Generates stable, unique IDs for ARIA attribute wiring.
     * Prevents ID collisions when multiple `FieldShieldInput` instances share a page.
     */
    const inputId = useId();
    const warningId = `${inputId}-warning`;
    const descriptionId = `${inputId}-desc`;

    // ── Imperative handle ───────────────────────────────────────────────────

    /**
     * Exposes `getSecureValue` and `purge` to the parent via the forwarded ref.
     * `processText` is intentionally excluded — the parent should never bypass
     * the event handler flow and trigger worker processing directly.
     */
    useImperativeHandle(ref, () => ({ getSecureValue, purge }), [
      getSecureValue,
      purge,
    ]);

    // ── onChange effect ─────────────────────────────────────────────────────

    /**
     * Notifies the parent whenever `masked` or `findings` change.
     *
     * Placed in a `useEffect` rather than called directly in the render body
     * because the render phase can run multiple times (React StrictMode,
     * concurrent mode interruptions). `useEffect` runs once per committed
     * render — the parent receives exactly one notification per genuine change.
     *
     * The parent receives `masked` and `findings` — never the real value.
     * Real value retrieval requires an explicit `ref.current.getSecureValue()`
     * call through the secure MessageChannel.
     */
    useEffect(() => {
      onChange?.(masked, findings);
    }, [masked, findings, onChange]);

    // ── Event handlers ──────────────────────────────────────────────────────

    /**
     * Handles input changes in DOM-scrambling mode (standard and textarea).
     *
     * **Reconstruction algorithm:**
     * The DOM contains scrambled `x` characters from the previous keystroke.
     * We cannot read the real value from it. Instead we derive the new real
     * value from three knowns:
     *   1. `realValueRef.current` — the previous real value
     *   2. `cursorPos`            — cursor position after the edit
     *   3. `delta`                — character count difference (positive = insert,
     *                               negative = delete)
     *
     * For insertions: the new character(s) live in `domValue` between
     * `cursorPos - delta` and `cursorPos` — the only non-`x` chars there.
     * Splice them into the real value at the correct position.
     *
     * For deletions: remove `|delta|` characters from the real value at the
     * cursor position.
     *
     * @param e - The React synthetic change event (input or textarea).
     */
    /**
     * Commits a new real value to the ref, sends it to the worker for pattern
     * detection, scrambles the DOM, restores the cursor, and updates the
     * auto-grow mirror div.
     *
     * Extracted from handleChange and handlePaste because both handlers share
     * identical tail logic after computing `newReal` and `cursor`. Centralising
     * here means the scrambling logic (`replace(/[^\n]/g, "x")`) and the
     * grow-div update have a single source of truth.
     *
     * @param input   - The real input or textarea element.
     * @param newReal - The new plaintext real value to commit.
     * @param cursor  - The character position to restore the cursor to.
     */
    const commitRealValue = (
      input: HTMLInputElement | HTMLTextAreaElement,
      newReal: string,
      cursor: number,
    ): void => {
      realValueRef.current = newReal;
      processText(newReal);

      // Scramble DOM — replace every non-newline character with x.
      // Newlines are preserved so the line structure stays intact and
      // setSelectionRange positions the cursor on the correct line.
      // Computed once and reused for both input.value and growRef.
      const scrambled = newReal.replace(/[^\n]/g, "x");

      // input.value is a DOM property, not an attribute — DevTools shows the
      // attribute (empty) not the property, which is expected and correct.
      input.value = scrambled;
      input.setSelectionRange(cursor, cursor);

      // Auto-grow mirror for textarea — mirrors line structure into the hidden
      // grow div so the wrapper expands correctly when Enter is pressed.
      // The trailing "\n" prevents the browser from collapsing the last
      // newline, which would make the div one line shorter than the textarea.
      if (growRef.current) {
        growRef.current.textContent = scrambled + "\n";
      }
    };

    const handleChange = (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ): void => {
      const input = e.target as HTMLInputElement | HTMLTextAreaElement;
      const domValue = input.value;
      const cursorPos = input.selectionStart ?? domValue.length;

      const prevReal = realValueRef.current;
      const delta = domValue.length - prevReal.length;

      let newReal: string;

      if (delta > 0) {
        // Insertion — slice the new real characters from the DOM value
        // (they are the only non-x characters) and splice into real value.
        const insertPos = cursorPos - delta;
        const inserted = domValue.slice(insertPos, cursorPos);
        newReal =
          prevReal.slice(0, insertPos) + inserted + prevReal.slice(insertPos);
      } else if (delta < 0) {
        // Deletion — remove |delta| characters at the cursor from real value.
        const deleteStart = cursorPos;
        const deleteEnd = deleteStart - delta; // -delta is positive here
        newReal = prevReal.slice(0, deleteStart) + prevReal.slice(deleteEnd);
      } else {
        // delta === 0 — same-length replacement.
        //
        // Two distinct cases land here:
        //
        // A) Autocorrect ("teh" → "the") — the browser overwrites a range of
        //    our scrambled x chars with the corrected real characters. Those
        //    real characters are visible in domValue as non-x, non-newline chars.
        //    We scan for them, find the replaced range, and splice the correction
        //    into the real value at the same positions.
        //
        // B) Select-all + same-length paste — handled identically: the pasted
        //    real characters appear as non-x chars in domValue at the paste
        //    position, and we splice them in the same way.
        //
        // Edge case: if autocorrect happens to produce an "x" character (e.g.
        // correcting "az" → "ax"), that position is indistinguishable from an
        // existing scrambled x and will be silently missed. This is acceptable
        // — an autocorrected "x" is vanishingly rare and the value remains
        // internally consistent even if that one character is not updated.

        let replaceStart = -1;
        let replaceEnd = -1;

        for (let i = 0; i < domValue.length; i++) {
          if (domValue[i] !== "x" && domValue[i] !== "\n") {
            if (replaceStart === -1) replaceStart = i;
            replaceEnd = i + 1;
          }
        }

        if (replaceStart !== -1) {
          // Real characters found — splice the corrected text into realValue
          // at the same character positions the autocorrect targeted.
          const replacement = domValue.slice(replaceStart, replaceEnd);
          newReal =
            prevReal.slice(0, replaceStart) +
            replacement +
            prevReal.slice(replaceEnd);
        } else {
          // No real characters visible — nothing actually changed.
          newReal = prevReal;
        }
      }

      commitRealValue(input, newReal, cursorPos);
    };

    /**
     * Handles input changes in accessibility mode (`type="password"`).
     *
     * No DOM scrambling is needed — the browser's native password masking
     * handles visual output. Pattern detection still runs through the worker
     * on every keystroke.
     */
    const handleA11yChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
      const val = e.target.value;
      realValueRef.current = val;
      processText(val);
    };

    /**
     * Intercepts paste events before the browser inserts clipboard content.
     *
     * `e.preventDefault()` stops the browser default. We then manually
     * reconstruct the new real value by splicing the pasted text into
     * `realValueRef` at the selection range, send it to the worker, and
     * scramble the DOM.
     *
     * **Why prevent default and reconstruct rather than let handleChange run?**
     * A paste can insert hundreds of characters at once. `handleChange`
     * infers what changed from length differences and DOM inspection — correct
     * but indirect. `handlePaste` reads the pasted text directly from the
     * `ClipboardEvent`, which is more explicit and reliable for large pastes.
     *
     * **Sensitive paste detection:**
     * Uses `FIELDSHIELD_PATTERNS` from `patterns.ts` directly — the same source
     * the worker receives via CONFIG. This guarantees the paste pre-scan is
     * always in sync with the worker scan without duplicating any pattern
     * strings. The `onSensitivePaste` callback is fired synchronously before
     * the paste lands — important for real-time audit logging.
     *
     * @param e - The React synthetic clipboard event.
     */
    const handlePaste = (
      e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ): void => {
      e.preventDefault(); // Cancel browser default paste

      const pasted = e.clipboardData.getData("text/plain");
      const input = e.target as HTMLInputElement | HTMLTextAreaElement;
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? 0;
      const prev = realValueRef.current;

      // Splice pasted text into real value at selection range.
      // If text was selected (start !== end), it is replaced by the paste.
      // If cursor only (start === end), paste is inserted at cursor position.
      const newReal = prev.slice(0, start) + pasted + prev.slice(end);
      const newCursor = start + pasted.length;

      commitRealValue(input, newReal, newCursor);

      // Pre-screen pasted content for sensitive patterns.
      // Only fires if the consumer provided the callback — skip scanning
      // entirely if the result would go unused.
      if (onSensitivePaste && pasted) {
        const activePatterns = [
          ...Object.entries(FIELDSHIELD_PATTERNS),
          ...customPatterns.map((p) => [p.name, p.regex] as [string, string]),
        ];

        const pasteFindings = activePatterns
          .filter(([, source]) => {
            try {
              return new RegExp(source, "i").test(pasted);
            } catch {
              return false;
            }
          })
          .map(([name]) => name);

        if (pasteFindings.length > 0) {
          /**
           * Build an accurate masked preview of the pasted text by running
           * each matched pattern's replace over a copy of the pasted string.
           * This mirrors exactly what the worker will produce — only sensitive
           * spans are replaced with █, non-sensitive text is left readable.
           *
           * Previously this used `pasted.replace(/\S/g, "█")` which masked
           * every non-whitespace character, making non-sensitive words like
           * "Patient:" appear blocked in the callback payload.
           */
          let maskedPaste = pasted;
          for (const [, source] of activePatterns) {
            try {
              maskedPaste = maskedPaste.replace(
                new RegExp(source, "gi"),
                (match) => "█".repeat(match.length),
              );
            } catch {
              /* skip invalid patterns */
            }
          }

          onSensitivePaste({
            timestamp: new Date().toISOString(),
            fieldLabel: ariaLabel,
            findings: [...new Set(pasteFindings)],
            masked: maskedPaste,
            eventType: "paste",
          });
        }
      }
    };

    /**
     * Intercepts copy and cut events.
     *
     * **If sensitive patterns are present:**
     * Writes the masked substring for the selected range to the clipboard.
     * The real value never reaches the clipboard, preventing accidental
     * exfiltration to LLMs, chat tools, or other applications.
     *
     * **If no sensitive patterns are present:**
     * Writes the real selected substring to the clipboard — preserving normal
     * copy behaviour for clean content.
     *
     * **Partial selection:**
     * `selectionStart` / `selectionEnd` from the real input are used to slice
     * both `masked` and `realValueRef.current`. Because `masked` is always the
     * same length as the real value (each character masked 1:1), the same index
     * positions apply to both strings — the clipboard always receives exactly
     * what the user selected, never the entire field.
     *
     * Wired to both `onCopy` and `onCut`. `e.type` is used to populate the
     * `eventType` field in the callback payload.
     *
     * @param e - The React synthetic clipboard event.
     */
    const handleCopy = (
      e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ): void => {
      // Cancel browser default — without this the DOM value ("xxxxx") would
      // be written to the clipboard instead of the real or masked text.
      e.preventDefault();

      const input = e.target as HTMLInputElement | HTMLTextAreaElement;
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? realValueRef.current.length;

      // `masked` is guaranteed to be the same length as `realValueRef.current`
      // because the worker replaces each sensitive character with exactly one █.
      // The same slice indices therefore apply to both strings.
      const selectedMasked = masked.slice(start, end);
      const selectionHasSensitiveData = selectedMasked.includes("█");

      if (isUnsafe && selectionHasSensitiveData) {
        // Selection contains sensitive data — write masked value to clipboard
        // so the real SSN / API key never reaches the clipboard.
        e.clipboardData.setData("text/plain", selectedMasked);

        // Fire optional callback — consuming app can toast, log, or audit.
        // ?.() — only calls the function if the prop was provided.
        onSensitiveCopyAttempt?.({
          timestamp: new Date().toISOString(),
          fieldLabel: ariaLabel,
          findings: [...findings], // snapshot — prevents receiver holding
          // reference to internal state
          masked: selectedMasked,
          eventType: e.type === "cut" ? "cut" : "copy",
        });
      } else {
        // Selection is clean — either the field has no sensitive data, or the
        // user selected a portion that contains no sensitive spans. Give them
        // the real value for what they selected.
        e.clipboardData.setData(
          "text/plain",
          realValueRef.current.slice(start, end),
        );
      }

      // ── Cut: delete the selected slice from internal state ────────────────
      //
      // `e.preventDefault()` above suppresses the browser's default cut
      // behaviour — which would have removed the selected x-characters from
      // the DOM. We must manually perform the deletion against `realValueRef`
      // and re-process so the worker updates `masked` and `findings`.
      //
      // Without this, cut writes the correct value to the clipboard but the
      // field visually retains the full content — the selection stays in place
      // and the real value is never shortened.
      if (e.type === "cut") {
        const before = realValueRef.current.slice(0, start);
        const after = realValueRef.current.slice(end);
        realValueRef.current = before + after;

        // Re-process remaining value so masked and findings stay in sync.
        processText(realValueRef.current);

        // Sync the DOM input value to the new length.
        //
        // e.preventDefault() suppressed the browser's deletion, so input.value
        // still contains the full original x-string. handleChange computes
        // deltas by comparing input.value length against realValueRef length —
        // if they are out of sync, the next keystroke sees a mismatch and
        // produces a spurious "x" instead of the typed character.
        //
        // Writing a new x-string of the correct length here keeps the two in
        // sync so the next handleChange delta is computed correctly.
        const newScrambled = "x".repeat(realValueRef.current.length);
        requestAnimationFrame(() => {
          input.value = newScrambled;
          input.setSelectionRange(start, start);
        });
      }
    };

    // ── Render: Accessibility mode ──────────────────────────────────────────

    /**
     * A11y mode render path — uses `type="password"` for native browser
     * masking. No DOM scrambling overlay is rendered.
     *
     * Screen readers interact with this path identically to any standard
     * password field, with an additional `aria-live` region that announces
     * when sensitive patterns are detected.
     */
    if (a11yMode) {
      return (
        <div
          className={`fieldshield-container${className ? ` ${className}` : ""}`}
          style={style}
          role="group"
          aria-labelledby={inputId}
          data-disabled={disabled || undefined}
        >
          {/* WCAG 2.1 SC 1.3.1 — programmatic label via htmlFor/id pair */}
          {label && (
            <label htmlFor={inputId} className="fieldshield-label">
              {label}
            </label>
          )}

          {/* Announced when the input receives focus — visible only to screen readers */}
          <span id={descriptionId} className="fieldshield-sr-only">
            This field is protected. Sensitive data patterns will be detected
            and blocked from copying.
          </span>

          <input
            id={inputId}
            ref={inputRef}
            type="password"
            className="fieldshield-a11y-input"
            placeholder={placeholder}
            onChange={handleA11yChange}
            onCopy={handleCopy}
            onCut={handleCopy}
            onPaste={handlePaste}
            onFocus={onFocus}
            onBlur={onBlur}
            disabled={disabled}
            required={required}
            maxLength={maxLength}
            inputMode={inputMode}
            spellCheck={false}
            autoComplete="off"
            aria-required={required}
            aria-describedby={`${descriptionId} ${isUnsafe ? warningId : ""}`.trim()}
            aria-invalid={isUnsafe ? "true" : "false"}
          />

          {/*
           * role="status" — polite live region announced without interrupting
           * current screen reader speech. aria-atomic re-reads entire region
           * on any change. Always present in the DOM — live regions must exist
           * at mount time to be tracked reliably by all screen readers.
           */}
          <div
            id={warningId}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="fieldshield-findings"
          >
            {isUnsafe && (
              <>
                <span className="fieldshield-warning-icon" aria-hidden="true">
                  ⚠
                </span>
                <span className="fieldshield-warning-text">
                  Sensitive data detected. Clipboard blocked for:{" "}
                </span>
                {findings.map((f) => (
                  <span
                    key={f}
                    className="fieldshield-tag"
                    aria-label={`pattern: ${f}`}
                  >
                    {f}
                  </span>
                ))}
              </>
            )}
          </div>
        </div>
      );
    }

    // ── Render: Standard mode ───────────────────────────────────────────────

    /**
     * Standard mode render path — DOM scrambling active.
     *
     * **Layer structure**
     * ```
     * ┌─────────────────────────────────────────┐
     * │ fieldshield-field-wrapper (position:relative│
     * │                                          │
     * │  fieldshield-mask-layer (position:absolute) │ ← sighted users see this
     * │  "Hello ████ World"   aria-hidden="true" │   screen readers skip it
     * │                                          │
     * │  fieldshield-real-input  (position:absolute)│ ← keyboard/cursor lives here
     * │  "xxxxxxxxxxxxxxxxxxx" color:transparent  │
     * └─────────────────────────────────────────┘
     * ```
     *
     * The real input is transparent but receives all keyboard events.
     * Screen readers receive the `aria-label` description rather than
     * the `x` characters stored in the DOM.
     *
     * **Textarea auto-grow:**
     * A hidden `fieldshield-grow` div mirrors the scrambled content. Its height
     * is measured by CSS to expand the field wrapper — the real textarea and
     * mask layer inherit this height, giving native auto-grow behaviour
     * without JavaScript height calculations.
     */
    return (
      <div
        className={`fieldshield-container${className ? ` ${className}` : ""}`}
        style={style}
        role="group"
        aria-labelledby={inputId}
        data-disabled={disabled || undefined}
      >
        {label && (
          <label htmlFor={inputId} className="fieldshield-label">
            {label}
          </label>
        )}

        {/* Visible only to screen readers — explains the field's behaviour */}
        <span id={descriptionId} className="fieldshield-sr-only">
          Sensitive field. Input is protected. Sensitive data patterns will be
          detected and blocked from copying.
        </span>

        <div className="fieldshield-field-wrapper">
          {/*
           * Visual overlay — aria-hidden so screen readers skip entirely.
           * Renders `masked` from the worker — sensitive spans already replaced
           * with █ before this div ever receives the value.
           * `fieldshield-mask-unsafe` adds a red border/background when sensitive
           * content is detected.
           */}
          <div
            className={`fieldshield-mask-layer${isUnsafe ? " fieldshield-mask-unsafe" : ""}`}
            aria-hidden="true"
          >
            {masked || (
              <span className="fieldshield-placeholder">{placeholder}</span>
            )}
          </div>

          {/*
           * Auto-grow mirror for textarea.
           * Hidden from users and screen readers. Mirrors the scrambled content
           * so CSS grid auto-sizing can measure the required height and expand
           * the field wrapper accordingly.
           * aria-hidden — purely a layout measurement tool, no semantic value.
           */}
          {type === "textarea" && (
            <div
              ref={growRef}
              className="fieldshield-grow"
              aria-hidden="true"
            />
          )}

          {/*
           * Real input — transparent to sighted users via color:transparent.
           * All keyboard events, focus, and cursor positioning happen here.
           * Screen readers receive aria-label instead of the scrambled DOM value.
           *
           * aria-label       — overrides scrambled "xxxxx" for screen readers
           * aria-invalid     — signals error state to assistive technology
           * aria-describedby — points to static description + dynamic warning
           * autoComplete     — off, prevents browser suggestions overlaying mask
           * spellCheck       — false, prevents red squiggles on x characters
           *                    and stops text leaking to browser spell service
           */}
          {type === "textarea" ? (
            <textarea
              ref={textareaRef}
              id={inputId}
              className="fieldshield-real-input"
              placeholder={placeholder}
              onChange={handleChange}
              onPaste={handlePaste}
              onCopy={handleCopy}
              onCut={handleCopy}
              onFocus={onFocus}
              onBlur={onBlur}
              disabled={disabled}
              required={required}
              maxLength={maxLength}
              rows={rows}
              inputMode={inputMode}
              spellCheck={false}
              autoComplete="off"
              aria-required={required}
              aria-label={
                isUnsafe
                  ? `${ariaLabel} — sensitive data detected`
                  : `${ariaLabel} — protected input`
              }
              aria-describedby={`${descriptionId} ${isUnsafe ? warningId : ""}`.trim()}
              aria-invalid={isUnsafe ? "true" : "false"}
            />
          ) : (
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              className="fieldshield-real-input"
              placeholder={placeholder}
              onChange={handleChange}
              onPaste={handlePaste}
              onCopy={handleCopy}
              onCut={handleCopy}
              onFocus={onFocus}
              onBlur={onBlur}
              disabled={disabled}
              required={required}
              maxLength={maxLength}
              inputMode={inputMode}
              spellCheck={false}
              autoComplete="off"
              aria-required={required}
              aria-label={
                isUnsafe
                  ? `${ariaLabel} — sensitive data detected`
                  : `${ariaLabel} — protected input`
              }
              aria-describedby={`${descriptionId} ${isUnsafe ? warningId : ""}`.trim()}
              aria-invalid={isUnsafe ? "true" : "false"}
            />
          )}
        </div>

        {/*
         * Findings live region — role="status" (polite) rather than
         * role="alert" (assertive). Findings update on every keystroke —
         * assertive would interrupt the user constantly. Polite announces at
         * the next natural pause in screen reader speech.
         *
         * aria-atomic="true" — re-reads the entire region on any change so the
         * user hears "Sensitive data detected. Clipboard blocked for: SSN PHONE"
         * rather than just "PHONE" when a second pattern is added.
         */}
        <div
          id={warningId}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="fieldshield-findings"
        >
          {isUnsafe && (
            <>
              <span className="fieldshield-warning-icon" aria-hidden="true">
                ⚠
              </span>
              <span className="fieldshield-warning-text">
                Sensitive data detected. Clipboard blocked for:{" "}
              </span>
              {findings.map((f) => (
                <span
                  key={f}
                  className="fieldshield-tag"
                  aria-label={`pattern: ${f}`}
                >
                  {f}
                </span>
              ))}
            </>
          )}
        </div>
      </div>
    );
  },
);

FieldShieldInput.displayName = "FieldShieldInput";
