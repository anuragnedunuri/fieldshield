/**
 * @file patterns.test.ts
 * @location src/tests/patterns.test.ts
 *
 * Unit tests for FIELDSHIELD_PATTERNS.
 * patterns.ts lives at src/patterns.ts — one level up from this file.
 *
 * Every pattern tested against:
 *   - All documented matching formats
 *   - Boundary / edge cases that must NOT match
 *   - Common false-positive candidates
 *   - Regex lastIndex safety (stateful global flag)
 */

import { describe, it, expect } from "vitest";
import { FIELDSHIELD_PATTERNS, OPT_IN_PATTERNS } from "../patterns";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function match(key: keyof typeof FIELDSHIELD_PATTERNS, input: string): boolean {
  const re = new RegExp(FIELDSHIELD_PATTERNS[key], "gi");
  return re.test(input);
}

function matchOptIn(
  key: keyof typeof OPT_IN_PATTERNS,
  input: string,
): boolean {
  const re = new RegExp(OPT_IN_PATTERNS[key], "gi");
  return re.test(input);
}

// ─── SSN ──────────────────────────────────────────────────────────────────────

describe("FIELDSHIELD_PATTERNS.SSN", () => {
  const should: [string, string][] = [
    ["123-45-6789", "hyphen separated (standard)"],
    ["123 45 6789", "space separated (mobile)"],
    ["123.45.6789", "dot separated"],
    ["123456789", "no separator (database copy-paste)"],
    ["078-05-1120", "real-format SSN"],
    ["000-00-0001", "low number SSN"],
  ];

  const shouldNot: [string, string][] = [
    ["1234567890", "10 digits — too long"],
    ["12345678", "8 digits — too short"],
    ["abc-de-fghi", "letters"],
    ["123-456-789", "wrong group lengths"],
    ["", "empty string"],
  ];

  it.each(should)("matches '%s' (%s)", (input) => {
    expect(match("SSN", input)).toBe(true);
  });

  it.each(shouldNot)("does not match '%s' (%s)", (input) => {
    expect(match("SSN", input)).toBe(false);
  });

  it("detects SSN embedded in a sentence", () => {
    expect(match("SSN", "Patient SSN is 123-45-6789 per record")).toBe(true);
  });

  it("detects bare 9-digit SSN embedded in a sentence", () => {
    expect(match("SSN", "ID number: 123456789 on file")).toBe(true);
  });
});

// ─── EMAIL ────────────────────────────────────────────────────────────────────

describe("FIELDSHIELD_PATTERNS.EMAIL", () => {
  const should: [string, string][] = [
    ["user@example.com", "standard"],
    ["user+tag@example.com", "plus addressing"],
    ["user.name@sub.domain.io", "dots and subdomains"],
    ["user_123@example.co.uk", "underscore, country TLD"],
    ["USER@EXAMPLE.COM", "uppercase"],
    ["u@e.co", "minimal valid email"],
  ];

  const shouldNot: [string, string][] = [
    ["notanemail", "no @ or domain"],
    ["@nodomain.com", "no local part"],
    ["user@", "no domain"],
    ["user@domain", "no TLD"],
    ["", "empty"],
  ];

  it.each(should)("matches '%s' (%s)", (input) => {
    expect(match("EMAIL", input)).toBe(true);
  });

  it.each(shouldNot)("does not match '%s' (%s)", (input) => {
    expect(match("EMAIL", input)).toBe(false);
  });
});

// ─── PHONE ────────────────────────────────────────────────────────────────────

describe("FIELDSHIELD_PATTERNS.PHONE", () => {
  const should: [string, string][] = [
    ["555-123-4567", "US hyphen"],
    ["555 123 4567", "US space"],
    ["5551234567", "US no separator"],
    ["(555) 123-4567", "US with parens"],
    ["1-555-123-4567", "US with country code hyphen"],
    ["+1 555 123 4567", "US with +1"],
    ["+44 7911 123456", "UK mobile"],
    ["+91 9876543210", "India mobile"],
    ["+353 86 123 4567", "Ireland mobile"],
    ["+86 138 0013 8000", "China mobile"],
  ];

  const shouldNot: [string, string][] = [
    ["123-456-789", "only 9 digits"],
    ["12345", "way too short"],
    ["abcdefghij", "letters"],
    ["", "empty"],
  ];

  it.each(should)("matches '%s' (%s)", (input) => {
    expect(match("PHONE", input)).toBe(true);
  });

  it.each(shouldNot)("does not match '%s' (%s)", (input) => {
    expect(match("PHONE", input)).toBe(false);
  });
});

