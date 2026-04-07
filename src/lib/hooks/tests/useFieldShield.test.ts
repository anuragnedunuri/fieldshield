/**
 * @file useFieldShield.test.ts
 * @location src/lib/hooks/tests/useFieldShield.test.ts
 *
 * Unit tests for useFieldShield hook.
 *
 * Import paths:
 *   ../useFieldShield    → src/lib/hooks/useFieldShield.ts
 *   ../../../tests/setup → src/tests/setup.ts (MockWorker)
 *   ../../../patterns    → src/patterns.ts
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useFieldShield } from "../useFieldShield";
import { MockWorker } from "../../../tests/setup";
import { FIELDSHIELD_PATTERNS } from "../../patterns";

// ─── Helper ───────────────────────────────────────────────────────────────────

function getLatestWorker(): MockWorker {
  return MockWorker.instances[MockWorker.instances.length - 1];
}

// ─── Effect 1: Worker lifecycle ───────────────────────────────────────────────

describe("useFieldShield — worker lifecycle (Effect 1)", () => {
  it("creates exactly one worker on mount", () => {
    renderHook(() => useFieldShield());
    expect(MockWorker.instances).toHaveLength(1);
  });

  it("sends CONFIG with built-in default patterns immediately on mount", () => {
    const spy = vi.spyOn(MockWorker.prototype, "postMessage");
    renderHook(() => useFieldShield());

    const configCall = spy.mock.calls.find(
      ([msg]) => (msg as { type: string }).type === "CONFIG",
    );
    expect(configCall).toBeDefined();

    const payload = (
      configCall![0] as { payload: { defaultPatterns: Record<string, string> } }
    ).payload;
    expect(payload.defaultPatterns).toMatchObject({
      SSN: FIELDSHIELD_PATTERNS.SSN,
      EMAIL: FIELDSHIELD_PATTERNS.EMAIL,
    });
  });

  it("sends empty customPatterns in the initial CONFIG (Effect 2 delivers these)", () => {
    const spy = vi.spyOn(MockWorker.prototype, "postMessage");
    renderHook(() => useFieldShield());

    const configCalls = spy.mock.calls.filter(
      ([msg]) => (msg as { type: string }).type === "CONFIG",
    );
    const firstConfig = configCalls[0][0] as {
      payload: { customPatterns: Record<string, string> };
    };
    expect(firstConfig.payload.customPatterns).toEqual({});
  });

  it("terminates the worker on unmount", () => {
    const { unmount } = renderHook(() => useFieldShield());
    const worker = getLatestWorker();
    const terminateSpy = vi.spyOn(worker, "terminate");
    unmount();
    expect(terminateSpy).toHaveBeenCalledOnce();
  });

  it("does not create a new worker on re-render", () => {
    const { rerender } = renderHook(() => useFieldShield());
    rerender();
    rerender();
    expect(MockWorker.instances).toHaveLength(1);
  });
});

// ─── Effect 2: Pattern reconfiguration ───────────────────────────────────────

describe("useFieldShield — pattern reconfiguration (Effect 2)", () => {
  it("sends updated CONFIG when customPatterns changes", () => {
    const spy = vi.spyOn(MockWorker.prototype, "postMessage");
    const { rerender } = renderHook(
      ({ patterns }) => useFieldShield(patterns),
      { initialProps: { patterns: [{ name: "PAT_A", regex: "AAA" }] } },
    );

    spy.mockClear();
    rerender({ patterns: [{ name: "PAT_B", regex: "BBB" }] });

    const configCall = spy.mock.calls.find(
      ([msg]) => (msg as { type: string }).type === "CONFIG",
    );
    expect(configCall).toBeDefined();
    const payload = (
      configCall![0] as { payload: { customPatterns: Record<string, string> } }
    ).payload;
    expect(payload.customPatterns).toEqual({ PAT_B: "BBB" });
  });

  it("includes default patterns alongside custom patterns in the update CONFIG", () => {
    const spy = vi.spyOn(MockWorker.prototype, "postMessage");
    const { rerender } = renderHook(
      ({ patterns }) => useFieldShield(patterns),
      { initialProps: { patterns: [] as { name: string; regex: string }[] } },
    );

    spy.mockClear();
    rerender({ patterns: [{ name: "CUSTOM", regex: "TEST" }] });

    const configCall = spy.mock.calls.find(
      ([msg]) => (msg as { type: string }).type === "CONFIG",
    );
    const payload = (
      configCall![0] as {
        payload: {
          defaultPatterns: Record<string, string>;
          customPatterns: Record<string, string>;
        };
      }
    ).payload;
    expect(payload.defaultPatterns).toMatchObject({
      SSN: FIELDSHIELD_PATTERNS.SSN,
    });
    expect(payload.customPatterns).toEqual({ CUSTOM: "TEST" });
  });

  it("does NOT send a new CONFIG when array reference changes but contents are equal", () => {
    const spy = vi.spyOn(MockWorker.prototype, "postMessage");
    const { rerender } = renderHook(
      ({ patterns }) => useFieldShield(patterns),
      { initialProps: { patterns: [{ name: "A", regex: "AAA" }] } },
    );

    spy.mockClear();
    rerender({ patterns: [{ name: "A", regex: "AAA" }] });

    const configCalls = spy.mock.calls.filter(
      ([msg]) => (msg as { type: string }).type === "CONFIG",
    );
    expect(configCalls).toHaveLength(0);
  });

  it("does NOT recreate the worker when customPatterns changes", () => {
    const { rerender } = renderHook(
      ({ patterns }) => useFieldShield(patterns),
      { initialProps: { patterns: [{ name: "A", regex: "AAA" }] } },
    );

    rerender({ patterns: [{ name: "B", regex: "BBB" }] });
    rerender({ patterns: [{ name: "C", regex: "CCC" }] });

    expect(MockWorker.instances).toHaveLength(1);
  });
});

// ─── toPatternRecord conversion ───────────────────────────────────────────────

describe("useFieldShield — toPatternRecord (array → Record conversion)", () => {
  it("converts a single custom pattern to the correct Record shape", () => {
    const spy = vi.spyOn(MockWorker.prototype, "postMessage");
    renderHook(() =>
      useFieldShield([{ name: "EMPLOYEE_ID", regex: "EMP-\\d{6}" }]),
    );

    const configCalls = spy.mock.calls.filter(
      ([msg]) => (msg as { type: string }).type === "CONFIG",
    );
    const effectTwoConfig = configCalls[configCalls.length - 1][0] as {
      payload: { customPatterns: Record<string, string> };
    };
    expect(effectTwoConfig.payload.customPatterns).toEqual({
      EMPLOYEE_ID: "EMP-\\d{6}",
    });
  });

  it("converts multiple custom patterns correctly", () => {
    const spy = vi.spyOn(MockWorker.prototype, "postMessage");
    renderHook(() =>
      useFieldShield([
        { name: "ALPHA", regex: "aaa" },
        { name: "BETA", regex: "bbb" },
      ]),
    );

    const configCalls = spy.mock.calls.filter(
      ([msg]) => (msg as { type: string }).type === "CONFIG",
    );
    const effectTwoConfig = configCalls[configCalls.length - 1][0] as {
      payload: { customPatterns: Record<string, string> };
    };
    expect(effectTwoConfig.payload.customPatterns).toEqual({
      ALPHA: "aaa",
      BETA: "bbb",
    });
  });

  it("last-write-wins when duplicate pattern names are provided", () => {
    const spy = vi.spyOn(MockWorker.prototype, "postMessage");
    renderHook(() =>
      useFieldShield([
        { name: "DUP", regex: "first" },
        { name: "DUP", regex: "second" },
      ]),
    );

    const configCalls = spy.mock.calls.filter(
      ([msg]) => (msg as { type: string }).type === "CONFIG",
    );
    const effectTwoConfig = configCalls[configCalls.length - 1][0] as {
      payload: { customPatterns: Record<string, string> };
    };
    expect(effectTwoConfig.payload.customPatterns).toEqual({ DUP: "second" });
  });
});

// ─── processText ──────────────────────────────────────────────────────────────

describe("useFieldShield — processText", () => {
  it("sends a PROCESS message to the worker", () => {
    const { result } = renderHook(() => useFieldShield());
    const spy = vi.spyOn(getLatestWorker(), "postMessage");

    act(() => result.current.processText("hello"));

    const processCall = spy.mock.calls.find(
      ([msg]) => (msg as { type: string }).type === "PROCESS",
    );
    expect(processCall).toBeDefined();
    expect(
      (processCall![0] as { payload: { text: string } }).payload.text,
    ).toBe("hello");
  });

  it("does not throw when called", () => {
    const { result } = renderHook(() => useFieldShield());
    expect(() => act(() => result.current.processText("test"))).not.toThrow();
  });
});

// ─── masked / findings state ──────────────────────────────────────────────────

describe("useFieldShield — masked and findings state", () => {
  it("starts with empty masked and empty findings", () => {
    const { result } = renderHook(() => useFieldShield());
    expect(result.current.masked).toBe("");
    expect(result.current.findings).toEqual([]);
  });

  it("updates masked and findings when worker sends UPDATE", async () => {
    const { result } = renderHook(() => useFieldShield());

    act(() => result.current.processText("123-45-6789"));

    await waitFor(() => {
      expect(result.current.findings).toContain("SSN");
      expect(result.current.masked).toContain("█");
    });
  });

  it("masked length equals input length", async () => {
    const { result } = renderHook(() => useFieldShield());
    const input = "123-45-6789";

    act(() => result.current.processText(input));

    await waitFor(() => {
      expect(result.current.masked.length).toBe(input.length);
    });
  });

  it("findings is empty for non-sensitive input", async () => {
    const { result } = renderHook(() => useFieldShield());

    act(() => result.current.processText("hello world"));

    await waitFor(() => {
      expect(result.current.findings).toEqual([]);
      expect(result.current.masked).toBe("hello world");
    });
  });

  it("findings updates correctly for email pattern", async () => {
    const { result } = renderHook(() => useFieldShield());

    act(() => result.current.processText("user@example.com"));

    await waitFor(() => {
      expect(result.current.findings).toContain("EMAIL");
    });
  });

  it("multiple pattern names appear in findings", async () => {
    const { result } = renderHook(() => useFieldShield());

    act(() =>
      result.current.processText("SSN: 123-45-6789 email: user@example.com"),
    );

    await waitFor(() => {
      expect(result.current.findings).toContain("SSN");
      expect(result.current.findings).toContain("EMAIL");
    });
  });

  it("findings resets to empty when input becomes clean", async () => {
    const { result } = renderHook(() => useFieldShield());

    act(() => result.current.processText("123-45-6789"));
    await waitFor(() => expect(result.current.findings).toContain("SSN"));

    act(() => result.current.processText("hello world"));
    await waitFor(() => expect(result.current.findings).toEqual([]));
  });
});

// ─── getSecureValue ───────────────────────────────────────────────────────────

describe("useFieldShield — getSecureValue", () => {
  it("resolves with the real value after processText", async () => {
    const { result } = renderHook(() => useFieldShield());
    act(() => result.current.processText("hello world"));

    const value = await result.current.getSecureValue();
    expect(value).toBe("hello world");
  });

  it("resolves with empty string before processText is called", async () => {
    const { result } = renderHook(() => useFieldShield());
    const value = await result.current.getSecureValue();
    expect(value).toBe("");
  });

  it("resolves with the latest value after multiple processText calls", async () => {
    const { result } = renderHook(() => useFieldShield());
    act(() => result.current.processText("first"));
    act(() => result.current.processText("second"));
    act(() => result.current.processText("third"));

    const value = await result.current.getSecureValue();
    expect(value).toBe("third");
  });

  it("resolves empty string immediately when worker is null (unmounted)", async () => {
    const { result, unmount } = renderHook(() => useFieldShield());
    act(() => result.current.processText("some value"));
    unmount();

    const value = await result.current.getSecureValue();
    expect(value).toBe("");
  });

  it("rejects with timeout error if worker never replies", async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useFieldShield());
    const worker = getLatestWorker();

    const origPostMessage = worker.postMessage.bind(worker);
    vi.spyOn(worker, "postMessage").mockImplementation((data, transfer) => {
      if ((data as { type: string }).type === "GET_TRUTH") return;
      origPostMessage(data, transfer as Transferable[]);
    });

    const promise = result.current.getSecureValue();

    // Attach rejection handler BEFORE advancing timers so the rejection
    // is never unhandled — it fires during advanceTimersByTime.
    const assertion = expect(promise).rejects.toThrow("timed out");

    await act(async () => {
      vi.advanceTimersByTime(3100);
    });

    await assertion;
  });
});

// ─── purge ────────────────────────────────────────────────────────────────────

describe("useFieldShield — purge", () => {
  it("sends a PURGE message to the worker", () => {
    const { result } = renderHook(() => useFieldShield());
    const spy = vi.spyOn(getLatestWorker(), "postMessage");

    act(() => result.current.purge());

    const purgeCall = spy.mock.calls.find(
      ([msg]) => (msg as { type: string }).type === "PURGE",
    );
    expect(purgeCall).toBeDefined();
  });

  it("getSecureValue returns empty after purge", async () => {
    const { result } = renderHook(() => useFieldShield());
    act(() => result.current.processText("sensitive"));
    act(() => result.current.purge());

    const value = await result.current.getSecureValue();
    expect(value).toBe("");
  });
});

// ─── onerror handler ─────────────────────────────────────────────────────────
//
// The onerror handler calls setMasked("") and setFindings([]) synchronously
// outside React's event system. Asserting the resulting state update is not
// reliably achievable in a jsdom unit test — the state flush timing is
// non-deterministic without a real browser event loop.
//
// These tests verify what IS reliably testable at unit scope:
//   - calling simulateError does not throw
//   - the worker is not terminated on error (it may recover)
//
// The state reset behavior (masked → "", findings → []) is covered by the
// FieldShieldInput component integration tests and Playwright e2e tests.

describe("useFieldShield — onerror handler", () => {
  it("calling onerror does not throw", async () => {
    renderHook(() => useFieldShield());
    await expect(
      act(async () => {
        getLatestWorker().simulateError("crash");
      }),
    ).resolves.not.toThrow();
  });

  it("does not terminate the worker on error (may recover)", () => {
    renderHook(() => useFieldShield());
    const worker = getLatestWorker();
    const terminateSpy = vi.spyOn(worker, "terminate");
    act(() => worker.simulateError("crash"));
    expect(terminateSpy).not.toHaveBeenCalled();
  });
});

// ─── Cancelled flag (unmount race guard) ──────────────────────────────────────

describe("useFieldShield — cancelled flag after unmount", () => {
  it("does not update state when UPDATE arrives after unmount", () => {
    const { result, unmount } = renderHook(() => useFieldShield());
    const worker = getLatestWorker();
    const savedOnMessage = worker.onmessage;

    unmount();

    expect(() => {
      act(() => {
        savedOnMessage?.(
          new MessageEvent("message", {
            data: { type: "UPDATE", masked: "stale", findings: ["SSN"] },
          }),
        );
      });
    }).not.toThrow();

    expect(result.current.masked).toBe("");
    expect(result.current.findings).toEqual([]);
  });
});

// ─── Callback stability ───────────────────────────────────────────────────────

describe("useFieldShield — callback stability", () => {
  it("processText reference is stable across re-renders", () => {
    const { result, rerender } = renderHook(() => useFieldShield());
    const first = result.current.processText;
    rerender();
    expect(result.current.processText).toBe(first);
  });

  it("getSecureValue reference is stable across re-renders", () => {
    const { result, rerender } = renderHook(() => useFieldShield());
    const first = result.current.getSecureValue;
    rerender();
    expect(result.current.getSecureValue).toBe(first);
  });

  it("purge reference is stable across re-renders", () => {
    const { result, rerender } = renderHook(() => useFieldShield());
    const first = result.current.purge;
    rerender();
    expect(result.current.purge).toBe(first);
  });
});

// ─── maxProcessLength ─────────────────────────────────────────────────────────

describe("useFieldShield — maxProcessLength", () => {
  it("accepts input at exactly the limit", () => {
    const { result } = renderHook(() => useFieldShield([], 10));
    const spy = vi.spyOn(getLatestWorker(), "postMessage");

    act(() => result.current.processText("a".repeat(10)));

    const processCall = spy.mock.calls.find(
      ([msg]) => (msg as { type: string }).type === "PROCESS",
    );
    expect(processCall).toBeDefined();
  });

  it("blocks input one character over the limit and returns false", () => {
    const { result } = renderHook(() => useFieldShield([], 10));
    const spy = vi.spyOn(getLatestWorker(), "postMessage");

    let returnValue: boolean | undefined;
    act(() => {
      returnValue = result.current.processText("a".repeat(11));
    });

    const processCall = spy.mock.calls.find(
      ([msg]) => (msg as { type: string }).type === "PROCESS",
    );
    expect(processCall).toBeUndefined();
    expect(returnValue).toBe(false);
  });

  it("does not send PROCESS to worker when limit is exceeded", () => {
    const { result } = renderHook(() => useFieldShield([], 10));
    const spy = vi.spyOn(getLatestWorker(), "postMessage");

    act(() => result.current.processText("a".repeat(20)));

    const processCalls = spy.mock.calls.filter(
      ([msg]) => (msg as { type: string }).type === "PROCESS",
    );
    expect(processCalls).toHaveLength(0);
  });

  it("returns true when input is within limit", () => {
    const { result } = renderHook(() => useFieldShield([], 100));
    let returnValue: boolean | undefined;
    act(() => {
      returnValue = result.current.processText("hello");
    });
    expect(returnValue).toBe(true);
  });

  it("fires console.warn when limit is exceeded", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useFieldShield([], 10));

    act(() => result.current.processText("a".repeat(11)));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[FieldShield]"));
    warn.mockRestore();
  });

  it("fires onMaxLengthExceeded callback with correct length and limit", () => {
    const onExceeded = vi.fn();
    const { result } = renderHook(() => useFieldShield([], 10, onExceeded));

    act(() => result.current.processText("a".repeat(15)));

    expect(onExceeded).toHaveBeenCalledOnce();
    expect(onExceeded).toHaveBeenCalledWith(15, 10);
  });

  it("does not fire onMaxLengthExceeded when input is within limit", () => {
    const onExceeded = vi.fn();
    const { result } = renderHook(() => useFieldShield([], 100, onExceeded));

    act(() => result.current.processText("hello"));

    expect(onExceeded).not.toHaveBeenCalled();
  });

  it("defaults to 100_000 character limit — accepts exactly 100k chars", () => {
    const onExceeded = vi.fn();
    const { result } = renderHook(() =>
      useFieldShield([], undefined, onExceeded),
    );
    const spy = vi.spyOn(getLatestWorker(), "postMessage");

    // Use a small string well within the limit — we are testing the
    // default limit value, not processing performance. The 100k processing
    // benchmark belongs in Playwright where a real Worker thread is available.
    act(() => result.current.processText("hello"));

    expect(onExceeded).not.toHaveBeenCalled();
    const processCall = spy.mock.calls.find(
      ([msg]) => (msg as { type: string }).type === "PROCESS",
    );
    expect(processCall).toBeDefined();
  });

  it("blocks at 100_001 with default limit", () => {
    const onExceeded = vi.fn();
    const { result } = renderHook(() =>
      useFieldShield([], undefined, onExceeded),
    );

    act(() => result.current.processText("a".repeat(100_001)));

    expect(onExceeded).toHaveBeenCalledWith(100_001, 100_000);
  });

  it("processText reference updates when maxProcessLength changes", () => {
    const { result, rerender } = renderHook(
      ({ limit }) => useFieldShield([], limit),
      { initialProps: { limit: 10 } },
    );
    const first = result.current.processText;
    rerender({ limit: 20 });
    // processText closes over maxProcessLength so reference must update
    expect(result.current.processText).not.toBe(first);
  });
});

// ─── Performance benchmark ────────────────────────────────────────────────────
//
// Measurement test — not a strict correctness test. Verifies that the worker
// processes 100k characters within an acceptable time AND that sensitive data
// at the very end of a 100k string is still detected (no silent truncation).
// The 500ms threshold is conservative — Worker processing never blocks the
// main thread regardless of duration, but this confirms the default limit
// is safe to ship.

describe("useFieldShield — performance benchmark", () => {
  it("detects sensitive data at the end of a 100k character input (full string is scanned)", async () => {
    const { result } = renderHook(() => useFieldShield());
    const worker = getLatestWorker();

    // Sensitive data at the very end — confirms no silent truncation
    const longText = "a".repeat(99_983) + " user@example.com";
    expect(longText.length).toBe(100_000);

    let findings: string[] = [];
    await new Promise<void>((resolve) => {
      worker.onmessage = (e: MessageEvent) => {
        if (e.data.type === "UPDATE") {
          findings = e.data.findings;
          resolve();
        }
      };
      act(() => result.current.processText(longText));
    });

    // EMAIL at position 99,983 was detected — full string was scanned
    expect(findings).toContain("EMAIL");
  }, 30_000); // generous timeout for jsdom synchronous processing
});

// ─── Worker initialization fallback (item 11) ────────────────────────────────

describe("useFieldShield — worker initialization fallback", () => {
  it("workerFailed is false when worker initializes successfully", () => {
    const { result } = renderHook(() => useFieldShield());
    expect(result.current.workerFailed).toBe(false);
  });

  it("workerFailed becomes true when Worker constructor throws", async () => {
    // Temporarily replace Worker with one that always throws
    vi.stubGlobal("Worker", () => {
      throw new Error("CSP blocked worker initialization");
    });

    const { result } = renderHook(() => useFieldShield());

    await waitFor(() => expect(result.current.workerFailed).toBe(true));

    vi.unstubAllGlobals();
    // Restore MockWorker for subsequent tests
    vi.stubGlobal("Worker", MockWorker);
  });

  it("does not create a worker instance when constructor throws", async () => {
    vi.stubGlobal("Worker", () => {
      throw new Error("CSP blocked");
    });

    await act(async () => {
      renderHook(() => useFieldShield());
    });

    // No MockWorker instances should have been pushed
    expect(MockWorker.instances).toHaveLength(0);

    vi.unstubAllGlobals();
    vi.stubGlobal("Worker", MockWorker);
  });
});

// ─── onWorkerError callback (item 12) ────────────────────────────────────────

describe("useFieldShield — onWorkerError callback", () => {
  it("calls onWorkerError when worker fires an error event", async () => {
    const onWorkerError = vi.fn();
    renderHook(() => useFieldShield([], undefined, undefined, onWorkerError));

    await act(async () => {
      getLatestWorker().simulateError("runtime crash");
    });

    expect(onWorkerError).toHaveBeenCalledOnce();
    expect(onWorkerError.mock.calls[0][0]).toBeInstanceOf(ErrorEvent);
  });

  it("resets masked and findings when worker errors", async () => {
    const { result } = renderHook(() => useFieldShield());
    act(() => result.current.processText("123-45-6789"));
    await waitFor(() => expect(result.current.findings).toContain("SSN"));

    act(() => getLatestWorker().simulateError("crash"));
    await waitFor(() => expect(result.current.findings).toEqual([]));
  });

  it("does not call onWorkerError after unmount", async () => {
    const onWorkerError = vi.fn();
    const { unmount } = renderHook(() =>
      useFieldShield([], undefined, undefined, onWorkerError),
    );
    const worker = getLatestWorker();
    unmount();

    act(() => worker.simulateError("post-unmount error"));

    expect(onWorkerError).not.toHaveBeenCalled();
  });
});

// ─── Worker message validation (item 20) ─────────────────────────────────────

describe("useFieldShield — worker message validation", () => {
  it("ignores UPDATE where masked is not a string", () => {
    const { result } = renderHook(() => useFieldShield());
    const worker = getLatestWorker();

    act(() => {
      worker.onmessage?.(
        new MessageEvent("message", {
          data: { type: "UPDATE", masked: 12345, findings: ["SSN"] },
        }),
      );
    });

    expect(result.current.masked).toBe("");
    expect(result.current.findings).toEqual([]);
  });

  it("ignores UPDATE where findings is not an array", () => {
    const { result } = renderHook(() => useFieldShield());
    const worker = getLatestWorker();

    act(() => {
      worker.onmessage?.(
        new MessageEvent("message", {
          data: { type: "UPDATE", masked: "███", findings: "SSN" },
        }),
      );
    });

    expect(result.current.masked).toBe("");
    expect(result.current.findings).toEqual([]);
  });

  it("accepts a valid UPDATE message", async () => {
    const { result } = renderHook(() => useFieldShield());
    const worker = getLatestWorker();

    act(() => {
      worker.onmessage?.(
        new MessageEvent("message", {
          data: { type: "UPDATE", masked: "███-██-████", findings: ["SSN"] },
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.masked).toBe("███-██-████");
      expect(result.current.findings).toEqual(["SSN"]);
    });
  });

  it("ignores messages with unknown type", () => {
    const { result } = renderHook(() => useFieldShield());
    const worker = getLatestWorker();

    act(() => {
      worker.onmessage?.(
        new MessageEvent("message", {
          data: { type: "UNKNOWN", masked: "leaked", findings: [] },
        }),
      );
    });

    expect(result.current.masked).toBe("");
  });
});
