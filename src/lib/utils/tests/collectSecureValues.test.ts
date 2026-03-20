/**
 * @file collectSecureValues.test.ts
 * @location src/lib/utils/tests/collectSecureValues.test.ts
 *
 * Import paths:
 *   ../collectSecureValue   → src/lib/utils/collectSecureValue.tsx
 *   ../../components/...    → src/lib/components/FieldShieldInput.tsx
 */

import { describe, it, expect, vi } from "vitest";
import { collectSecureValues, purgeSecureValues } from "../collectSecureValue";
import type { FieldShieldHandle } from "../../components/FieldShieldInput";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * All helpers return plain objects — structurally compatible with
 * RefObject<FieldShieldHandle> without needing createRef or @ts-expect-error.
 * TypeScript uses structural typing, so { current: FieldShieldHandle }
 * satisfies RefObject<FieldShieldHandle> by shape alone.
 */

function makeHandle(value: string): FieldShieldHandle {
  return {
    getSecureValue: vi.fn().mockResolvedValue(value),
    purge: vi.fn(),
  };
}

function makeRef(value: string): { current: FieldShieldHandle } {
  return { current: makeHandle(value) };
}

function makeNullRef(): { current: null } {
  return { current: null };
}

function makeRejectedRef(error: Error): { current: FieldShieldHandle } {
  return {
    current: {
      getSecureValue: vi.fn().mockRejectedValue(error),
      purge: vi.fn(),
    },
  };
}

// ─── collectSecureValues ─────────────────────────────────────────────────────

describe("collectSecureValues", () => {
  it("resolves a single field to its real value", async () => {
    const values = await collectSecureValues({ ssn: makeRef("123-45-6789") });
    expect(values.ssn).toBe("123-45-6789");
  });

  it("resolves multiple fields in parallel", async () => {
    const values = await collectSecureValues({
      ssn: makeRef("123-45-6789"),
      email: makeRef("user@example.com"),
      phone: makeRef("555-123-4567"),
    });
    expect(values.ssn).toBe("123-45-6789");
    expect(values.email).toBe("user@example.com");
    expect(values.phone).toBe("555-123-4567");
  });

  it("resolves a null ref to empty string", async () => {
    const values = await collectSecureValues({ missing: makeNullRef() });
    expect(values.missing).toBe("");
  });

  it("resolves an empty-string field correctly", async () => {
    const values = await collectSecureValues({ empty: makeRef("") });
    expect(values.empty).toBe("");
  });

  it("calls getSecureValue exactly once per ref", async () => {
    const ref = makeRef("value");
    await collectSecureValues({ field: ref });
    expect(ref.current.getSecureValue).toHaveBeenCalledOnce();
  });

  it("resolves a rejected field to empty string and logs a warning", async () => {
    const ref = makeRejectedRef(new Error("timeout"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const values = await collectSecureValues({ failedField: ref });

    expect(values.failedField).toBe("");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("failedField"),
      expect.any(Error),
    );
    warn.mockRestore();
  });

  it("other fields still resolve when one field rejects", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const values = await collectSecureValues({
      good: makeRef("good value"),
      bad: makeRejectedRef(new Error("timeout")),
    });

    expect(values.good).toBe("good value");
    expect(values.bad).toBe("");
    warn.mockRestore();
  });

  it("preserves key names exactly in the result object", async () => {
    const values = await collectSecureValues({
      patientSSN: makeRef("ssn-value"),
      clinicEmail: makeRef("email-value"),
    });
    expect(Object.keys(values)).toContain("patientSSN");
    expect(Object.keys(values)).toContain("clinicEmail");
  });

  it("handles a large number of fields", async () => {
    const refs: Record<string, { current: FieldShieldHandle }> = {};
    for (let i = 0; i < 20; i++) refs[`field${i}`] = makeRef(`value${i}`);

    const values = await collectSecureValues(refs);
    for (let i = 0; i < 20; i++) {
      expect(values[`field${i}`]).toBe(`value${i}`);
    }
  });

  it("handles an empty refs map without error", async () => {
    const values = await collectSecureValues({});
    expect(values).toEqual({});
  });
});

// ─── purgeSecureValues ────────────────────────────────────────────────────────

describe("purgeSecureValues", () => {
  it("calls purge on every ref", () => {
    const ref1 = makeRef("a");
    const ref2 = makeRef("b");
    purgeSecureValues({ field1: ref1, field2: ref2 });
    expect(ref1.current.purge).toHaveBeenCalledOnce();
    expect(ref2.current.purge).toHaveBeenCalledOnce();
  });

  it("silently skips null refs", () => {
    expect(() => purgeSecureValues({ missing: makeNullRef() })).not.toThrow();
  });

  it("returns undefined (void)", () => {
    const result = purgeSecureValues({ field: makeRef("value") });
    expect(result).toBeUndefined();
  });

  it("handles an empty refs map without error", () => {
    expect(() => purgeSecureValues({})).not.toThrow();
  });
});

// ─── Integration: collect then purge ─────────────────────────────────────────

describe("collectSecureValues + purgeSecureValues integration", () => {
  it("getSecureValue is called before purge", async () => {
    const calls: string[] = [];
    const ref = {
      current: {
        getSecureValue: vi.fn().mockImplementation(async () => {
          calls.push("getSecureValue");
          return "secret";
        }),
        purge: vi.fn().mockImplementation(() => {
          calls.push("purge");
        }),
      },
    };

    const values = await collectSecureValues({ field: ref });
    purgeSecureValues({ field: ref });

    expect(values.field).toBe("secret");
    expect(calls).toEqual(["getSecureValue", "purge"]);
  });
});
