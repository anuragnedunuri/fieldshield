# FieldShield Threat Model

**Version:** 1.0  
**Last updated:** 2026  
**Maintained by:** FieldShield maintainers

This document describes what FieldShield protects against, what it explicitly does not protect against, what assumptions it makes about the environment, and the residual risks that consuming applications must address independently.

This document is intended for security engineers, compliance officers, and auditors evaluating FieldShield for use in regulated environments including healthcare (HIPAA), financial services (PCI-DSS), and enterprise SaaS (SOC 2).

---

## Contents

- [Protected assets](#protected-assets)
- [Threats mitigated](#threats-mitigated)
- [Threats not mitigated](#threats-not-mitigated)
- [Environment assumptions](#environment-assumptions)
- [Architecture security properties](#architecture-security-properties)
- [Residual risks](#residual-risks)
- [Compliance mapping](#compliance-mapping)
- [Vulnerability disclosure](#vulnerability-disclosure)

---

## Protected assets

FieldShield protects the following data categories when entered into or pasted into a FieldShieldInput field:

**Personally Identifiable Information (PII)**
- US Social Security Numbers (SSN)
- Email addresses
- Phone numbers (US and international)
- Credit card numbers (Visa, Mastercard, Amex)
- International Bank Account Numbers (IBAN)
- Passport numbers (US, EU, India formats)
- Dates of birth
- US Tax IDs / EINs

**Credentials and secrets**
- AI API keys (OpenAI, Anthropic, Google)
- AWS access keys (permanent and temporary)
- GitHub personal access tokens (all formats)
- Stripe API keys (secret, publishable, restricted)
- JSON Web Tokens (JWT)
- PEM private key blocks (RSA, EC, OpenSSH)

**Custom data types** defined by the consuming application via `customPatterns`.

---

## Threats mitigated

### T1 — DOM-based value scraping

**Threat:** A browser extension, injected script, session recording tool (FullStory, LogRocket, Hotjar), or automated scraper reads `input.value` from the DOM to capture sensitive data entered by the user.

**Mitigation:** FieldShield writes only scrambled `x` characters to `input.value`. The DOM never contains the real value at any point during or after input. The real value is stored exclusively in Web Worker memory (`internalTruth`) which is isolated from the main thread and inaccessible via DOM APIs.

**Verification:** Confirmed by Playwright tests asserting that `input.value`, all element attributes, localStorage, sessionStorage, and cookies never contain typed sensitive data.

**Residual risk:** While the user is actively typing, the real value also exists in `realValueRef` on the main thread — see [Residual risks](#residual-risks).

---

### T2 — Clipboard exfiltration via copy

**Threat:** A user selects sensitive text and copies it to the clipboard, from which it may be pasted into an LLM chat interface, email, or unsecured application. A browser extension monitoring clipboard contents may also capture it.

**Mitigation:** FieldShield intercepts `copy` events and writes masked content (`█` characters) to the clipboard via `e.clipboardData.setData()`. The selection range is mapped from scrambled DOM coordinates to real value coordinates, so partial copies also produce accurately masked output. The clipboard never receives the real value.

The `onSensitiveCopyAttempt` callback fires with a `SensitiveClipboardEvent` payload containing the timestamp, field label, matched pattern names, masked preview, and event type — enabling real-time audit logging.

**Verification:** Confirmed by Playwright tests reading the real system clipboard after a copy operation and asserting it contains `█` characters and not the real value.

---

### T3 — Clipboard exfiltration via cut

**Threat:** Same as T2 but via a cut operation. Additionally, cut operations must correctly update the field state — the cut portion must be removed from both the DOM and worker memory, and subsequent keystrokes must not produce spurious characters.

**Mitigation:** FieldShield intercepts `cut` events identically to copy events — masked content goes to the clipboard. After the cut, the real value is spliced to remove the cut portion, the DOM is re-scrambled to match the new length, `processText` is called with the new value, and `setSelectionRange` restores the cursor via `requestAnimationFrame` so the DOM update has committed before cursor placement.

**Verification:** Playwright tests confirm that the DOM length shortens after a cut, the clipboard contains masked content, and typing after a full cut produces exactly one character — not a spurious extra character from DOM/ref desync.

---

### T4 — Sensitive data exposure via paste

**Threat:** A user pastes sensitive data from the clipboard into a field that should not accept it (e.g. a "reason for visit" free-text field that receives an SSN). The pasted data lands in the DOM and is captured by recording tools or read by extensions.

**Mitigation:** FieldShield intercepts paste events before the browser inserts clipboard content. Pasted text is scanned synchronously against all active patterns using the same pattern source strings the worker uses. The `onSensitivePaste` callback fires with the findings before the paste lands.

The consuming application can block the paste entirely by returning `false` from `onSensitivePaste` — the field reverts to its previous value and the clipboard content is discarded. The DOM is never updated with the sensitive content in the blocked case.

**Verification:** Unit tests confirm that `onSensitivePaste` returning `false` leaves the DOM unchanged, and that `onSensitivePaste` is not called for a paste blocked by `maxProcessLength` (preventing a misleading security event for reverted input).

---

### T5 — Accidental credential exposure in developer-facing inputs

**Threat:** A user pastes an API key, JWT, or private key into a support chat field, bug report form, or configuration panel. The credential is captured by session recording tools or stored in application logs.

**Mitigation:** FieldShield's credential patterns (`AI_API_KEY`, `AWS_ACCESS_KEY`, `GITHUB_TOKEN`, `STRIPE_KEY`, `JWT`, `PRIVATE_KEY_BLOCK`) detect and flag these values in any FieldShieldInput field. The clipboard interception (T2, T3) and paste detection (T4) apply equally to credential values.

---

### T6 — Denial of service via adversarial regex input

**Threat:** An attacker submits a very long, specially crafted string designed to cause catastrophic backtracking in one or more regex patterns, consuming all available CPU in the worker thread and causing the application to stop responding.

**Mitigation:** The `maxProcessLength` prop (default 100,000 characters) blocks any input that would exceed the limit before it reaches the worker. Input is blocked entirely — not truncated — because truncation would create a blind spot where sensitive data beyond the limit is never scanned. All processing runs in a Web Worker so even in the worst case the main thread UI remains responsive. Each pattern is individually wrapped in try/catch so a single misbehaving pattern cannot prevent other patterns from running.

**Residual risk:** The default limit of 100,000 characters may be insufficient for some attack scenarios. Applications with highly sensitive fields should consider lower limits via the `maxProcessLength` prop. Performance testing at the chosen limit is recommended before production deployment.

---

### T7 — Stale worker responses after unmount

**Threat:** A worker posts an UPDATE response in the same tick that `terminate()` is called during component unmount. The response arrives on the main thread after the component has unmounted, causing a state update on an unmounted component and potentially exposing stale sensitive data in React's component tree.

**Mitigation:** A `cancelled` boolean flag is declared inside the worker lifecycle effect. The cleanup function sets `cancelled = true` before calling `terminate()`. The `onmessage` handler checks this flag and discards any response that arrives after unmount. The flag uses closure-as-reference semantics — both the handler and the cleanup function share the same memory address, so the handler sees the updated value immediately.

---

## Threats not mitigated

### N1 — Kernel-level and debugger access

FieldShield does not protect against an attacker with kernel-level access to the host machine, a JavaScript debugger attached to the browser process, or a compromised browser itself. An attacker at this privilege level can inspect any memory in the process, including Web Worker memory.

**Why not mitigated:** No client-side JavaScript library can provide protection against an attacker at the operating system or debugger level. This is a fundamental constraint of the web platform.

**Recommendation:** Ensure users access your application only from managed, trusted devices in high-sensitivity environments. Consider step-up authentication for sensitive operations.

---

### N2 — OS-level keyloggers

FieldShield does not protect against keyloggers operating at the operating system level, outside the browser process. These tools intercept keystrokes before the browser receives them.

**Why not mitigated:** Same fundamental constraint as N1. No browser-based protection applies below the browser process boundary.

**Recommendation:** Managed device policies, EDR solutions, and device attestation are the appropriate controls for this threat.

---

### N3 — Network interception

FieldShield does not protect data in transit. Once `getSecureValue()` returns the plaintext to the application and the application sends it to a backend, FieldShield has no involvement in transmission security.

**Why not mitigated:** Network security is out of scope for a client-side input protection library.

**Recommendation:** Use TLS 1.2 or higher for all API endpoints that receive sensitive data. Do not log raw request bodies containing sensitive fields on the server.

---

### N4 — Main thread access to realValueRef

While the user is actively typing, the real value exists in `realValueRef` on the main thread in addition to worker memory. This is required to reconstruct the real value character by character from DOM events — without it, editing would be impossible.

A compromised third-party JavaScript library loaded on the same page, a React DevTools fiber traversal in development mode, or a debugger attached to the browser can read this value.

**Why not mitigated:** JavaScript is single-threaded on the main thread. Any code running on the main thread in the same browsing context can, in principle, access memory allocated by other code in that context. Complete isolation is not achievable in a browser-based JavaScript environment.

**Mitigation in place:** The value is stored only in `realValueRef` (a React ref, not state) and is never serialized to any other location on the main thread during typing. At rest (when the user is not typing), the value exists only in worker memory.

**Recommendation:** Use Content Security Policy (CSP) to restrict which scripts can execute on your page. Audit all third-party JavaScript dependencies. Do not load analytics, marketing, or advertising scripts on pages containing FieldShieldInput fields.

---

### N5 — GET_TRUTH accessible to any main thread code

`getSecureValue()` opens a private `MessageChannel` and posts a `GET_TRUTH` message to the worker. Any code running on the main thread with access to the worker reference can call this method. A compromised third-party library loaded on the same page could call `getSecureValue()` on any mounted FieldShieldInput ref it can reach.

**Why not mitigated:** v1 does not implement authentication for `GET_TRUTH` calls. A one-time token mechanism is planned for v1.1.

**Recommendation:** Do not expose FieldShieldInput refs to third-party code. Keep refs scoped to the component or context that needs them. Audit third-party JavaScript loaded on pages containing sensitive fields.

---

### N6 — Cross-field sensitive data combination

FieldShield detects sensitive patterns within a single field. It does not detect that a first name in one field combined with an SSN in another field constitutes a HIPAA minimum necessary data set or a linkable record.

**Why not mitigated:** Cross-field awareness would require a shared context across independent field instances, which conflicts with the worker isolation architecture. `FieldShieldForm` with cross-field detection is planned for v2.0.

**Recommendation:** Implement combination detection at the application level using the `onChange` callback, which provides findings for each field without exposing the real value.

---

### N7 — Server-side exposure

FieldShield protects data on the client side during input. Once `collectSecureValues` or `getSecureValue` returns plaintext to the application and that data is sent to a backend, FieldShield has no involvement in server-side storage, logging, or access controls.

**Why not mitigated:** Server-side data protection is outside the scope of a client-side library.

**Recommendation:** Apply field-level encryption for sensitive data at rest. Use tokenization for payment card data. Implement appropriate access controls on APIs that receive sensitive fields.

---

### N8 — IME composition (v1)

Input Method Editors (CJK input, voice-to-text via browser) may not be correctly reconstructed in `realValueRef` during composition events. The real value stored in the worker may be incorrect for composed input.

**Why not mitigated:** IME composition support is planned for v1.1.

**Recommendation:** Do not deploy FieldShield for CJK language input in v1. Use `a11yMode` as a fallback if your user base requires IME input — in `a11yMode`, the browser handles value management directly.

---

## Environment assumptions

FieldShield's security properties depend on the following environment assumptions being true. If any assumption is violated, the protections described in [Threats mitigated](#threats-mitigated) may not hold.

**A1 — HTTPS is in use.** FieldShield does not verify this, but Web Workers are only available in secure contexts. Running FieldShield over HTTP in production is not supported and voids the isolation guarantee.

**A2 — The page loads over a trusted CDN or origin.** If the JavaScript bundle itself is compromised at the CDN or origin level, an attacker can modify FieldShield's source code before it reaches the browser. Subresource Integrity (SRI) hashes on script tags mitigate this.

**A3 — Third-party scripts on the page are trusted.** FieldShield cannot prevent a malicious third-party script from reading `realValueRef` on the main thread during typing. A strict Content Security Policy that whitelists only trusted script sources is the appropriate control.

**A4 — The browser is not compromised.** FieldShield assumes the browser correctly enforces the Web Worker isolation boundary. A compromised browser binary voids this assumption.

**A5 — The user's device is not compromised.** OS-level keyloggers and rootkits operate below the browser and cannot be addressed by any browser-based control.

**A6 — React DevTools are not enabled in production.** React DevTools can traverse the fiber tree and read ref values. FieldShield should not be deployed with React DevTools enabled in production builds.

---

## Architecture security properties

### Web Worker isolation

The Web Worker thread is a dedicated worker — it has no shared memory with the main thread. Communication is exclusively via `postMessage` and `MessageChannel`. The structured clone algorithm used by `postMessage` cannot transfer arbitrary object references, preventing the main thread from holding a reference to worker memory.

### MessageChannel point-to-point delivery

`GET_TRUTH` responses travel via a `MessageChannel` port, not via the broadcast `postMessage` channel. Browser extensions that monitor `window.postMessage` events cannot intercept `MessageChannel` messages because they are delivered directly to the specific port, not broadcast to all listeners on the page.

### Pattern source string design

Patterns are stored as plain regex source strings in `patterns.ts` and sent to the worker via the CONFIG message. This design means the worker has no static imports — it is entirely self-contained. The worker cannot be isolated from patterns by a bundler misconfiguration.

### No sensitive data in React state

The real value is stored in `realValueRef` (a React ref) rather than `useState`. State updates schedule re-renders and the state value is accessible through React's fiber tree. Ref values do not appear in React's state tree and do not trigger re-renders.

### Cancelled flag race guard

A `cancelled` boolean in the worker lifecycle effect prevents state updates from arriving after component unmount. This eliminates a class of race conditions where stale worker responses could update state in an unmounted component tree.

---

## Residual risks

| Risk | Severity | Mitigation in FieldShield | Recommended application control |
|---|---|---|---|
| `realValueRef` readable on main thread during typing | Medium | Stored in ref, not state or DOM | Strict CSP, third-party script audit |
| `GET_TRUTH` callable by any main thread code | Medium | None in v1 | Scope refs, audit third-party JS |
| OS keylogger captures keystrokes | High | None — out of scope | Managed devices, EDR |
| Debugger access to worker memory | High | None — out of scope | Production build hardening |
| IME composition value reconstruction | Low | None in v1 | Use a11yMode for CJK input |
| Regex backtracking beyond maxProcessLength | Low | maxProcessLength blocks input | Set appropriate limit per field |
| Server-side exposure after submission | High | None — out of scope | Field-level encryption, tokenization |
| Third-party script on same page | Medium | None — out of scope | CSP script-src whitelist |

---

## Compliance mapping

| Control | Framework | FieldShield coverage |
|---|---|---|
| Technical access controls on ePHI | HIPAA § 164.312(a) | Worker isolation prevents DOM access to sensitive values |
| Audit controls | HIPAA § 164.312(b) | `useSecurityLog` provides structured clipboard and submission audit trail |
| Transmission security | HIPAA § 164.312(e) | `MessageChannel` prevents broadcast interception — application must implement TLS |
| Protect stored cardholder data | PCI-DSS Req 3 | DOM never contains card numbers — application must implement server-side encryption |
| Protect web-facing applications | PCI-DSS Req 6.4 | Clipboard interception prevents browser-based skimming of card input |
| Logical access controls | SOC 2 CC6.1 | `getSecureValue()` is the only retrieval path — no DOM access to sensitive values |
| Availability | SOC 2 A1 | `maxProcessLength` prevents DoS via adversarial input |
| Change management | SOC 2 CC8.1 | All patterns versioned in `patterns.ts` — changes are tracked in git history |

---

## Vulnerability disclosure

If you discover a security vulnerability in FieldShield, please report it responsibly.

**Do not** open a public GitHub issue for security vulnerabilities.

**Do** email the maintainer directly with a description of the vulnerability, steps to reproduce, and your assessment of severity. We will acknowledge receipt within 48 hours and aim to release a fix within 14 days for critical issues.

Security researchers who report valid vulnerabilities will be credited in the release notes unless they request anonymity.