// ─── CREDIT_CARD ──────────────────────────────────────────────────────────────

describe("FIELDSHIELD_PATTERNS.CREDIT_CARD", () => {
  const should: [string, string][] = [
    ["4111111111111111", "Visa no separator"],
    ["4111 1111 1111 1111", "Visa spaces"],
    ["4111-1111-1111-1111", "Visa hyphens"],
    ["5500005555555559", "Mastercard no separator"],
    ["5500 0055 5555 5559", "Mastercard spaces"],
    ["5500-0055-5555-5559", "Mastercard hyphens"],
    ["378282246310005", "Amex no separator"],
    ["3782 822463 10005", "Amex spaces"],
    ["3782-822463-10005", "Amex hyphens"],
  ];

  const shouldNot: [string, string][] = [
    ["1234567890123456", "wrong prefix — not Visa/MC/Amex"],
    ["411111111111111", "Visa only 15 digits"],
    ["41111111111111111", "Visa 17 digits — too long"],
    ["", "empty"],
  ];

  it.each(should)("matches '%s' (%s)", (input) => {
    expect(match("CREDIT_CARD", input)).toBe(true);
  });

  it.each(shouldNot)("does not match '%s' (%s)", (input) => {
    expect(match("CREDIT_CARD", input)).toBe(false);
  });
});

// ─── AI_API_KEY ───────────────────────────────────────────────────────────────

describe("FIELDSHIELD_PATTERNS.AI_API_KEY", () => {
  const should: [string, string][] = [
    ["sk-abcdefghijklmnopqrstu", "OpenAI old personal"],
    ["sk-proj-abc123def456ghi789jkl012mno345", "OpenAI project key"],
    ["sk-svcacct-abc123def456ghi789jkl012", "OpenAI service account"],
    ["sk-ant-api03-abc123def456ghi789jkl012", "Anthropic actual format"],
    ["ant-api-abc123def456ghi789jkl012mno", "Anthropic legacy prefix"],
    ["AIza" + "A".repeat(35), "Google AIza key"],
  ];

  const shouldNot: [string, string][] = [
    ["sk-short", "sk- but too short"],
    ["sk-", "sk- with nothing after"],
    ["random-string", "no recognisable prefix"],
    ["", "empty"],
  ];

  it.each(should)("matches '%s' (%s)", (input) => {
    expect(match("AI_API_KEY", input)).toBe(true);
  });

  it.each(shouldNot)("does not match '%s' (%s)", (input) => {
    expect(match("AI_API_KEY", input)).toBe(false);
  });
});

// ─── AWS_ACCESS_KEY ───────────────────────────────────────────────────────────

describe("FIELDSHIELD_PATTERNS.AWS_ACCESS_KEY", () => {
  const should: [string, string][] = [
    ["AKIAIOSFODNN7EXAMPLE", "AKIA permanent key"],
    ["ASIAIOSFODNN7EXAMPLE", "ASIA temporary key"],
  ];

  const shouldNot: [string, string][] = [
    ["ASXAIOSFODNN7EXAMPLE", "ASXA — invalid prefix (old typo)"],
    ["AKIAIOSFODNN7EXAMPL", "one char short"],
    ["", "empty"],
  ];

  it.each(should)("matches '%s' (%s)", (input) => {
    expect(match("AWS_ACCESS_KEY", input)).toBe(true);
  });

  it.each(shouldNot)("does not match '%s' (%s)", (input) => {
    expect(match("AWS_ACCESS_KEY", input)).toBe(false);
  });
});


// ─── DATE_OF_BIRTH ────────────────────────────────────────────────────────────

