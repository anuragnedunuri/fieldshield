/**
 * @file worker.test.ts
 * @location src/lib/workers/tests/worker.test.ts
 *
 * Unit tests for fieldshield.worker.ts logic via MockWorker.
 *
 * Import paths:
 *   ../../.. → src/
 *   ../../../patterns → src/patterns.ts
 *   ../../../tests/setup → src/tests/setup.ts
 */

import { describe, it, expect, vi } from "vitest";
import { MockWorker } from "../../../tests/setup";
import { FIELDSHIELD_PATTERNS } from "../../patterns";

// ─── Helper ───────────────────────────────────────────────────────────────────

function createWorker(): MockWorker {
  const w = new MockWorker();
  w.postMessage({
    type: "CONFIG",
    payload: {
      defaultPatterns: FIELDSHIELD_PATTERNS,
      customPatterns: {},
    },
  });
  return w;
}

function processAndCapture(
  worker: MockWorker,
  text: string,
): Promise<{ masked: string; findings: string[] }> {
  return new Promise((resolve) => {
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === "UPDATE") resolve(e.data);
    };
    worker.postMessage({ type: "PROCESS", payload: { text } });
  });
}

// ─── CONFIG ───────────────────────────────────────────────────────────────────

describe("Worker CONFIG message", () => {
  it("accepts built-in patterns without error", () => {
    expect(() => createWorker()).not.toThrow();
  });

  it("accepts custom patterns", () => {
    const w = new MockWorker();
    expect(() =>
      w.postMessage({
        type: "CONFIG",
        payload: {
          defaultPatterns: {},
          customPatterns: { MY_PATTERN: "\\bTEST\\b" },
        },
      }),
    ).not.toThrow();
  });

  it("skips invalid regex patterns without crashing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = new MockWorker();
    expect(() =>
      w.postMessage({
        type: "CONFIG",
        payload: {
          defaultPatterns: { BAD: "[[invalid" },
          customPatterns: {},
        },
      }),
    ).not.toThrow();
    warn.mockRestore();
  });

  it("custom patterns override defaults with same key", async () => {
    const w = new MockWorker();
    w.postMessage({
      type: "CONFIG",
      payload: {
        defaultPatterns: { SSN: "\\b\\d{3}-\\d{2}-\\d{4}\\b" },
        customPatterns: { SSN: "OVERRIDE" },
      },
    });
    const result = await processAndCapture(w, "OVERRIDE this text");
    expect(result.findings).toContain("SSN");
  });
});

// ─── PROCESS — masking ────────────────────────────────────────────────────────

describe("Worker PROCESS message — masking", () => {
  it("replaces SSN with █ characters 1:1", async () => {
    const w = createWorker();
    const { masked } = await processAndCapture(w, "123-45-6789");
    expect(masked).toBe("███████████");
    expect(masked.length).toBe("123-45-6789".length);
  });

  it("preserves non-sensitive text surrounding SSN", async () => {
    const w = createWorker();
    const { masked } = await processAndCapture(w, "SSN: 123-45-6789 end");
    expect(masked).toContain("SSN: ");
    expect(masked).toContain(" end");
    expect(masked).toContain("█");
  });

  it("masked string is always the same length as input", async () => {
    const w = createWorker();
    const inputs = [
      "user@example.com",
      "123-45-6789",
      "4111 1111 1111 1111",
      "hello world",
      "",
    ];
    for (const input of inputs) {
      const { masked } = await processAndCapture(w, input);
      expect(masked.length).toBe(input.length);
    }
  });

  it("internalTruth is NOT included in UPDATE response", async () => {
    const w = createWorker();
    const result = await processAndCapture(w, "123-45-6789");
    expect(result).not.toHaveProperty("text");
    expect(result).not.toHaveProperty("truth");
    expect(result).not.toHaveProperty("realValue");
  });

  it("returns empty masked and no findings for empty input", async () => {
    const w = createWorker();
    const { masked, findings } = await processAndCapture(w, "");
    expect(masked).toBe("");
    expect(findings).toHaveLength(0);
  });

  it("returns clean text unchanged when no pattern matches", async () => {
    const w = createWorker();
    const input = "hello world no sensitive data here";
    const { masked, findings } = await processAndCapture(w, input);
    expect(masked).toBe(input);
    expect(findings).toHaveLength(0);
  });

  it("handles multiple sensitive patterns in same input", async () => {
    const w = createWorker();
    const { findings } = await processAndCapture(
      w,
      "SSN: 123-45-6789 email: user@example.com",
    );
    expect(findings).toContain("SSN");
    expect(findings).toContain("EMAIL");
  });

  it("deduplicates findings when a pattern matches multiple times", async () => {
    const w = createWorker();
    const { findings } = await processAndCapture(
      w,
      "user@a.com and other@b.com",
    );
    const emailCount = findings.filter((f) => f === "EMAIL").length;
    expect(emailCount).toBe(1);
  });
});

// ─── PROCESS — findings accuracy per pattern ─────────────────────────────────

