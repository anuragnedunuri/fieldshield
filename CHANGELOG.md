# Changelog

All notable changes to FieldShield are documented here.

This project follows [Semantic Versioning](https://semver.org/):
- **Patch** (`1.0.x`) — bug fixes, false positive/negative corrections to existing patterns
- **Minor** (`1.x.0`) — new patterns, new props, new features — backwards compatible
- **Major** (`x.0.0`) — breaking API changes

Pattern updates are **minor releases**, not patches. A new pattern could start flagging content that was previously clean. Review pattern changes before upgrading.

---

## [1.1.3] — 2026-04-09

### Fixed

- **CSS inheritance lockdown** (`fieldshield.css`) — six inheritable CSS properties are now explicitly reset on `.fieldshield-mask-layer` and `.fieldshield-grow` to prevent consumer parent styles from silently breaking cursor/text alignment:
  - `text-align: start` — consumer `text-align: center` or `right` shifts mask text but not the cursor, causing visible misalignment
  - `text-indent: 0` — first-line indent offsets mask text from cursor start position
  - `text-transform: none` — `uppercase`/`lowercase` changes glyph advance widths in proportional fonts, drifting cursor relative to visible characters
  - `font-variant-ligatures: none` — `fi`/`fl` ligatures collapse two characters into one wider glyph, shifting cursor position beyond the ligature
  - `font-kerning: none` — kern pairs adjust advance widths between specific character pairs, accumulating cursor drift over long values
  - `hyphens: none` — `hyphens: auto` inserts soft breaks at different points than the hidden real input, desynchronising line wrapping
- **`text-align` and `text-indent` reset on `.fieldshield-real-input`** — the cursor must originate from the same edge as the mask layer text; mismatched alignment offsets the cursor horizontally on every character.
- **Textarea selector reliability** (`fieldshield.css`, `FieldShieldInput.tsx`) — replaced CSS `:has(textarea)` pseudo-class selectors with `[data-type="textarea"]` attribute selectors. The component now sets `data-type="textarea"` on the field wrapper div in textarea mode. `:has(textarea)` is valid in Chrome 105+ but can fail in consumer app contexts due to CSS import order or specificity issues; an explicit attribute is fully under component control.
- **Textarea minimum height** — the wrapper and grow div now enforce a minimum height of 2 text rows (`2 × line-height × font-size + 2 × padding-y`) so an empty textarea always displays as a textarea rather than collapsing to a single line.

### Tests

- Added 2 Vitest unit tests: `data-type="textarea"` attribute present in textarea mode; no `data-type` attribute in default text mode.
- Added 7 Playwright E2E tests in a new `"CSS inheritance lockdown"` describe block: `text-align: center`, `text-indent`, `text-transform`, `font-variant-ligatures`, and `font-kerning` consumer styles are all overridden by the lockdown; `[data-type="textarea"]` wrapper present for textarea fields; single-line wrapper has no `data-type` attribute.

### Documentation

- Added **"CSS inheritance and customisation"** section to `README.md` Known limitations. Lists all 6 locked properties with explanations, shows correct (direct class targeting) vs incorrect (relying on inheritance) consumer CSS patterns.

---

## [1.1.2] — 2026-04-09

### Fixed

- **Placeholder blur** (`fieldshield.css`) — added `.fieldshield-real-input::placeholder { color: transparent }`. After the v1.1.1 monospace fix, the native `::placeholder` was rendering in monospace on top of the mask layer's `<span class="fieldshield-placeholder">` which renders in the consumer's font, causing a visible blur/ghost effect on empty fields. Suppressing the native placeholder makes the mask layer span the sole visible placeholder in standard mode. `a11yMode` is unaffected — its separate `.fieldshield-a11y-input::placeholder` rule is unchanged.
- **CSS import path** (`package.json`) — added `"./style"` to the `exports` map so consumers can import the stylesheet as `import "fieldshield/style"` instead of having to use the full internal path `../node_modules/fieldshield/dist/assets/fieldshield.css`. The full path `"./dist/assets/fieldshield.css"` remains in exports for backwards compatibility. Added `dist/style.d.ts` type stub so TypeScript resolves the import without errors. Updated `sideEffects` from `false` to `["./dist/assets/fieldshield.css"]` so bundlers do not tree-shake the CSS import.

---

## [1.1.1] — 2026-04-09

### Fixed

- **Cursor drift in proportional font environments** — `.fieldshield-real-input` now enforces a monospace font stack (`ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, "DejaVu Sans Mono", monospace`) with `!important`, overriding any consumer font. The real input is always `color: transparent` and sits behind the mask layer — the consumer never sees it, only the cursor. Forcing monospace ensures the cursor advances in uniform steps regardless of the consumer's proportional font (Inter, Roboto, Arial, etc.).
- **Root cause** — the demo app used IBM Plex Mono (`--fieldshield-font-family: var(--font-mono)`) which masked the bug during development. In consumer apps with proportional fonts the cursor position drifted because `font-family: inherit` caused the real input to pick up the consumer's font where character advances are not uniform.
- `.fieldshield-a11y-input` is unaffected — the password input retains `font-family: inherit` so the consumer's font renders correctly for the dot/bullet masking the browser applies natively.

### Notes

- The mask layer (what users actually see) still inherits the consumer's font — visual output is unchanged.
- No consumer-side changes required.

---

## [1.1.0] — 2026-04-08

### Fixed

- **Worker instantiation** (`useFieldShield.ts`) — replaced `new URL("../workers/fieldshield.worker.ts", import.meta.url)` with a blob URL via Vite's `?worker&inline` import. The previous approach referenced the TypeScript source file which does not exist in the published npm package, causing a runtime worker failure for all npm consumers. The worker is now compiled and inlined into `fieldshield.js` at build time; no separate worker file, no bundler configuration required.
- **CSS cursor drift** (`fieldshield.css`) — added `letter-spacing: 0`, `word-spacing: 0`, and `font-weight: inherit` to `.fieldshield-mask-layer`, `.fieldshield-real-input`, and `.fieldshield-grow`. Without these, consumer stylesheets that set non-zero letter or word spacing on a parent element would cascade unevenly into both overlay layers, causing the cursor to appear offset from the displayed masked text.

### Changed

- **`CREDIT_CARD` pattern** — broadened Mastercard prefix from `5[1-5]` to `5\d` to cover all IIN ranges; added `6\d{3}` variant for Discover and UnionPay cards. Luhn validation is still recommended post-match in production.

### Documentation

- Updated **Framework compatibility** section — the worker is now bundled inline; no per-bundler configuration (worker-loader, publicPath) is needed for any framework.
- Updated **CSP section** — `worker-src 'self' blob:` is now **required** (not optional). The `blob:` source is mandatory for the inlined worker to load.

---

## [1.0.1] — 2026-04-07

### Fixed

- Corrected repository URL, homepage, and bugs URL in `package.json` — links now point to the correct GitHub repository.
- Updated `author` field in `package.json`.

---

## [1.0.0] — 2026

Initial public release.

### Architecture

- Web Worker isolation — real input value (`internalTruth`) stored exclusively in a dedicated worker thread, never in the DOM
- DOM scrambling — `input.value` always contains scrambled `x` characters, never the real value
- MessageChannel point-to-point delivery for `getSecureValue()` — browser extensions monitoring `postMessage` cannot intercept the response
- Clipboard interception — copy and cut events write masked `█` characters to the clipboard, not the real value
- Paste interception — paste events are scanned before the browser inserts content; `onSensitivePaste` returning `false` blocks the paste entirely
- Worker initialization fallback — if the Worker constructor throws (e.g. strict CSP), the component automatically falls back to `a11yMode`
- Worker message payload validation — UPDATE messages with invalid payload shapes are silently discarded

### Props

- `label` — visible label text linked via `htmlFor`/`id`
- `type` — `"text"` or `"textarea"` with auto-grow support
- `placeholder` — forwarded to native element
- `a11yMode` — renders `type="password"` for WCAG 2.1 AA / Section 508 compliance; auto-activated on worker init failure
- `customPatterns` — additional patterns layered on top of built-in defaults; use with `OPT_IN_PATTERNS` for field-specific opt-in patterns
- `maxProcessLength` — blocks input exceeding the character limit (default `100_000`); blocking rather than truncating prevents blind spots
- `onMaxLengthExceeded` — called when input is blocked by `maxProcessLength`
- `onSensitiveCopyAttempt` — fired on copy/cut when sensitive patterns are present
- `onSensitivePaste` — fired on paste when sensitive patterns are detected; return `false` to block the paste
- `onWorkerError` — fired when the worker encounters a runtime error
- `onChange` — fires after each worker UPDATE with masked value and findings
- `disabled`, `required`, `maxLength`, `rows`, `inputMode`, `className`, `style`, `onFocus`, `onBlur`

### Ref methods

- `getSecureValue()` — retrieves real value from worker memory via private MessageChannel; rejects after 3 second timeout
- `purge()` — zeros `internalTruth` in worker memory

### Hooks and utilities

- `useFieldShield` — hook managing worker lifecycle, pattern detection, and secure value retrieval
- `useSecurityLog` — capped, auto-timestamped audit event log with `makeClipboardHandler`, `pushEvent`, `clearLog`
- `collectSecureValues` — parallel `getSecureValue()` across multiple fields via `Promise.allSettled`
- `purgeSecureValues` — simultaneous `purge()` across multiple fields

### Built-in patterns

**13 active by default** — enabled on every `FieldShieldInput` without configuration.

**PII (6):** `SSN`, `EMAIL`, `PHONE`, `CREDIT_CARD`, `DATE_OF_BIRTH`, `TAX_ID`

**Healthcare (1):** `UK_NIN`

**Credentials (6):** `AI_API_KEY`, `AWS_ACCESS_KEY`, `GITHUB_TOKEN`, `STRIPE_KEY`, `JWT`, `PRIVATE_KEY_BLOCK`

**Opt-in (5):** `IBAN`, `DEA_NUMBER`, `SWIFT_BIC`, `NPI_NUMBER`, `PASSPORT_NUMBER` — exported via `OPT_IN_PATTERNS`, not active by default. These patterns produce unacceptably high false positive rates in free-text and clinical note fields. Use via `customPatterns` only on fields where the specific data type is expected.

```tsx
import { OPT_IN_PATTERNS } from "fieldshield";

<FieldShieldInput
  label="DEA Number"
  customPatterns={[{ name: "DEA_NUMBER", regex: OPT_IN_PATTERNS.DEA_NUMBER }]}
/>
```

### Security

- No-network guarantee — worker contains zero `fetch()`, `XMLHttpRequest`, `WebSocket`, `EventSource`, or `sendBeacon()` calls
- CSP guidance — `worker-src 'self' blob:` recommended for regulated deployments
- `THREAT_MODEL.md` — full threat model with 9 mitigated threats, 9 unmitigated threats, environment assumptions, residual risk table, and compliance mapping

### Documentation

- `README.md` — full API documentation, framework compatibility (Vite, Webpack 4/5, Next.js, SSR), form library integration (RHF, Formik, Zod), CSP guidance, known limitations, compliance notes
- `THREAT_MODEL.md` — threat model for security engineers and compliance auditors
- `LICENSE` — MIT

### Test coverage

- Vitest unit tests — 454 tests across 7 modules
- Playwright e2e tests — 38 tests covering real clipboard, worker isolation, DOM protection, worker fallback, accessibility

### Known limitations

- `realValueRef` exists on the main thread while the user is actively typing — readable by debuggers and privileged extensions
- No `id` prop override — `useId()` generates stable IDs automatically
- `name` prop not supported — native form submission not supported; use `getSecureValue()` on submit
- `onCopy`/`onCut` props not forwarded — use `onSensitiveCopyAttempt` instead
- IME composition (CJK input) not supported — use `a11yMode` as fallback
- No cross-field PHI combination detection — planned for v2.0
- Names and addresses cannot be detected with regex — server-side NER required