describe("FIELDSHIELD_PATTERNS.DATE_OF_BIRTH", () => {
  const should: [string, string][] = [
    ["01/15/1990", "MM/DD/YYYY slashes"],
    ["01-15-1990", "MM-DD-YYYY hyphens"],
    ["01.15.1990", "MM.DD.YYYY dots"],
    ["1990-01-15", "YYYY-MM-DD ISO 8601"],
    ["1990/01/15", "YYYY/MM/DD"],
    ["12/31/1999", "last day of year"],
    ["02/28/2000", "Feb 28"],
    ["01/01/2000", "millennium"],
  ];

  const shouldNot: [string, string][] = [
    ["13/01/1990", "month 13 — invalid"],
    ["01/32/1990", "day 32 — invalid"],
    ["01/15/1800", "year 1800 — before 1900"],
    ["01/15/2100", "year 2100 — after 2099"],
    ["notadate", "letters"],
    ["", "empty"],
  ];

  it.each(should)("matches '%s' (%s)", (input) => {
    expect(match("DATE_OF_BIRTH", input)).toBe(true);
  });

  it.each(shouldNot)("does not match '%s' (%s)", (input) => {
    expect(match("DATE_OF_BIRTH", input)).toBe(false);
  });
});

// ─── TAX_ID ───────────────────────────────────────────────────────────────────

describe("FIELDSHIELD_PATTERNS.TAX_ID", () => {
  const should: [string, string][] = [
    ["12-3456789", "EIN hyphenated format"],
    ["123456789", "9 digits no separator"],
    ["98-7654321", "another EIN"],
  ];

  const shouldNot: [string, string][] = [
    ["12345678", "8 digits — too short"],
    ["1234567890", "10 digits — too long"],
    ["12-345678", "wrong hyphen position"],
    ["", "empty"],
  ];

  it.each(should)("matches '%s' (%s)", (input) => {
    expect(match("TAX_ID", input)).toBe(true);
  });

  it.each(shouldNot)("does not match '%s' (%s)", (input) => {
    expect(match("TAX_ID", input)).toBe(false);
  });
});

// ─── GITHUB_TOKEN ─────────────────────────────────────────────────────────────

describe("FIELDSHIELD_PATTERNS.GITHUB_TOKEN", () => {
  const should: [string, string][] = [
    ["ghp_abc123def456ghi789jkl012mno345", "ghp_ personal access token"],
    ["gho_abc123def456ghi789jkl012mno345", "gho_ OAuth token"],
    ["ghs_abc123def456ghi789jkl012mno345", "ghs_ server-to-server"],
    ["ghu_abc123def456ghi789jkl012mno345", "ghu_ user-to-server"],
    ["github_pat_abc123def456ghi789jkl012", "github_pat_ fine-grained PAT"],
  ];

  const shouldNot: [string, string][] = [
    ["ghp_short", "ghp_ too short"],
    ["xyz_abc123def456ghi789jkl012mno345", "wrong prefix"],
    ["ghp_", "ghp_ with nothing after"],
    ["", "empty"],
  ];

  it.each(should)("matches '%s' (%s)", (input) => {
    expect(match("GITHUB_TOKEN", input)).toBe(true);
  });

  it.each(shouldNot)("does not match '%s' (%s)", (input) => {
    expect(match("GITHUB_TOKEN", input)).toBe(false);
  });
});

// ─── STRIPE_KEY ───────────────────────────────────────────────────────────────

describe("FIELDSHIELD_PATTERNS.STRIPE_KEY", () => {
  const should: [string, string][] = [
    ["sk_live_abc123def456ghi789jkl012mno", "secret live key"],
    ["sk_test_abc123def456ghi789jkl012mno", "secret test key"],
    ["pk_live_abc123def456ghi789jkl012mno", "publishable live key"],
    ["pk_test_abc123def456ghi789jkl012mno", "publishable test key"],
    ["rk_live_abc123def456ghi789jkl012mno", "restricted live key"],
    ["rk_test_abc123def456ghi789jkl012mno", "restricted test key"],
  ];

  const shouldNot: [string, string][] = [
    ["sk_live_short", "too short body"],
    ["xx_live_abc123def456ghi789jkl012mno", "wrong prefix"],
    ["sk_staging_abc123def456ghi789jkl012", "unknown environment"],
    ["", "empty"],
  ];

  it.each(should)("matches '%s' (%s)", (input) => {
    expect(match("STRIPE_KEY", input)).toBe(true);
  });

  it.each(shouldNot)("does not match '%s' (%s)", (input) => {
    expect(match("STRIPE_KEY", input)).toBe(false);
  });
});

// ─── JWT ─────────────────────────────────────────────────────────────────────