describe("Worker PROCESS message — per-pattern detection", () => {
  it.each([
    ["SSN", "123-45-6789"],
    ["EMAIL", "user@example.com"],
    ["PHONE", "555-123-4567"],
    ["CREDIT_CARD", "4111111111111111"],
    ["IBAN", "GB82WEST12345698765432"],
    ["PASSPORT_NUMBER", "A12345678"],
    ["DATE_OF_BIRTH", "01/15/1990"],
    ["TAX_ID", "12-3456789"],
    ["AI_API_KEY", "sk-abcdefghijklmnopqrstu1234"],
    ["AWS_ACCESS_KEY", "AKIAIOSFODNN7EXAMPLE"],
    ["GITHUB_TOKEN", "ghp_abc123def456ghi789jkl012mno345"],
    ["STRIPE_KEY", "sk_live_abc123def456ghi789jkl012mno"],
    ["JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig"],
    ["PRIVATE_KEY_BLOCK", "-----BEGIN PRIVATE KEY-----"],
  ] as [string, string][])("detects %s", async (patternName, input) => {
    const w = createWorker();
    const { findings } = await processAndCapture(w, input);
    expect(findings).toContain(patternName);
  });
});

// ─── GET_TRUTH ────────────────────────────────────────────────────────────────

describe("Worker GET_TRUTH message", () => {
  it("returns the real value via MessagePort", async () => {
    const w = createWorker();
    await processAndCapture(w, "hello world");

    const value = await new Promise<string>((resolve) => {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = (e) => resolve(e.data.text);
      w.postMessage({ type: "GET_TRUTH" }, [port2]);
    });

    expect(value).toBe("hello world");
  });

  it("returns the latest value after multiple PROCESS calls", async () => {
    const w = createWorker();
    await processAndCapture(w, "first");
    await processAndCapture(w, "second");
    await processAndCapture(w, "third");

    const value = await new Promise<string>((resolve) => {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = (e) => resolve(e.data.text);
      w.postMessage({ type: "GET_TRUTH" }, [port2]);
    });

    expect(value).toBe("third");
  });

  it("returns empty string before any PROCESS call", async () => {
    const w = createWorker();

    const value = await new Promise<string>((resolve) => {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = (e) => resolve(e.data.text);
      w.postMessage({ type: "GET_TRUTH" }, [port2]);
    });

    expect(value).toBe("");
  });

  it("does not crash when GET_TRUTH is received with no port", () => {
    const w = createWorker();
    expect(() => w.postMessage({ type: "GET_TRUTH" })).not.toThrow();
  });

  it("logs console.warn when GET_TRUTH is received with no port", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = createWorker();
    w.postMessage({ type: "GET_TRUTH" }); // no transfer array
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("GET_TRUTH"),
    );
    warn.mockRestore();
  });
});

// ─── PURGE ────────────────────────────────────────────────────────────────────

describe("Worker PURGE message", () => {
  it("zeros internalTruth after PURGE", async () => {
    const w = createWorker();
    await processAndCapture(w, "123-45-6789");

    await new Promise<void>((resolve) => {
      w.onmessage = (e) => {
        if (e.data.type === "PURGED") resolve();
      };
      w.postMessage({ type: "PURGE" });
    });

    const value = await new Promise<string>((resolve) => {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = (e) => resolve(e.data.text);
      w.postMessage({ type: "GET_TRUTH" }, [port2]);
    });

    expect(value).toBe("");
  });

  it("emits PURGED confirmation message", async () => {
    const w = createWorker();
    const messages: string[] = [];

    await new Promise<void>((resolve) => {
      w.onmessage = (e) => {
        messages.push(e.data.type);
        if (e.data.type === "PURGED") resolve();
      };
      w.postMessage({ type: "PURGE" });
    });

    expect(messages).toContain("PURGED");
  });
});

// ─── onerror handler ─────────────────────────────────────────────────────────

describe("Worker onerror handler", () => {
  it("invokes onerror when worker fires an error event", () => {
    const w = createWorker();
    const handler = vi.fn();
    w.onerror = handler;
    w.simulateError("test error");
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0]).toBeInstanceOf(ErrorEvent);
  });
});

// ─── Unknown message type ─────────────────────────────────────────────────────

describe("Worker — unknown message type", () => {
  it("does not throw for an unrecognized message type", () => {
    const w = createWorker();
    expect(() =>
      w.postMessage({ type: "UNKNOWN_TYPE_XYZ" } as never),
    ).not.toThrow();
  });

  it("logs a console.warn for an unrecognized message type", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = createWorker();
    w.postMessage({ type: "UNKNOWN_TYPE_XYZ" } as never);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("unknown message type"),
    );
    warn.mockRestore();
  });
});

// ─── terminate ───────────────────────────────────────────────────────────────

describe("Worker terminate", () => {
  it("silently ignores postMessage after terminate", () => {
    const w = createWorker();
    const handler = vi.fn();
    w.onmessage = handler;
    w.terminate();
    w.postMessage({ type: "PROCESS", payload: { text: "test" } });
    expect(handler).not.toHaveBeenCalled();
  });
});

// ─── Custom patterns ─────────────────────────────────────────────────────────

describe("Worker custom patterns", () => {
  it("detects a custom pattern alongside defaults", async () => {
    const w = new MockWorker();
    w.postMessage({
      type: "CONFIG",
      payload: {
        defaultPatterns: FIELDSHIELD_PATTERNS,
        customPatterns: { CUSTOM_ID: "\\bID-\\d{6}\\b" },
      },
    });
    const { findings } = await processAndCapture(w, "ID-123456");
    expect(findings).toContain("CUSTOM_ID");
  });

  it("masks custom pattern spans correctly", async () => {
    const w = new MockWorker();
    w.postMessage({
      type: "CONFIG",
      payload: {
        defaultPatterns: {},
        customPatterns: { CODE: "SECRET" },
      },
    });
    const { masked } = await processAndCapture(w, "my SECRET code");
    expect(masked).toBe("my ██████ code");
  });
});
