/**
 * @file patterns.ts
 * @description Single source of truth for all built-in sensitive data patterns
 * shipped with FieldShield.
 *
 * @remarks
 * Patterns are stored as plain regex source strings — no delimiters (`/`) and
 * no flags. This is intentional for two reasons:
 *
 * 1. **Main thread consumers** (`FieldShieldInput.tsx`, `useFieldShield.ts`) import
 *    this file directly and construct `RegExp` objects with whatever flags they
 *    need for their specific use case.
 *
 * 2. **The Web Worker** (`fieldshield.worker.ts`) cannot safely import from a
 *    relative path when the library is consumed via npm — the bundler of the
 *    consuming application may not resolve worker imports correctly. Instead,
 *    `useFieldShield.ts` sends these patterns to the worker via a `CONFIG` message
 *    on mount, keeping the worker completely self-contained with no imports.
 *
 * **Updating patterns:**
 * Change a pattern here and it automatically propagates to every consumer —
 * the worker, the component paste handler, and the hook config message. There
 * is no second place to update.
 *
 * **Adding a new pattern:**
 * Add a new key/value pair to `FIELDSHIELD_PATTERNS`. The string must be a valid
 * regex source. Use double backslashes for escape sequences since this is a
 * string not a regex literal — `"\\d"` not `"\d"`.
 *
 * @example
 * ```ts
 * import { FIELDSHIELD_PATTERNS } from "../patterns";
 *
 * // Build a RegExp from a pattern string
 * const regex = new RegExp(FIELDSHIELD_PATTERNS.SSN, "gi");
 * regex.test("372-84-1950"); // true
 * ```
 *
 * @module patterns
 */

/**
 * Built-in sensitive data patterns shipped with FieldShield.
 *
 * Keys are the pattern names surfaced in `findings` arrays and callback
 * payloads (e.g. `"SSN"`, `"EMAIL"`). Values are regex source strings.
 */