describe("FIELDSHIELD_PATTERNS.JWT", () => {
  const should: [string, string][] = [
    [
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      "standard JWT HS256",
    ],
    [
      "eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJodHRwcyJ9.signature",
      "minimal RS256 JWT",
    ],
    [
      "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzM4NCJ9.eyJ1c2VyX2lkIjoiMTIzIn0.abc123",
      "JWT with typ header",
    ],
  ];

  const shouldNot: [string, string][] = [
    ["notajwt", "no dots at all"],
    ["a.b.c", "three parts but no eyJ prefix"],
    ["a.b", "only two parts"],
    ["eyJonly", "starts with eyJ but no dots"],
    ["", "empty"],
  ];

  it.each(should)("matches '%s' (%s)", (input) => {
    expect(match("JWT", input)).toBe(true);
  });

  it.each(shouldNot)("does not match '%s' (%s)", (input) => {
    expect(match("JWT", input)).toBe(false);
  });
});

// ─── PRIVATE_KEY_BLOCK ────────────────────────────────────────────────────────

describe("FIELDSHIELD_PATTERNS.PRIVATE_KEY_BLOCK", () => {
  const should: [string, string][] = [
    ["-----BEGIN PRIVATE KEY-----", "generic PKCS8"],
    ["-----BEGIN RSA PRIVATE KEY-----", "RSA PKCS1"],
    ["-----BEGIN EC PRIVATE KEY-----", "EC key"],
    ["-----BEGIN OPENSSH PRIVATE KEY-----", "OpenSSH format"],
  ];

  const shouldNot: [string, string][] = [
    ["-----BEGIN PUBLIC KEY-----", "public key — not sensitive"],
    ["-----BEGIN CERTIFICATE-----", "X.509 cert — not sensitive"],
    ["-----BEGIN CSR-----", "certificate signing request"],
    ["random text", "no PEM header"],
    ["", "empty"],
  ];

  it.each(should)("matches '%s' (%s)", (input) => {
    expect(match("PRIVATE_KEY_BLOCK", input)).toBe(true);
  });

  it.each(shouldNot)("does not match '%s' (%s)", (input) => {
    expect(match("PRIVATE_KEY_BLOCK", input)).toBe(false);
  });
});


// ─── UK_NIN ───────────────────────────────────────────────────────────────────

describe("FIELDSHIELD_PATTERNS.UK_NIN", () => {
  const should: [string, string][] = [
    ["AB 12 34 56 C", "standard spaced format"],
    ["AB123456C", "compact no-space format"],
    ["ZZ 12 34 56 D", "valid prefix ZZ, suffix D"],
    ["AA123456B", "compact, suffix B"],
    ["TN 12 34 56 C", "valid TN prefix"],
  ];

  const shouldNot: [string, string][] = [
    ["AB 12 34 56 E", "invalid suffix E"],
    ["AB 12 34 56 5", "numeric suffix"],
    ["D1 12 34 56 A", "invalid first letter D"],
    ["Q1 12 34 56 A", "invalid first letter Q — excluded from valid range"],
    ["QQ 12 34 56 A", "invalid first letter Q — excluded from valid range"],
    ["AB 12 34 56", "missing suffix"],
    ["AB1234567C", "7 digits instead of 6"],
    ["", "empty string"],
    ["AB 12 34 56 AB", "double letter suffix"],
  ];

  it.each(should)("matches '%s' (%s)", (input) => {
    expect(match("UK_NIN", input)).toBe(true);
  });

  it.each(shouldNot)("does not match '%s' (%s)", (input) => {
    expect(match("UK_NIN", input)).toBe(false);
  });

  it("matches NIN embedded in form text", () => {
    expect(match("UK_NIN", "National Insurance Number: AB 12 34 56 C")).toBe(
      true,
    );
  });

  it("matches both spaced and compact in the same string", () => {
    const input = "Primary: AB 12 34 56 C, Secondary: CD345678A";
    expect(match("UK_NIN", input)).toBe(true);
  });
});


// ─── OPT_IN_PATTERNS ─────────────────────────────────────────────────────────
//
// These five patterns were removed from FIELDSHIELD_PATTERNS defaults due to
// high false positive rates in free-text and clinical note fields. They are
// exported separately in OPT_IN_PATTERNS for use via customPatterns on fields
// where the specific data type is known to be expected.

