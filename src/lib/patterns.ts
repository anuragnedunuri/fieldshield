/**
 * @file patterns.ts
 * @description Single source of truth for all built-in and opt-in sensitive data
 * patterns shipped with FieldShield.
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
 * **Opt-in patterns:**
 * Three patterns are exported separately in {@link OPT_IN_PATTERNS} because they
 * produce unacceptably high false positive rates in free-text fields such as
 * clinical notes. Use them via `customPatterns` only on fields where the specific
 * data type is expected — see the JSDoc on each pattern for details.
 *
 * **Built-in pattern count: 13**
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
 * Built-in sensitive data patterns shipped with FieldShield (13 total).
 *
 * Keys are the pattern names surfaced in `findings` arrays and callback
 * payloads (e.g. `"SSN"`, `"EMAIL"`). Values are regex source strings.
 *
 * Five additional patterns ({@link OPT_IN_PATTERNS}) are excluded from this
 * set due to high false positive rates in free-text and clinical note fields.
 * Use them via `customPatterns` only on fields where that data type is expected.
 */
export const FIELDSHIELD_PATTERNS: Readonly<Record<string, string>> =
  Object.freeze({
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
     *
     * @remarks **False positive risk (medium):**
     * The bare 9-digit form (`123456789`) matches any 9-digit number. This
     * overlaps with `TAX_ID` bare form and with arbitrary 9-digit numeric IDs.
     * Both `SSN` and `TAX_ID` firing on the same value is intentional — the
     * field may contain either, and consuming applications can use field context
     * to disambiguate. The hyphenated form (`123-45-6789`) has very low false
     * positive risk and is the recommended format to require in dedicated SSN
     * fields.
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

    // ── Financial ────────────────────────────────────────────────────────────
    //
    // IBAN was moved to OPT_IN_PATTERNS — see that export for the rationale.

    /**
     * Visa, Mastercard, Discover and American Express — with optional space or hyphen
     * separators between digit groups.
     *
     * Previous pattern required consecutive digits, missing the most common
     * real-world format (`4111 1111 1111 1111`) users type or paste from cards.
     *
     * Matches:
     *   Visa 16-digit:   `4111111111111111` / `4111 1111 1111 1111` / `4111-1111-1111-1111`
     *   Mastercard 16-digit:    `5500005555555559` / `5500 0055 5555 5559`
     *   Discover 16-digit:    `6500005555555559` / `6500 0055 5555 5559`
     *   Amex 15-digit:   `378282246310005`  / `3782 822463 10005`
     *
     * Does not run a Luhn checksum — add post-match validation in production
     * to reduce false positives on structurally-matching non-card numbers.
     */
    CREDIT_CARD: [
      "\\b4\\d{3}[-\\s]?\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}\\b",
      "\\b5\\d{3}[-\\s]?\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}\\b",
      "\\b6\\d{3}[-\\s]?\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}\\b",
      "\\b3[47]\\d{2}[-\\s]?\\d{6}[-\\s]?\\d{5}\\b",
    ].join("|"),

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
     *
     * @remarks **False positive risk (medium — acceptable in healthcare contexts):**
     * Any date in a clinical note will trigger this pattern. This is intentional
     * because dates are PHI under HIPAA (45 CFR §164.514(b)(2)(i) lists dates as
     * one of the 18 PHI identifiers). Consuming applications should be aware that
     * date-heavy fields (e.g. encounter notes, lab reports) will fire frequently.
     * Consider `a11yMode` or field-level pattern overrides for fields where dates
     * are expected but not individually sensitive.
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
     * @remarks **False positive risk (medium):**
     * The bare 9-digit form (`123456789`) matches any 9-digit number — zip codes,
     * product IDs, reference numbers, and other identifiers all have 9 digits.
     * Use this pattern on tax-specific fields (W-9, EIN entry) rather than
     * general free-text fields to avoid excessive false positives. Both `SSN` and
     * `TAX_ID` firing on the same bare 9-digit value is intentional — the field
     * may contain either, and consuming applications can use field context to
     * disambiguate.
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

    // ── Healthcare identifiers ────────────────────────────────────────────────
    //
    // UK_NIN is the sole built-in healthcare identifier. DEA_NUMBER and
    // NPI_NUMBER were moved to OPT_IN_PATTERNS — see that export for the
    // rationale on each.

    // ── International PII ─────────────────────────────────────────────────────

    /**
     * UK National Insurance Number (NIN) — equivalent of US SSN for UK residents.
     *
     * Format: 2 letters + 6 digits + 1 letter suffix, optionally space-separated.
     *   `AB 12 34 56 C`   standard printed format (spaces between pairs)
     *   `AB123456C`       compact format (no spaces)
     *
     * Constraints:
     *   - First letter: not D, F, I, Q, U, V; not BG, GB, KN, NK, NT, TN, ZZ
     *   - Second letter: not D, F, I, Q, U, V
     *   - Suffix: A, B, C, or D only
     *
     * Pattern simplifies the first/second letter exclusions to the most common
     * valid range — captures all real NINs while excluding the most common
     * invalid prefixes.
     *
     * Matches:
     *   `AB 12 34 56 C`   standard spaced format
     *   `AB123456C`       compact no-space format
     *   `QQ 12 34 56 A`   valid prefix
     */
    UK_NIN:
      "\\b[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\\s?\\d{2}\\s?\\d{2}\\s?\\d{2}\\s?[A-D]\\b",
  });

