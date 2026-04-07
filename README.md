# FieldShield

Sensitive input protection for React applications. Prevents DOM-based exposure of typed values, intercepts clipboard operations, and provides structured security logging for HIPAA and PCI-DSS compliance.

```tsx
<FieldShieldInput
  label="Social Security Number"
  onSensitiveCopyAttempt={(e) => log(e)}
  onSensitivePaste={(e) => false} // block sensitive pastes
/>
```

---

## Contents

- [How it works](#how-it-works)
- [Installation](#installation)
- [Framework compatibility](#framework-compatibility)
- [Quick start](#quick-start)
- [Form library integration](#form-library-integration)
- [FieldShieldInput props](#fieldshieldinput-props)
- [Ref methods](#ref-methods)
- [Clipboard callbacks](#clipboard-callbacks)
- [maxProcessLength](#maxprocesslength)
- [Custom patterns](#custom-patterns)
- [Accessibility mode](#accessibility-mode)
- [useSecurityLog](#usesecuritylog)
- [collectSecureValues](#collectsecurevalues)
- [Built-in patterns](#built-in-patterns)
- [Content Security Policy](#content-security-policy)
- [Security architecture](#security-architecture)
- [Known limitations](#known-limitations)
- [Versioning and pattern updates](#versioning-and-pattern-updates)
- [TypeScript](#typescript)
- [Compliance notes](#compliance-notes)

---

## How it works

FieldShield protects against three attack vectors:

**DOM scraping** — Browser extensions, session recording tools (FullStory, LogRocket), and automated scrapers read `input.value` from the DOM. FieldShield stores the real value in an isolated Web Worker thread and writes only scrambled `x` characters to `input.value`. The DOM never contains the real value.

**Clipboard exfiltration** — Users accidentally copy sensitive text into LLMs, email clients, or unsecured applications. FieldShield intercepts copy and cut events and writes masked content (`█` characters) to the clipboard instead of the real value. The selection indices are preserved so partial copies also produce masked output.

**Paste exposure** — Sensitive data pasted from another source lands in the DOM and may be captured by recording tools. FieldShield intercepts paste events, scans the pasted content against all active patterns, and fires `onSensitivePaste` with the findings. Returning `false` from the callback blocks the paste entirely.

---

## Installation

```bash
npm install fieldshield
```

FieldShield requires React 18 or later.

---

## Framework compatibility

FieldShield uses the `new URL('./fieldshield.worker.ts', import.meta.url)` pattern to instantiate its Web Worker. This is supported natively in Vite and in Webpack 5+ with no additional configuration.

### Vite

Works out of the box. No configuration required.

### Webpack 5

Works out of the box with Webpack 5's built-in Web Worker support.

### Webpack 4

Requires `worker-loader`:

```bash
npm install --save-dev worker-loader
```

```js
// webpack.config.js
module.exports = {
  module: {
    rules: [
      {
        test: /\.worker\.ts$/,
        use: { loader: "worker-loader" },
      },
    ],
  },
};
```

### Next.js

Next.js requires explicit worker configuration. Add the following to `next.config.js`:

```js
// next.config.js
module.exports = {
  webpack(config) {
    config.output.publicPath = "/_next/";
    return config;
  },
};
```

If you encounter issues with the worker URL resolution in Next.js, use the `NEXT_PUBLIC_` environment variable pattern to set the base URL explicitly, or open an issue — Next.js worker support is an active area of improvement.

### Server-Side Rendering (SSR)

Web Workers are browser-only APIs. FieldShieldInput will throw if rendered on the server. Wrap it in a dynamic import with `ssr: false` in Next.js:

```tsx
import dynamic from "next/dynamic";

const FieldShieldInput = dynamic(
  () => import("fieldshield").then((m) => m.FieldShieldInput),
  { ssr: false },
);
```

### Browser extension conflicts

Some browser extensions inject content into form fields and may conflict with FieldShieldInput's scrambling overlay:

- **Grammarly** — injects spell-check nodes that attempt to correct scrambled `x` characters. FieldShieldInput sets `spellcheck="false"` automatically, but if you see Grammarly interference add `data-gramm="false" data-gramm_editor="false"` to the container via the `className` or wrap with a div containing those attributes.
- **LastPass / 1Password** — these tools look for `type="password"` fields. FieldShieldInput is not a password field and will not trigger autofill, which is correct behavior — users should not autofill SSNs or clinical notes.

### React 19

FieldShield works with React 19 without any configuration. The library uses
`forwardRef` internally which is deprecated but fully functional in React 19.
A migration to React 19's ref-as-prop pattern is planned for v1.1.

---

## Quick start

```tsx
import { useRef } from "react";
import { FieldShieldInput } from "fieldshield";
import type { FieldShieldHandle } from "fieldshield";

export function PatientForm() {
  const ssnRef = useRef<FieldShieldHandle>(null);

  const handleSubmit = async () => {
    // Real value retrieved from isolated worker memory — never from the DOM
    const ssn = await ssnRef.current?.getSecureValue();
    await fetch("/api/patient", { body: JSON.stringify({ ssn }) });

    // Zero out worker memory after submission
    ssnRef.current?.purge();
  };

  return (
    <FieldShieldInput
      ref={ssnRef}
      label="Social Security Number"
      inputMode="numeric"
      maxLength={11}
      onSensitiveCopyAttempt={(e) => console.warn("Copy blocked:", e.findings)}
    />
  );
}
```

---

## Form library integration

### React Hook Form

React Hook Form's `register()` expects to read `e.target.value` synchronously on every keystroke. Because FieldShieldInput writes only scrambled `x` characters to `input.value`, standard `register()` will validate `"xxxxxxxxxxxx"` rather than the real value.

The correct pattern is to use RHF's `Controller` component and validate on submit using `getSecureValue()`:

```tsx
import { useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { FieldShieldInput, collectSecureValues } from "fieldshield";
import type { FieldShieldHandle } from "fieldshield";

export function PatientForm() {
  const { handleSubmit, control, setError } = useForm();
  const ssnRef = useRef<FieldShieldHandle>(null);

  const onSubmit = async () => {
    const { ssn } = await collectSecureValues({ ssn: ssnRef });

    // Validate the real value here
    if (!ssn.match(/^\d{3}-\d{2}-\d{4}$/)) {
      setError("ssn", { message: "Invalid SSN format" });
      return;
    }

    await fetch("/api/patient", { body: JSON.stringify({ ssn }) });
    ssnRef.current?.purge();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        name="ssn"
        control={control}
        render={() => (
          <FieldShieldInput
            ref={ssnRef}
            label="Social Security Number"
            inputMode="numeric"
            maxLength={11}
          />
        )}
      />
      <button type="submit">Submit</button>
    </form>
  );
}
```

The key shift is moving from synchronous per-keystroke validation to async on-submit validation. This is the correct mental model for any field where the value lives in isolated memory — validate at the point of use, not at the point of entry.

### Why not validate on every keystroke?

Standard form libraries validate on `onChange` using `e.target.value`. Because the real value lives in worker memory and `e.target.value` only contains scrambled characters, per-keystroke validation of the real value would require a `GET_TRUTH` round-trip on every keystroke — one async operation per character typed. This creates unnecessary load on the worker and introduces the async overhead that RHF's synchronous model is designed to avoid.

The recommended pattern is: validate format constraints via `maxLength` and `inputMode` during input, then validate the real value's content on submit.

### Formik

Same pattern as RHF — use `setFieldValue` in the submit handler after retrieving the real value:

```tsx
const formik = useFormik({
  initialValues: { ssn: "" },
  onSubmit: async () => {
    const { ssn } = await collectSecureValues({ ssn: ssnRef });
    if (!isValidSSN(ssn)) {
      formik.setFieldError("ssn", "Invalid SSN format");
      return;
    }
    await submitToBackend({ ssn });
    ssnRef.current?.purge();
  },
});
```

### Zod

Zod validation works naturally at the submit boundary:

```tsx
const schema = z.object({
  ssn: z.string().regex(/^\d{3}-\d{2}-\d{4}$/, "Invalid SSN format"),
});

const onSubmit = async () => {
  const values = await collectSecureValues({ ssn: ssnRef });
  const result = schema.safeParse(values);
  if (!result.success) {
    // handle errors
    return;
  }
  await submitToBackend(result.data);
};
```

---

### `label`

`string` — optional

Visible label text rendered above the field and linked via `htmlFor`/`id`. Also used as the field identifier in clipboard event payloads. When omitted no `<label>` is rendered and the field falls back to `"Protected field"` for screen reader announcements.

### `type`

`"text" | "textarea"` — default `"text"`

Renders a single-line `<input>` or a multi-line `<textarea>`. Textarea mode enables auto-grow — the field expands vertically as the user types past the initial height.

### `placeholder`

`string` — optional

Forwarded to the native `placeholder` attribute. Displayed in the mask layer when the field is empty.

### `disabled`

`boolean` — default `false`

Disables the field. Sets `data-disabled` on the container for CSS styling hooks.

### `required`

`boolean` — default `false`

Sets `aria-required` on the input so screen readers announce the field as mandatory.

### `maxLength`

`number` — optional

Native HTML `maxLength`. Use this for structured fields with known lengths — SSN (11), credit card (19), IBAN (34 max). Enforced by the browser before FieldShield processes the input.

### `rows`

`number` — default `3`

Initial visible row count. Only applies when `type="textarea"`. The field still auto-grows beyond this value.

### `inputMode`

`"text" | "numeric" | "decimal" | "tel" | "email" | "search" | "url" | "none"` — default `"text"`

Mobile keyboard hint. Does not affect value handling — the field always operates as `type="text"` internally to preserve DOM scrambling.

Use this instead of `type="number"` or `type="email"` — those change browser validation and value parsing in ways that break DOM scrambling.

```tsx
<FieldShieldInput inputMode="numeric" label="SSN" />
<FieldShieldInput inputMode="tel" label="Phone" />
```

### `className`

`string` — optional

Additional CSS class applied to the outermost container `<div>`, merged with the internal `fieldshield-container` class.

### `style`

`React.CSSProperties` — optional

Inline styles applied to the outermost container `<div>`.

### `onChange`

`(masked: string, findings: string[]) => void` — optional

Fires after each worker UPDATE response — whenever the masked value or findings change. Receives the masked display string and the current findings array. Never receives the real value.

```tsx
<FieldShieldInput
  label="Notes"
  onChange={(masked, findings) => {
    if (findings.length > 0) setHasSensitiveData(true);
  }}
/>
```

### `a11yMode`

`boolean` — default `false`

Disables DOM scrambling and renders a native `type="password"` input instead. Pattern detection and clipboard protection remain fully active.

Use this for WCAG 2.1 AA / Section 508 compliance — screen readers handle `type="password"` natively and cannot interact with the scrambled overlay used in standard mode. See [Accessibility mode](#accessibility-mode).

### `customPatterns`

`CustomPattern[]` — optional

Additional sensitive-data patterns layered on top of the built-in defaults. See [Custom patterns](#custom-patterns).

### `maxProcessLength`

`number` — default `100000`

Maximum number of characters sent to the worker for pattern detection. If the user types or pastes beyond this limit the input is **blocked** — the field reverts to its previous value.

Blocking rather than truncating is intentional. Truncation would create a blind spot where sensitive data beyond the limit is never scanned or protected.

> **Important:** Always wire up `onMaxLengthExceeded` for any field that uses `maxProcessLength`. Without it, the field silently stops accepting input with no explanation to the user.

```tsx
<FieldShieldInput
  label="Clinical Notes"
  type="textarea"
  maxProcessLength={50_000}
  onMaxLengthExceeded={(length, limit) =>
    setError(`Maximum ${limit.toLocaleString()} characters reached`)
  }
/>
```

This is distinct from `maxLength` — `maxLength` restricts the browser input, `maxProcessLength` caps worker processing. For structured fields with known lengths, use `maxLength`. For free-text fields where longer input is valid but should be bounded, use `maxProcessLength`.

### `onMaxLengthExceeded`

`(length: number, limit: number) => void` — optional

Called when input is blocked because it exceeds `maxProcessLength`. Use this to surface a character count warning or error message to the user.

A `console.warn` fires automatically even without this callback so developers see the block in DevTools.

### `onWorkerError`

`(error: ErrorEvent) => void` — optional

Called when the Web Worker encounters a runtime error. When this fires, FieldShieldInput has already reset `masked` and `findings` to empty so the field does not freeze showing stale warnings.

The worker is not terminated on error — a transient error may not affect subsequent messages. If errors persist, surface a warning and ask the user to refresh.

> **Note:** If the worker fails to initialize entirely (e.g. due to a strict CSP), the component automatically falls back to `a11yMode` — this callback is not called in that case. The fallback is silent by design but logged to `console.error`.

```tsx
<FieldShieldInput
  label="SSN"
  onWorkerError={(e) => {
    console.error("Worker error:", e.message);
    setFieldError("Worker unavailable — please refresh");
  }}
/>
```

### `onFocus`

`(e: React.FocusEvent) => void` — optional

Forwarded from the underlying input element.

### `onBlur`

`(e: React.FocusEvent) => void` — optional

Forwarded from the underlying input element.

### `onSensitiveCopyAttempt`

`(event: SensitiveClipboardEvent) => void` — optional

Fired when the user copies or cuts from the field while sensitive patterns are present. The clipboard receives the masked text instead of the real value. Use this to surface a toast notification or write a security audit log.

### `onSensitivePaste`

`(event: SensitiveClipboardEvent) => boolean | void` — optional

Fired when the user pastes content that contains sensitive patterns.

Return `false` to block the paste — the field reverts to its previous value and the clipboard content is discarded. Return nothing or `true` to allow the paste to proceed.

```tsx
// Block sensitive pastes
onSensitivePaste={(e) => {
  auditLog(e);
  return false;
}}

// Allow sensitive pastes but log them
onSensitivePaste={(e) => {
  auditLog(e);
  // return nothing — paste proceeds
}}
```

---

## Ref methods

Attach a ref typed as `FieldShieldHandle` to access imperative methods.

```tsx
const ref = useRef<FieldShieldHandle>(null);
<FieldShieldInput ref={ref} label="SSN" />;
```

### `getSecureValue()`

`() => Promise<string>`

Retrieves the real, unmasked value from the worker's isolated memory via a private `MessageChannel`. The value travels point-to-point — browser extensions monitoring `postMessage` on the page cannot intercept it.

Rejects with a timeout error if the worker does not respond within 3 seconds.

**Always handle the rejection.** A rejected `getSecureValue()` means the worker is unavailable — the field value is lost and the form cannot be submitted safely. Do not silently swallow the error.

```ts
const handleSubmit = async () => {
  try {
    const value = await ref.current?.getSecureValue();
    await fetch("/api/save", { body: JSON.stringify({ value }) });
  } catch (err) {
    // Worker timed out or was terminated — surface an error to the user
    setSubmitError(
      "Unable to retrieve field value securely. Please refresh and try again.",
    );
    return;
  }
};
```

**Session timeout pattern** — for HIPAA compliance, call `purgeSecureValues` when the session expires to ensure worker memory is zeroed before the user is logged out:

```ts
// On session timeout or logout
const handleSessionEnd = () => {
  purgeSecureValues(refs); // zero all workers simultaneously
  redirectToLogin();
};
```

### `purge()`

`() => void`

Zeros out the stored value in worker memory. Call this immediately after `getSecureValue()` resolves and the data has been sent to your backend.

```ts
const value = await ref.current?.getSecureValue();
await sendToBackend(value);
ref.current?.purge(); // fire and forget
```

---

## Clipboard callbacks

Both `onSensitiveCopyAttempt` and `onSensitivePaste` receive a `SensitiveClipboardEvent` payload:

```ts
interface SensitiveClipboardEvent {
  timestamp: string; // ISO 8601
  fieldLabel: string; // the label prop value
  findings: string[]; // e.g. ["SSN", "EMAIL"]
  masked: string; // masked preview with █ characters
  eventType: "copy" | "cut" | "paste";
}
```

`masked` contains only the selected/pasted portion with sensitive spans replaced by `█`. The length is preserved so the structure is visible — `"SSN: ███-██-████"` rather than a uniform block.

---

## maxProcessLength

The default of `100_000` characters is large enough for legitimate clinical notes and free-text fields while protecting against denial-of-service via adversarially crafted regex inputs.

For structured fields with known maximum lengths, use `maxLength` instead — the browser enforces it before FieldShield processes anything, which is more efficient.

```tsx
// Structured field — browser enforces 11 chars, worker never sees more
<FieldShieldInput label="SSN" maxLength={11} />

// Free text — worker processes up to 100k chars
<FieldShieldInput label="Clinical Notes" type="textarea" />

// Custom limit
<FieldShieldInput
  label="Notes"
  maxProcessLength={50_000}
  onMaxLengthExceeded={(length, limit) =>
    setError(`Input too long — maximum ${limit.toLocaleString()} characters`)
  }
/>
```

---

## Custom patterns

Pass an array of `CustomPattern` objects to detect additional sensitive data types specific to your application.

```tsx
<FieldShieldInput
  label="Employee Record"
  customPatterns={[
    { name: "EMPLOYEE_ID", regex: "EMP-\\d{6}" },
    { name: "BADGE_NUMBER", regex: "\\bBDG-[A-Z]{2}\\d{4}\\b" },
  ]}
  onSensitiveCopyAttempt={(e) => log(e.findings)}
/>
```

Custom patterns are layered on top of the built-in defaults — both sets run on every keystroke. If a custom pattern has the same name as a built-in, it overrides the built-in for that field.

```ts
interface CustomPattern {
  name: string; // shown in findings arrays
  regex: string; // regex source string — no delimiters, no flags
  // use double backslashes: "\\d{6}" not "\d{6}"
}
```

The worker applies `gi` flags automatically. Order is preserved — patterns run in array order.

---

## Accessibility mode

Standard mode uses a DOM scrambling overlay that is invisible to sighted users but incompatible with some screen readers. Enable `a11yMode` for WCAG 2.1 AA / Section 508 compliance:

```tsx
<FieldShieldInput ref={ref} label="SSN" a11yMode />
```

In `a11yMode`:

- A native `type="password"` input is rendered
- The browser's built-in password masking handles visual output
- Pattern detection still runs through the worker on every keystroke
- Clipboard protection remains fully active
- The scrambling overlay is not rendered

Use `a11yMode` when your users rely on screen readers (VoiceOver, NVDA, JAWS) or when WCAG compliance is required.

---

## useSecurityLog

Maintains a capped, auto-timestamped log of FieldShield security events suitable for real-time audit displays and HIPAA audit trail requirements.

```tsx
import { useSecurityLog } from "fieldshield";

const { events, makeClipboardHandler, pushEvent, clearLog } = useSecurityLog({
  maxEvents: 20, // default
});

<FieldShieldInput
  label="SSN"
  onSensitiveCopyAttempt={makeClipboardHandler("copy_cut")}
  onSensitivePaste={makeClipboardHandler("paste")}
/>;

// Display the log
{
  events.map((ev) => (
    <div key={ev.id}>
      {ev.timestamp} — {ev.type} — {ev.field} — {ev.findings.join(", ")}
    </div>
  ));
}
```

### `makeClipboardHandler(context)`

Returns a ready-to-wire `SensitiveClipboardEvent` handler.

- Pass `"copy_cut"` for `onSensitiveCopyAttempt` — inspects `e.eventType` internally to distinguish `COPY_BLOCKED` from `CUT_BLOCKED`
- Pass `"paste"` for `onSensitivePaste` — maps to `PASTE_DETECTED`

### `pushEvent(event)`

Push any event manually — use for `SUBMIT` and `PURGE` events:

```ts
pushEvent({
  field: "All fields",
  type: "SUBMIT",
  findings: [],
  detail: "3 fields submitted",
});
```

### `clearLog()`

Empties the events array and resets the ID counter.

### Event types

`COPY_BLOCKED` | `CUT_BLOCKED` | `PASTE_DETECTED` | `SUBMIT` | `PURGE` | `CUSTOM`

### Event shape

```ts
interface SecurityEvent {
  id: number; // auto-incrementing, stable React key
  timestamp: string; // from Date.toLocaleTimeString()
  field: string; // field label or custom identifier
  type: SecurityEventType;
  findings: string[]; // pattern names active at time of event
  detail?: string; // truncated masked preview (32 chars)
}
```

---

## collectSecureValues

Retrieves real values from multiple FieldShieldInput fields in parallel via `Promise.allSettled`. No plaintext exists on the main thread until this call resolves.

```tsx
import { useRef } from "react";
import {
  FieldShieldInput,
  collectSecureValues,
  purgeSecureValues,
} from "fieldshield";
import type { FieldShieldHandle } from "fieldshield";

export function PatientForm() {
  const ssnRef = useRef<FieldShieldHandle>(null);
  const notesRef = useRef<FieldShieldHandle>(null);
  const emailRef = useRef<FieldShieldHandle>(null);

  const refs = { ssn: ssnRef, notes: notesRef, email: emailRef };

  const handleSubmit = async () => {
    const values = await collectSecureValues(refs);
    // values = { ssn: "123-45-6789", notes: "...", email: "..." }

    await fetch("/api/patient", {
      method: "POST",
      body: JSON.stringify(values),
    });

    purgeSecureValues(refs); // zero all workers simultaneously
  };

  return (
    <>
      <FieldShieldInput ref={ssnRef} label="SSN" />
      <FieldShieldInput ref={notesRef} label="Clinical Notes" type="textarea" />
      <FieldShieldInput ref={emailRef} label="Email" />
      <button onClick={handleSubmit}>Submit</button>
    </>
  );
}
```

Null or unmounted refs resolve to `""` rather than throwing — a missing optional field never blocks form submission. Rejected fields also resolve to `""` with a `console.warn` identifying the field name.

`purgeSecureValues` calls `purge()` on every ref simultaneously. It is fire-and-forget — no await needed. The PURGE message is processed after the GET_TRUTH reply because both travel through the same worker message queue in order.

---

## Built-in patterns

All patterns apply `gi` flags — case-insensitive and global. Patterns are designed for a security context: false negative rate is minimized over false positive rate because a missed sensitive value is worse than a false positive that briefly highlights a non-sensitive number.

**13 built-in patterns active by default.** Five additional patterns (`IBAN`, `DEA_NUMBER`, `SWIFT_BIC`, `NPI_NUMBER`, `PASSPORT_NUMBER`) are available as [opt-in patterns](#opt-in-patterns) due to high false positive rates in free-text fields.

### PII patterns

| Pattern         | Matches                                                                              |
| --------------- | ------------------------------------------------------------------------------------ |
| `SSN`           | `123-45-6789` · `123 45 6789` · `123.45.6789` · `123456789`                          |
| `EMAIL`         | RFC 5321 compatible — `user@example.com`, plus addressing, subdomains                |
| `PHONE`         | US all formats · `+44` UK · `+91` India · `+353` Ireland · `+86` China and more      |
| `CREDIT_CARD`   | Visa 16-digit · Mastercard · Amex 15-digit — with or without spaces/hyphens          |
| `DATE_OF_BIRTH` | `MM/DD/YYYY` · `MM-DD-YYYY` · `MM.DD.YYYY` · `YYYY-MM-DD` · `YYYY/MM/DD` (1900–2099) |
| `TAX_ID`        | EIN `12-3456789` · 9-digit no separator                                              |

### Healthcare and international identifiers

| Pattern  | Matches                                                                           |
| -------- | --------------------------------------------------------------------------------- |
| `UK_NIN` | UK National Insurance Number — `AB 12 34 56 C` (spaced) or `AB123456C` (compact) |

### Credential patterns

These patterns are designed for developer-facing inputs — config panels, support chat, API key management UIs. Consumer-facing deployments can safely ignore them — a user entering their SSN will never trigger `GITHUB_TOKEN` or `JWT`.

| Pattern             | Matches                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| `AI_API_KEY`        | OpenAI `sk-` (all generations) · Anthropic `sk-ant-api03-` · Google `AIza`  |
| `AWS_ACCESS_KEY`    | `AKIA` permanent · `ASIA` temporary credential prefix                       |
| `GITHUB_TOKEN`      | `ghp_` · `gho_` · `ghs_` · `ghu_` · `github_pat_`                           |
| `STRIPE_KEY`        | `sk_live_` · `sk_test_` · `pk_live_` · `pk_test_` · `rk_live_` · `rk_test_` |
| `JWT`               | Three base64url segments starting with `eyJ`                                |
| `PRIVATE_KEY_BLOCK` | `-----BEGIN [RSA\|EC\|OPENSSH] PRIVATE KEY-----`                            |

### Overriding a built-in pattern

Pass a custom pattern with the same name to override the built-in for that field:

```tsx
// Replace the built-in SSN pattern with a stricter version for this field
<FieldShieldInput
  customPatterns={[{ name: "SSN", regex: "\\b\\d{3}-\\d{2}-\\d{4}\\b" }]}
/>
```

---

## Opt-in patterns

Some patterns are too broad to enable on every field. These four are excluded from the defaults because their regex structure matches common non-sensitive strings in clinical notes, pharmacy systems, and general free-text:

| Pattern           | Why it's opt-in                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `IBAN`            | Two letters + two digits + alphanumeric groups — matches lab accession numbers, lot codes |
| `DEA_NUMBER`      | Two letters + seven digits — matches any pharmaceutical lot number (`AB1234567`)          |
| `SWIFT_BIC`       | Eight uppercase letters — matches common words ("NEPHROPATHY", "PENICILLIN")              |
| `NPI_NUMBER`      | Ten digits starting with 1 or 2 — matches timestamps, order IDs, phone numbers           |
| `PASSPORT_NUMBER` | One or two letters + six to nine digits — matches ICD-10 codes, specimen IDs             |

> **Only add these to fields where that specific data type is the expected input.** Adding `NPI_NUMBER` to a clinical notes field will flag nearly every number entered.

### Usage

`OPT_IN_PATTERNS` values are regex source strings (the same type as `customPatterns.regex`), not `RegExp` objects. Pass them directly:

```tsx
import { FieldShieldInput, OPT_IN_PATTERNS } from "fieldshield";

// Wire transfer form — a BIC code is the only expected value here
<FieldShieldInput
  label="Bank (SWIFT/BIC)"
  customPatterns={[{ name: "SWIFT_BIC", regex: OPT_IN_PATTERNS.SWIFT_BIC }]}
/>

// Provider credentialing form — an NPI is the only expected value here
<FieldShieldInput
  label="Provider NPI"
  customPatterns={[{ name: "NPI_NUMBER", regex: OPT_IN_PATTERNS.NPI_NUMBER }]}
/>
```

The 14 built-in patterns stay active — `customPatterns` layers on top of them, it does not replace them.

---

## Content Security Policy

FieldShield's worker isolation guarantee can be enforced at the infrastructure level using Content Security Policy headers. Add the following directives to your CSP:

```
Content-Security-Policy:
  worker-src 'self';
  script-src 'self';
```

**`worker-src 'self' blob:`** — restricts Web Workers to same-origin scripts and blob URLs. The `blob:` source is required if you use the pre-compiled worker option (v1.1 roadmap). If you are certain you will only ever use the default source-file worker, `worker-src 'self'` without `blob:` is stricter.

**`script-src 'self'`** — restricts all script execution to same-origin. Combined with `worker-src`, this ensures neither the main thread nor the worker can load or execute scripts from external origins.

### No-network guarantee

The FieldShield worker makes no network requests of any kind. It contains no calls to `fetch()`, `XMLHttpRequest`, `WebSocket`, `EventSource`, or `navigator.sendBeacon()`. Communication is exclusively via `postMessage` with the main thread.

This guarantee is verifiable by inspecting `fieldshield.worker.ts` directly — the file has zero imports and zero network API calls. The `@security NO NETWORK ACCESS` comment at the top of the worker file is intended for auditors who need documented evidence of this property.

### Full recommended CSP for FieldShield deployments

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  worker-src 'self' blob:;
  connect-src 'self' https://your-api.example.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  frame-ancestors 'none';
```

Adjust `connect-src` to include only the API endpoints your application needs. The `frame-ancestors 'none'` directive prevents clickjacking attacks on forms containing sensitive fields.

---

## Security architecture

### Web Worker isolation

The real input value (`internalTruth`) lives exclusively in a dedicated Web Worker thread. It is never serialized to the main thread except through a private `MessageChannel` in response to an explicit `GET_TRUTH` message. Browser extensions monitoring `postMessage` on the page cannot intercept `MessageChannel` port messages because they are point-to-point, not broadcast.

### DOM scrambling

Every non-newline character in `input.value` is replaced with `x`. The DOM always contains scrambled content. Screen scrapers, browser extensions reading `.value`, and session recording tools see only `xxxxxxxxxx`. The `x` characters are replaced by an absolutely-positioned transparent layer — sighted users see the masked output from the worker, keyboard events and cursor positioning happen on the transparent real input.

### Clipboard masking

Copy and cut events are intercepted via `onCopy`/`onCut` handlers. When sensitive patterns are present, `e.clipboardData.setData()` writes the masked string (with `█` characters) rather than the real value. The selection range is mapped from the scrambled DOM coordinates to the real value coordinates to produce accurate partial-selection masking.

### Paste scanning

Paste events are intercepted before the browser inserts clipboard content. The pasted text is scanned synchronously against all active patterns using the same pattern source strings the worker uses — guaranteeing the pre-scan is always in sync with the worker scan. The `onSensitivePaste` callback fires before the paste lands, allowing real-time audit logging.

### Memory purge

The `PURGE` message zeros `internalTruth` in worker memory and posts a `PURGED` confirmation. This provides demonstrable evidence of data disposal for HIPAA and PCI-DSS compliance audits.

---

## Known limitations

### `realValueRef` on the main thread

While the user is actively typing, the real value exists in both worker memory (`internalTruth`) and a React ref on the main thread (`realValueRef`). This ref is required to reconstruct the real value from DOM events — without it, character-by-character editing would be impossible.

In React DevTools, a sufficiently privileged browser extension, or a debugger attached to the page, `realValueRef.current` is readable. The worker isolation guarantee applies fully at rest — when the user is not typing — and provides strong protection against passive DOM scraping. It does not protect against an active attacker with debugger access to the page.

### `getSecureValue()` on unmount

If `getSecureValue()` is called after the component unmounts, the worker has already been terminated and `workerRef.current` is null. The call resolves to `""` immediately. Always call `getSecureValue()` before triggering any navigation or unmount.

### `onBlur` / `handleBlur` zeroing `realValueRef`

FieldShield does not zero `realValueRef` on blur. The async `getSecureValue()` call on re-focus creates a race condition — the user might focus the field and immediately submit before the worker responds. The value is preserved across focus changes. Document this expectation in your threat model if required by your compliance framework.

### IME composition (CJK input)

Composed input via Input Method Editors (Chinese, Japanese, Korean) is not supported in v1. Characters entered via IME may not be reconstructed correctly in `realValueRef`. Planned for v1.1.

### Voice dictation

Third-party voice dictation software (Dragon NaturallySpeaking, etc.) injects text via OS-level events rather than standard DOM events. FieldShield cannot guarantee correct value reconstruction for voice-dictated input.

### Drag-and-drop text

Dragging text within the field to rearrange it is not supported. The reconstructed real value may be incorrect after an in-field drag operation.

### Tab character

Tab characters in textarea fields produce a visual drift between the mask layer and the real input cursor position. The stored real value remains correct — only the visual alignment is affected.

### No `name` prop — native form submission not supported

FieldShieldInput does not accept a `name` prop and does not support native HTML form submission via `<form>`. Because `input.value` always contains scrambled `x` characters, a native form submit would send garbage to the server.

Always use `getSecureValue()` or `collectSecureValues()` on submit — never rely on the DOM value.

### No `id` prop override

FieldShieldInput generates its own stable `id` via React's `useId()` hook to prevent collisions when multiple instances share a page. You cannot set a custom `id` on the underlying input element. If you need to target the input externally (e.g. for testing selectors), use `aria-label` or the container's `className` prop instead.

### `onCopy` and `onCut` props not forwarded

FieldShieldInput intercepts `copy` and `cut` events internally to implement clipboard masking. Consumer-provided `onCopy` and `onCut` props are not forwarded — they would silently do nothing. Use `onSensitiveCopyAttempt` instead, which fires after the masking has been applied and the clipboard has been written.

### Cross-field sensitive data combination

FieldShield detects sensitive patterns within a single field. It does not detect combinations across fields — for example, a first name in one field and an SSN in another that together constitute a HIPAA minimum necessary data set. Cross-field combination detection requires application-level logic. Use `onChange` to receive findings from each field and implement your own combination rules.

```tsx
// Example: detect SSN in any field on the form
const [formHasSensitiveData, setFormHasSensitiveData] = useState(false);

<FieldShieldInput
  label="Notes"
  onChange={(_, findings) => {
    if (findings.includes("SSN")) setFormHasSensitiveData(true);
  }}
/>;
```

### Names, addresses, and unstructured PHI

FieldShield detects structured sensitive data — values with a recognisable format like SSNs, credit card numbers, and API keys. It does not detect unstructured PHI such as:

- Patient names (`"John Smith"`)
- Street addresses (`"123 Main Street, Boston MA"`)
- Facility names, physician names, employer names
- Free-text clinical descriptions

These cannot be detected reliably with regex — they require NLP-based Named Entity Recognition (NER). Regex cannot distinguish `"John Smith"` (a patient name) from a company name or product name without semantic context.

**What this means for HIPAA deployments:** HIPAA's Safe Harbor de-identification method lists 18 identifier categories that must be removed or replaced. FieldShield covers several — SSN, EMAIL, PHONE, DATE_OF_BIRTH, NPI, DEA — but does not cover names, geographic data below state level, or device identifiers. FieldShield is a defence-in-depth control for structured identifiers — it does not constitute complete HIPAA de-identification on its own.

Applications handling free-text clinical notes should implement server-side NER-based PHI detection in addition to FieldShield's client-side structured pattern detection.

### PHI context-dependency

Some identifiers that appear individually non-sensitive become PHI when combined with other data in the same field. Two examples from FieldShield's pattern set:

**NPI numbers** are publicly searchable via the CMS NPPES registry — a provider's NPI alone is not sensitive. But `"Patient referred to NPI 1234567893 for oncology follow-up"` is a PHI-containing clinical note. FieldShield detects the NPI as a signal that the field likely contains a PHI combination.

**SWIFT/BIC codes** identify banks, not individuals. But a field containing `"Wire to DEUTDEDBBER account DE89370400440532013000"` is a sensitive financial record. FieldShield detects the SWIFT code as a signal that the field likely contains a wire transfer instruction.

The library's philosophy is that false negatives are worse than false positives in a security context — detecting a non-sensitive identifier that appears in a sensitive context is preferable to missing a sensitive combination entirely.

## Versioning and pattern updates

FieldShield follows semantic versioning:

- **Patch** (`1.0.x`) — bug fixes, false positive/negative corrections to existing patterns
- **Minor** (`1.x.0`) — new patterns, new props, new features — backwards compatible
- **Major** (`x.0.0`) — breaking API changes

**Pattern updates are minor releases, not patches.** A new pattern could start flagging content in a field that was previously clean, which affects application behavior. Treat pattern updates as you would any minor dependency upgrade — review the CHANGELOG before updating.

**Pinning patterns** — if your application requires a frozen pattern set (e.g. for a compliance audit that was performed against a specific version), pin your FieldShield version explicitly:

```json
"dependencies": {
  "fieldshield": "1.0.4"
}
```

See [CHANGELOG.md](./CHANGELOG.md) for a full history of pattern changes and API updates.

---

## TypeScript

All types are exported from the package root:

```ts
import type {
  FieldShieldHandle,
  FieldShieldInputProps,
  SensitiveClipboardEvent,
  CustomPattern,
} from "fieldshield";

import type {
  SecurityEvent,
  SecurityEventType,
  UseSecurityLogOptions,
  UseSecurityLogReturn,
} from "fieldshield";

import type { FieldShieldRefMap, SecureValues } from "fieldshield";
```

FieldShield is written in strict TypeScript. All public APIs are fully typed with no `any`.

---

## Compliance notes

### HIPAA

FieldShield provides technical safeguards relevant to the HIPAA Security Rule (45 CFR § 164.312):

- **Access controls** — real values are only retrievable via `getSecureValue()`, not readable from the DOM
- **Audit controls** — `useSecurityLog` provides structured, timestamped records of clipboard operations, form submissions, and memory purges
- **Transmission security** — values never travel over `postMessage` broadcast channels; `MessageChannel` is point-to-point

FieldShield is a technical control, not a compliance attestation. It must be used as part of a broader HIPAA compliance program that includes administrative and physical safeguards.

### PCI-DSS

FieldShield addresses PCI-DSS Requirement 6.4 (protect web-facing applications) by preventing cardholder data from appearing in the DOM where it could be captured by browser-based skimmers. The `CREDIT_CARD` pattern covers Visa, Mastercard, and Amex in all common formats.

### SOC 2

The `PURGE` mechanism provides demonstrable evidence of data disposal. The `useSecurityLog` hook provides an audit trail that can be shipped to a backend logging service for SOC 2 Type II evidence collection.

---

## License

MIT