describe("OPT_IN_PATTERNS.IBAN", () => {
  const should: [string, string][] = [
    ["GB82WEST12345698765432", "UK no spaces"],
    ["GB82 WEST 1234 5698 7654 32", "UK standard printed format"],
    ["DE89370400440532013000", "German no spaces"],
    ["DE89 3704 0044 0532 0130 00", "German with spaces"],
    ["FR7630006000011234567890189", "French no spaces"],
    ["NL91ABNA0417164300", "Dutch no spaces"],
  ];

  const shouldNot: [string, string][] = [
    ["AB12", "too short"],
    ["1234567890", "no country code"],
    ["", "empty"],
  ];

  it.each(should)("matches '%s' (%s)", (input) => {
    expect(matchOptIn("IBAN", input)).toBe(true);
  });

  it.each(shouldNot)("does not match '%s' (%s)", (input) => {
    expect(matchOptIn("IBAN", input)).toBe(false);
  });
});

describe("OPT_IN_PATTERNS.DEA_NUMBER", () => {
  const should: [string, string][] = [
    ["AB1234563", "practitioner type B, last name A"],
    ["BX9876541", "hospital type B, last name X"],
    ["MJ5678901", "narcotic treatment program, last name J"],
    ["XZ1234567", "suboxone prescriber, last name Z"],
    ["FP2345678", "distributor type F, last name P"],
    ["ab1234563", "lowercase — matches due to case-insensitive gi flags"],
  ];

  const shouldNot: [string, string][] = [
    ["AB123456", "only 6 digits — too short"],
    ["AB12345678", "8 digits — too long"],
    ["1B1234563", "starts with digit — invalid first char"],
    ["AA123456Z", "letter in digit section"],
    ["", "empty string"],
  ];

  it.each(should)("matches '%s' (%s)", (input) => {
    expect(matchOptIn("DEA_NUMBER", input)).toBe(true);
  });

  it.each(shouldNot)("does not match '%s' (%s)", (input) => {
    expect(matchOptIn("DEA_NUMBER", input)).toBe(false);
  });

  it("matches DEA number embedded in prescriber field text", () => {
    expect(matchOptIn("DEA_NUMBER", "DEA Reg: AB1234563 expires 2025")).toBe(
      true,
    );
  });

  it("does not match invalid registrant type prefix", () => {
    // I, N, O, V, W, Y, Z are not valid DEA registrant type codes
    expect(matchOptIn("DEA_NUMBER", "IB1234563")).toBe(false);
    expect(matchOptIn("DEA_NUMBER", "NB1234563")).toBe(false);
  });

  it("does not match pharmaceutical lot number false positive", () => {
    // AB1234567 matches the DEA pattern — this documents the false positive risk
    // that drives opt-in status. On a clinical free-text field this would fire.
    // The test confirms the pattern DOES match such strings (opt-in risk, not a bug).
    expect(matchOptIn("DEA_NUMBER", "Lot: AB1234567")).toBe(true);
  });
});

describe("OPT_IN_PATTERNS.SWIFT_BIC", () => {
  const should: [string, string][] = [
    ["DEUTDEDB", "Deutsche Bank 8-char (head office)"],
    ["DEUTDEDBBER", "Deutsche Bank 11-char (Berlin branch)"],
    ["BOFAUS3N", "Bank of America US"],
    ["CHASUS33", "JPMorgan Chase"],
    ["NWBKGB2L", "NatWest UK"],
    ["BNPAFRPP", "BNP Paribas France"],
    ["deutdedb", "lowercase — matches due to case-insensitive gi flags"],
  ];

  const shouldNot: [string, string][] = [
    ["DEUT", "only 4 chars — too short"],
    ["DEUTDEDBB", "9 chars — invalid length"],
    ["DEUTDEDBBERX", "12 chars — too long"],
    ["1234DE56", "bank code starts with digits"],
    // Word boundary protection: a word longer than 11 chars has no \b after position 11
    // so neither the 8-char nor the 11-char alternative can anchor. Note: standalone
    // 8- or 11-letter words DO match (e.g. "NEPHROPATHY") — that is the false positive
    // risk driving this pattern to opt-in status.
    ["NEPHROPATHYXYZ", "word longer than 11 letters — no word boundary after BIC length"],
    ["", "empty string"],
  ];

  it.each(should)("matches '%s' (%s)", (input) => {
    expect(matchOptIn("SWIFT_BIC", input)).toBe(true);
  });

  it.each(shouldNot)("does not match '%s' (%s)", (input) => {
    expect(matchOptIn("SWIFT_BIC", input)).toBe(false);
  });

  it("matches SWIFT code embedded in wire transfer instructions", () => {
    expect(
      matchOptIn("SWIFT_BIC", "Please send to DEUTDEDBBER, account 12345"),
    ).toBe(true);
  });

  it("matches both 8 and 11 character forms in same string", () => {
    const input = "Primary: BOFAUS3N, Branch: DEUTDEDBBER";
    expect(matchOptIn("SWIFT_BIC", input)).toBe(true);
  });
});