// ─── Opt-in patterns ──────────────────────────────────────────────────────────

/**
 * High false positive patterns — opt-in only.
 *
 * These five patterns were evaluated for inclusion in {@link FIELDSHIELD_PATTERNS}
 * and excluded because they produce unacceptably high false positive rates in
 * free-text fields, clinical notes, and general-purpose input fields.
 *
 * **Use via `customPatterns`** only on fields where the specific data type is
 * known to be expected. Do not add these to free-text or clinical note fields.
 *
 * @example
 * ```tsx
 * import { OPT_IN_PATTERNS } from "fieldshield";
 *
 * // Only on a payment or banking field
 * <FieldShieldInput
 *   label="IBAN"
 *   customPatterns={[{ name: "IBAN", regex: OPT_IN_PATTERNS.IBAN }]}
 * />
 *
 * // Only on a DEA number entry field (prescriber credentialing)
 * <FieldShieldInput
 *   label="DEA Number"
 *   customPatterns={[{ name: "DEA_NUMBER", regex: OPT_IN_PATTERNS.DEA_NUMBER }]}
 * />
 *
 * // Only on a dedicated wire transfer form field
 * <FieldShieldInput
 *   label="Bank (SWIFT/BIC)"
 *   customPatterns={[{ name: "SWIFT_BIC", regex: OPT_IN_PATTERNS.SWIFT_BIC }]}
 * />
 *
 * // Only on a provider lookup field
 * <FieldShieldInput
 *   label="Provider NPI"
 *   customPatterns={[{ name: "NPI_NUMBER", regex: OPT_IN_PATTERNS.NPI_NUMBER }]}
 * />
 *
 * // Only on a passport / identity verification field
 * <FieldShieldInput
 *   label="Passport Number"
 *   customPatterns={[{ name: "PASSPORT_NUMBER", regex: OPT_IN_PATTERNS.PASSPORT_NUMBER }]}
 * />
 * ```
 */