export const FIELDSHIELD_PATTERNS: Readonly<Record<string, string>> = Object.freeze({
  // ── AI / Cloud credentials ────────────────────────────────────────────────

  /**
   * OpenAI keys (all generations) and Anthropic keys — all use `sk-` prefix.
   *
   * - Old OpenAI personal keys:       `sk-[alphanum]{20+}`
   * - New OpenAI project keys:        `sk-proj-[alphanum+hyphen]{20+}`
   * - New OpenAI service account:     `sk-svcacct-[alphanum+hyphen]{20+}`
   * - Anthropic keys:                 `sk-ant-api03-[alphanum+hyphen]{20+}`
   *
   * The updated pattern allows hyphens in the key body (`[a-zA-Z0-9-]`) so
   * all `sk-*` variants are caught by a single alternative. The `ant-api-`
   * alternative is retained for any legacy keys not using the `sk-` prefix.
   * Google AIza keys remain unchanged.
   */
  AI_API_KEY:
    "(sk-[a-zA-Z0-9][a-zA-Z0-9-]{19,}|ant-api-[a-z0-9-]{20,}|AIza[0-9A-Za-z_-]{35})",

  /**
   * AWS permanent (`AKIA`) and temporary (`ASIA`) access key prefixes.
   * Fixed: previous pattern had `ASXA` which is not a real AWS prefix —
   * the correct temporary credential prefix is `ASIA`.
   * 16-character alphanumeric uppercase suffix after the 4-char prefix.
   */
  AWS_ACCESS_KEY: "\\b(AKIA|ASIA)[0-9A-Z]{16}\\b",

  // ── PII ───────────────────────────────────────────────────────────────────

  /**
   * US Social Security Number — all common separator formats.
   *
   * Matches:
   *   `123-45-6789`  hyphen separated  (standard printed format)
   *   `123 45 6789`  space separated   (typed on mobile without hyphen key)
   *   `123.45.6789`  dot separated     (common in some form UIs)
   *   `123456789`    no separator      (common when copy-pasting from a database)
   *
   * `[-\s.]?` makes the separator optional, catching all four formats
   * with a single pattern. False positive risk on bare 9-digit numbers is
   * acceptable in a security context — a missed SSN is worse than a
   * false positive that briefly highlights a non-sensitive number.
   */
  SSN: "\\b\\d{3}[-\\s.]?\\d{2}[-\\s.]?\\d{4}\\b",

  /**
   * RFC 5321-compatible email address.
   * Covers standard alphanumeric local parts with common special characters.
   */
  EMAIL: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",

  /**
   * US phone numbers — relaxed exchange constraint to catch real-world input.
   *
   * Previous pattern required exchange to start with [2-9] (NANP-strict),
   * which rejected common inputs like `555-123-4567` where the exchange
   * starts with 1. Relaxed to `\d{3}` since FieldShield is a security
   * library, not a phone number validator — false negatives are worse
   * than false positives here.
   *
   * Also adds an international format alternative (`\+[1-9]\d{6,14}`)
   * for non-US numbers like `+44 7911 123456`.
   *
   * Matches:
   *   `555-123-4567`      US hyphen
   *   `555 123 4567`      US space
   *   `5551234567`        US no separator
   *   `(555) 123-4567`    US with area code parens
   *   `+1 555 123 4567`   US with country code
   *   `+44 7911 123456`   UK mobile
   *   `+91 98765 43210`   India mobile
   */
  PHONE:
    "\\b(?:\\+?1[-. ]?)?\\(?[2-9]\\d{2}\\)?[-. ]?\\d{3}[-. ]?\\d{4}\\b|\\+[1-9][\\s.-]?(?:\\d[\\s.-]?){6,14}\\d\\b",

  // ── Financial ─────────────────────────────────────────────────────────────

  /**
   * Visa, Mastercard, and American Express — with optional space or hyphen
   * separators between digit groups.
   *
   * Previous pattern required consecutive digits, missing the most common
   * real-world format (`4111 1111 1111 1111`) users type or paste from cards.
   *
   * Matches:
   *   Visa 16-digit:   `4111111111111111` / `4111 1111 1111 1111` / `4111-1111-1111-1111`
   *   Mastercard:      `5500005555555559` / `5500 0055 5555 5559`
   *   Amex 15-digit:   `378282246310005`  / `3782 822463 10005`
   *
   * Does not run a Luhn checksum — add post-match validation in production
   * to reduce false positives on structurally-matching non-card numbers.
   */
  CREDIT_CARD: [
    "\\b4\\d{3}[-\\s]?\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}\\b",
    "\\b5[1-5]\\d{2}[-\\s]?\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}\\b",
    "\\b3[47]\\d{2}[-\\s]?\\d{6}[-\\s]?\\d{5}\\b",
  ].join("|"),

  /**
   * International Bank Account Number (IBAN) — with or without spaces.
   *
   * IBANs are commonly written in groups of 4 separated by spaces
   * (e.g. `GB82 WEST 1234 5698 7654 32`). The previous pattern required
   * consecutive characters and missed the spaced format.
   *
   * Pattern: country code (2 alpha) + check digits (2 numeric) +
   * BBAN in groups of up to 4 alphanumeric chars with optional separator.
   *
   * Matches:
   *   `GB82WEST12345698765432`         no spaces
   *   `GB82 WEST 1234 5698 7654 32`   standard printed format
   *   `DE89370400440532013000`         German IBAN no spaces
   */
  IBAN: "\\b[A-Z]{2}\\d{2}[-\\s]?(?:[A-Z0-9]{1,4}[-\\s]?){3,}[A-Z0-9]{1,4}\\b",

  /**
   * Passport number — 1–2 uppercase letters followed by 6–9 digits.
   *
   * Covers the most common passport number formats:
   *   US:  1 letter + 8 digits   e.g. `A12345678`
   *   UK:  9 digits only         (excluded — indistinguishable from other 9-digit IDs)
   *   EU:  2 letters + 7 digits  e.g. `AB1234567`
   *   IN:  1 letter + 7 digits   e.g. `A1234567`
   *
   * Note: pure-digit passport numbers (UK, some others) cannot be reliably
   * distinguished from SSNs or TAX_IDs and are intentionally excluded to
   * avoid false positives.
   */
  PASSPORT_NUMBER: "\\b[A-Z]{1,2}[0-9]{6,9}\\b",

  /**
   * Date of birth — common formats used in healthcare and fintech forms.
   *
   * Matches:
   *   `MM/DD/YYYY`   US slash format       e.g. `01/15/1990`
   *   `MM-DD-YYYY`   US hyphen format      e.g. `01-15-1990`
   *   `MM.DD.YYYY`   US dot format         e.g. `01.15.1990`
   *   `YYYY-MM-DD`   ISO 8601              e.g. `1990-01-15`
   *   `YYYY/MM/DD`   ISO with slashes      e.g. `1990/01/15`
   *
   * Year range constrained to 1900–2099 to avoid matching arbitrary
   * date-like numbers. Month constrained to 01–12, day to 01–31.
   */
  DATE_OF_BIRTH:
    "\\b(?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\\d|3[01])[-/.](?:19|20)\\d{2}\\b" +
    "|\\b(?:19|20)\\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\\d|3[01])\\b",

  /**
   * US Employer Identification Number (EIN) / Tax ID.
   *
   * Matches:
   *   `12-3456789`   hyphenated EIN format
   *   `123456789`    9-digit no separator (also overlaps with SSN bare digits)
   *
   * Note: the 9-digit bare form overlaps with SSN in no-separator format.
   * Both firing is intentional — the field may contain either, and the
   * consuming application can use field context to disambiguate.
   */
  TAX_ID: "\\b\\d{2}-\\d{7}\\b|\\b\\d{9}\\b",

  // ── Credentials (developer / admin tooling) ───────────────────────────────
  //
  // These patterns are unlikely to appear in typical end-user consumer forms.
  // They are included for applications that expose developer-facing inputs —
  // config panels, support chat, API key management UIs — where accidental
  // credential exposure is a real risk.
  //
  // Consumer-facing deployments can safely ignore these — a user entering
  // their SSN will never trigger GITHUB_TOKEN or JWT.

  /**
   * GitHub personal access tokens and fine-grained PATs.
   *
   * Prefixes:
   *   `ghp_`         classic personal access token
   *   `gho_`         OAuth app token
   *   `ghs_`         GitHub Apps server-to-server token
   *   `ghu_`         GitHub Apps user-to-server token
   *   `github_pat_`  fine-grained personal access token (newer format)
   */
  GITHUB_TOKEN: "\\b(ghp|gho|ghs|ghu|github_pat)_[a-zA-Z0-9_]{20,}\\b",

  /**
   * Stripe API keys — secret, publishable, and restricted.
   *
   * Prefixes:
   *   `sk_live_` / `sk_test_`   secret keys (highest privilege — never expose)
   *   `pk_live_` / `pk_test_`   publishable keys (client-safe but worth flagging)
   *   `rk_live_` / `rk_test_`   restricted keys
   *
   * `sk_live_` keys are the highest-value target — a leaked live secret key
   * gives full Stripe account access.
   */
  STRIPE_KEY: "\\b(sk|pk|rk)_(live|test)_[a-zA-Z0-9]{20,}\\b",

  /**
   * JSON Web Token (JWT) — three base64url segments separated by dots.
   *
   * All JWTs begin with `eyJ` (base64url encoding of `{"`) making them
   * highly detectable with very low false positive rate. JWTs appear in
   * support tickets, config forms, and debug paste fields constantly —
   * a valid JWT pasted anywhere is a potential session hijack.
   */
  JWT: "\\beyJ[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+\\b",

  /**
   * PEM private key block header.
   *
   * Matches the opening line of RSA, EC, and OpenSSH private keys.
   * The header alone is sufficient to flag the paste — the base64 body
   * that follows does not need to match.
   *
   * Covers:
   *   `-----BEGIN PRIVATE KEY-----`
   *   `-----BEGIN RSA PRIVATE KEY-----`
   *   `-----BEGIN EC PRIVATE KEY-----`
   *   `-----BEGIN OPENSSH PRIVATE KEY-----`
   *
   * Does NOT match `-----BEGIN PUBLIC KEY-----` or `-----BEGIN CERTIFICATE-----`
   * which are not sensitive.
   */
  PRIVATE_KEY_BLOCK: "-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
});
