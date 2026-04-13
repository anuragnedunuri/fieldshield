# Changelog

All notable changes to FieldShield are documented here.

This project follows [Semantic Versioning](https://semver.org/):
- **Patch** (`1.0.x`) — bug fixes, false positive/negative corrections to existing patterns
- **Minor** (`1.x.0`) — new patterns, new props, new features — backwards compatible
- **Major** (`x.0.0`) — breaking API changes

Pattern updates are **minor releases**, not patches. A new pattern could start flagging content that was previously clean. Review pattern changes before upgrading.

---

## [1.1.4] — 2026-04-13

> All v1.1.x releases have been CSS and UX refinements. The Web Worker
> isolation, DOM scrambling, `MessageChannel`-based `GET_TRUTH` delivery,
> clipboard interception, and pattern detection architecture are unchanged
> since v1.0.0. Consumers who reviewed FieldShield's threat model at v1.0
> adoption do not need to re-review their security assumptions for any
> 1.1.x upgrade.

### Fixed

- Cursor drift root cause — identified and fixed. v1.1.1 forced
  monospace on `.fieldshield-real-input` but left `.fieldshield-mask-layer`
  inheriting the consumer's proportional font. Because the real input
  contains scrambled `xxxxx` and the mask layer contains the actual
  typed characters with `█` for sensitive spans, the two layers are
  rendering DIFFERENT strings. In proportional fonts different strings
  have different per-character advance widths, so the caret (positioned
  by the browser using monospace advances in the real input) landed
  over the wrong glyph in the mask layer starting from character 1.
  Pattern detection amplified the drift further because `█` in most
  proportional fonts has a different advance than `x` in monospace.

  **Fix:** apply the same monospace font stack
  (`ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas,
  "DejaVu Sans Mono", monospace !important`) to `.fieldshield-mask-layer`
  and `.fieldshield-grow` in addition to `.fieldshield-real-input`. Both
  layers now render every glyph at identical pixel advance regardless
  of the consumer's page font.

- Horizontal scroll sync — when typed content exceeded the field's
  visible width, the real input auto-scrolled its content to keep the
  caret visible but the mask layer (`overflow: hidden`, no native scroll)
  stayed put, leaving the caret on top of the wrong character. Added a
  scroll-sync effect that reads `input.scrollLeft`/`scrollTop` on every
  scroll event and writes an inverse `transform: translate(...)` to the
  mask layer. Scroll sync now works for both single-line and textarea.

- Vertical alignment (cursor above / below text) — replaced
  `display: flex; align-items: center` on the mask layer with an explicit
  `line-height` matched on both layers:
  `line-height: calc(var(--fieldshield-min-height) - 2 * var(--fieldshield-border-width))`.
  Native `<input>` and `<div>` compute `line-height: normal` inconsistently,
  so flex-centering produced a sub-pixel-to-multi-pixel offset between
  the caret and the mask text. Setting an explicit matching line-height
  on both layers makes them center identically.

- Textarea line-wrap drift — added `box-sizing: border-box` to
  `.fieldshield-real-input`. Previously content-box + `width: 100%` +
  padding gave the real input a content area 24px wider than the mask
  layer, so textarea text wrapped at different column counts in each
  layer and the cursor drifted from the second wrapped line onward.

- Demo app mobile background — on narrow viewports (375px mobile) the
  dark terminal background stopped halfway down the page and showed the
  browser default grey below. Root cause: `html, body, #root { height:
  100% }` fixed body at viewport height, so when stacked content exceeded
  100vh the background ended at the body border. Fixed by changing to
  `min-height: 100%` so body grows with content, and adding
  `background-color: var(--app-bg)` to `html` as a belt-and-suspenders
  fallback. Demo-app-only change — library consumers unaffected.

### Added

- New CSS token `--fieldshield-border-width` (default `1px`). The wrapper
  border width is now a design token. The `line-height` calc on both
  layers derives from this token, so consumers who need to change the
  border width via the token get correct vertical centering
  automatically.

### Tests

- 5 new Vitest unit tests (`FieldShieldInput — mask layer font
  consistency`) covering the overlay architecture invariants the font
  fix depends on. Total: 459 unit tests (was 454).
- 4 new Playwright E2E tests in a new `e2e/cursor-alignment.spec.ts`
  file: first-character cursor position, per-character tracking through
  structured SSN input, pattern-detection-does-not-move-cursor
  regression, and backspace-from-mid-string. Total: 49 E2E tests
  (was 45).

### Known limitations

- **Design-system font integration** — FieldShield fields currently render
  in monospace at all times. This is a structural consequence of the
  architecture: `input.value` is scrambled to `xxxxx` for security (so
  DOM scraping sees no real data), while the visible mask layer renders
  the actual typed characters with `█` for sensitive spans. In
  proportional fonts, `xxxxx` and `Hello` have different total widths —
  the caret position (computed from the real input's character advances)
  diverges from where the mask layer paints the corresponding character.
  The only way to guarantee advance widths match across two DIFFERENT
  strings is to use a font where every character has the same advance
  width — monospace.

  Consumer font support would require either (a) putting real characters
  in `input.value` (breaks the security model) or (b) per-character
  runtime measurement (expensive and fragile). We are exploring options
  for this limitation in a future release.

---

## [1.1.3] — 2026-04-11

### Fixed

- CSS inheritance lockdown — six inheritable CSS properties
  now explicitly reset on .fieldshield-mask-layer and
  .fieldshield-grow so consumer parent styles cannot break
  cursor/text alignment:
  - text-align: shifts visible text but not cursor
  - text-indent: offsets first line away from cursor start
  - text-transform: changes glyph widths causing cursor drift
  - font-variant-ligatures: collapses 2 chars to 1 wider glyph
  - font-kerning: kern pairs shift advance widths cumulatively
  - hyphens: auto-breaks lines at different points than real input
- text-align and text-indent also reset on .fieldshield-real-input
  so cursor originates from same edge as visible text
- Replaced :has(textarea) CSS selector with [data-type="textarea"]
  attribute selector — more reliable across consumer app contexts
  where CSS import order or specificity can affect :has() behavior
- Empty textarea now enforces minimum 2-row height instead of
  collapsing to single-line height

### Tests

- 2 new Vitest unit tests — data-type attribute present/absent
  in textarea vs text mode
- 7 new Playwright E2E tests — each of the 5 locked CSS properties
  verified to not cascade in, plus textarea data-type checks
- Total: 454 unit + 45 E2E tests, all passing

### Notes

- Root cause: standard Vite template has #root { text-align: center }
  which cascaded into mask layer. Demo app never exposed this because
  it sets no text-align on parent elements.
- This is a novel finding — documents CSS containment gap beyond
  scoped selectors for overlay-based security components.

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