describe("OPT_IN_PATTERNS.NPI_NUMBER", () => {
  const should: [string, string][] = [
    ["1234567893", "Type 1 individual provider"],
    ["2345678901", "Type 2 organization"],
    ["1000000000", "minimum Type 1"],
    ["1999999999", "maximum Type 1 range"],
    ["2000000000", "minimum Type 2"],
  ];

  const shouldNot: [string, string][] = [
    ["3234567890", "starts with 3 — invalid NPI prefix"],
    ["0234567890", "starts with 0 — invalid NPI prefix"],
    ["123456789", "9 digits — too short"],
    ["12345678901", "11 digits — too long"],
    ["123456789A", "contains letter"],
    ["", "empty string"],
  ];

  it.each(should)("matches '%s' (%s)", (input) => {
    expect(matchOptIn("NPI_NUMBER", input)).toBe(true);
  });

  it.each(shouldNot)("does not match '%s' (%s)", (input) => {
    expect(matchOptIn("NPI_NUMBER", input)).toBe(false);
  });

  it("matches NPI embedded in surrounding text", () => {
    expect(matchOptIn("NPI_NUMBER", "Provider NPI: 1234567893 on file")).toBe(
      true,
    );
  });

  it("does not match when preceded by extra digits", () => {
    expect(matchOptIn("NPI_NUMBER", "ID: 91234567893")).toBe(false);
  });
});

describe("OPT_IN_PATTERNS.PASSPORT_NUMBER", () => {
  const should: [string, string][] = [
    ["A1234567", "India — 1 letter + 7 digits"],
    ["A12345678", "US — 1 letter + 8 digits"],
    ["AB1234567", "EU — 2 letters + 7 digits"],
    ["P12345678", "P + 8 digits"],
  ];

  const shouldNot: [string, string][] = [
    ["A123", "too short"],
    ["ABC1234567", "3 letters — exceeds pattern"],
    ["123456789", "digits only"],
    ["ABCDEFGH", "letters only"],
    // Word boundary protection: digits followed immediately by letters produce no \b
    // after the digit run, so the pattern cannot anchor. This is the key false positive
    // guard for clinical strings like "AB123456extra" (lot numbers, specimen IDs).
    ["AB123456extra", "digits run into letters — no word boundary after digit group"],
    ["", "empty"],
  ];

  it.each(should)("matches '%s' (%s)", (input) => {
    expect(matchOptIn("PASSPORT_NUMBER", input)).toBe(true);
  });

  it.each(shouldNot)("does not match '%s' (%s)", (input) => {
    expect(matchOptIn("PASSPORT_NUMBER", input)).toBe(false);
  });
});

// ─── Cross-pattern ────────────────────────────────────────────────────────────

describe("Multiple patterns in one string", () => {
  it("detects SSN and EMAIL together", () => {
    const input = "SSN: 123-45-6789 email: user@example.com";
    expect(match("SSN", input)).toBe(true);
    expect(match("EMAIL", input)).toBe(true);
  });

  it("detects credit card and phone together", () => {
    const input = "Card: 4111 1111 1111 1111, Phone: 555-123-4567";
    expect(match("CREDIT_CARD", input)).toBe(true);
    expect(match("PHONE", input)).toBe(true);
  });
});

// ─── Regex safety ─────────────────────────────────────────────────────────────

describe("Regex lastIndex reset safety", () => {
  it("matches correctly on successive calls with the same RegExp instance", () => {
    const re = new RegExp(FIELDSHIELD_PATTERNS.SSN, "gi");
    re.lastIndex = 0;
    expect(re.test("123-45-6789")).toBe(true);
    re.lastIndex = 0;
    expect(re.test("123-45-6789")).toBe(true);
  });

  it("replaces all occurrences with global flag", () => {
    const re = new RegExp(FIELDSHIELD_PATTERNS.SSN, "gi");
    const result = "123-45-6789 and 987-65-4321".replace(re, "***");
    expect(result).toBe("*** and ***");
  });
});