export const OPT_IN_PATTERNS: Readonly<Record<string, string>> = Object.freeze({
  /**
   * International Bank Account Number (IBAN) — with or without spaces.
   *
   * **Why opt-in:**
   * The pattern opens with two uppercase letters followed by two digits, then
   * continues with alphanumeric groups. In clinical and pharmaceutical contexts,
   * structured identifiers that share this shape — laboratory accession numbers,
   * specimen container IDs, reagent lot codes, GS1 product codes, and ISO
   * country-code-prefixed reference IDs — trigger this pattern. IBAN detection
   * is only meaningful on dedicated payment or banking fields; enabling it on
   * healthcare or general free-text fields produces frequent false positives.
   *
   * **When to use:** Payment instruction fields, wire transfer forms, banking
   * account entry — fields where an IBAN is the specifically expected value.
   *
   * Matches:
   *   `GB82WEST12345698765432`         no spaces
   *   `GB82 WEST 1234 5698 7654 32`   standard printed format
   *   `DE89370400440532013000`         German IBAN no spaces
   */
  IBAN: "\\b[A-Z]{2}\\d{2}[-\\s]?(?:[A-Z0-9]{1,4}[-\\s]?){3,}[A-Z0-9]{1,4}\\b",

  /**
   * DEA Registration Number — US Drug Enforcement Administration prescriber ID.
   *
   * Format: 2 letters + 7 digits.
   *   - First letter: registrant type code (A-Z minus I, N, O, V, W, Y, Z)
   *   - Second letter: first letter of registrant's last name (A-Z)
   *   - 7 digits: unique identifier with check digit
   *
   * **Why opt-in:**
   * The pattern `[A-Z]{2}\d{7}` matches any two uppercase letters followed by
   * seven digits. This shape is ubiquitous in pharmaceutical and clinical contexts:
   * medication lot numbers (`AB1234567`), product batch codes (`CD9876543`),
   * laboratory reagent IDs, and equipment serial numbers all satisfy the constraint.
   * In clinical notes, pharmacy systems, and inventory fields the false positive
   * rate is unacceptably high.
   *
   * **When to use:** Dedicated DEA number entry fields — prescriber credentialing
   * forms, controlled substance prescribing UI, pharmacy management systems where
   * a DEA number is the specifically expected value. Do not enable on clinical
   * notes, pharmacy dispensing free-text, or general healthcare free-text fields.
   *
   * Matches:
   *   `AB1234563`   practitioner (C) + last name initial B
   *   `BX9876541`   hospital (B) + last name initial X
   */
  DEA_NUMBER: "\\b[ABCDEFGHJKLMPRSTUX][A-Z]\\d{7}\\b",
  /**
   * SWIFT / BIC Code — Society for Worldwide Interbank Financial
   * Telecommunication Business Identifier Code.
   *
   * **Why opt-in:**
   * The pattern `[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?` matches any
   * 8-letter word. Common English medical and technical terms —
   * "nephropathy", "computing", "HYPERTENSION", "PENICILLIN" — all satisfy
   * the 8-character uppercase letter constraint. In clinical notes or
   * free-text fields this produces an extremely high false positive rate.
   *
   * **When to use:** Wire transfer instruction fields, SWIFT payment forms,
   * or correspondent banking UI where a BIC code is the expected value.
   * Do not enable on general-purpose or clinical free-text fields.
   *
   * Format: 8 or 11 alphanumeric characters.
   *   - Bank code:     4 uppercase letters    e.g. `DEUT`
   *   - Country code:  2 uppercase letters    e.g. `DE`
   *   - Location code: 2 alphanumeric chars   e.g. `DB`
   *   - Branch code:   3 alphanumeric chars   e.g. `BER` (optional)
   *
   * Matches:
   *   `DEUTDEDB`      8-character (head office)
   *   `DEUTDEDBBER`   11-character (branch)
   *   `BOFAUS3N`      Bank of America US
   *   `CHASUS33`      JPMorgan Chase US
   */
  SWIFT_BIC: "\\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?\\b",

  /**
   * National Provider Identifier (NPI) — 10-digit US healthcare provider ID.
   *
   * **Why opt-in:**
   * The pattern `[12]\d{9}` matches any 10-digit number beginning with 1 or 2.
   * In free-text clinical notes, dates with times, order numbers, reference IDs,
   * and phone-number-adjacent strings frequently produce 10-digit sequences
   * starting with 1 or 2. The false positive rate in unstructured clinical text
   * is too high for this to be a default.
   *
   * **When to use:** Provider lookup fields, credentialing forms, NPI registry
   * search inputs — fields where a 10-digit provider ID is the expected value.
   * Do not enable on clinical note, encounter note, or general-purpose fields.
   *
   * NPIs are issued by CMS and are publicly searchable via the NPPES registry.
   * An NPI in isolation is not sensitive — it is intentionally public. When an
   * NPI appears alongside patient data it becomes a PHI linkage key.
   *
   * Two types:
   *   Type 1 (Individual): begins with 1   e.g. `1234567893`
   *   Type 2 (Organization): begins with 2 e.g. `2345678901`
   */
  NPI_NUMBER: "\\b[12]\\d{9}\\b",

  /**
   * Passport number — 1–2 uppercase letters followed by 6–9 digits.
   *
   * **Why opt-in:**
   * The pattern `[A-Z]{1,2}[0-9]{6,9}` matches letter+digit combinations
   * that are extremely common in clinical and product contexts:
   * medication lot numbers (`AB123456`), lab specimen IDs (`A1234567`),
   * ICD-10 codes with procedure modifiers, and equipment serial numbers
   * all match this pattern. In clinical notes the false positive rate is high.
   *
   * **When to use:** Identity verification fields, KYC document entry forms,
   * travel document upload flows — fields where a passport number is the
   * expected value. Do not enable on clinical, product, or general free-text
   * fields.
   *
   * Covers the most common formats:
   *   US:  1 letter + 8 digits   e.g. `A12345678`
   *   EU:  2 letters + 7 digits  e.g. `AB1234567`
   *   IN:  1 letter + 7 digits   e.g. `A1234567`
   */
  PASSPORT_NUMBER: "\\b[A-Z]{1,2}[0-9]{6,9}\\b",
});
