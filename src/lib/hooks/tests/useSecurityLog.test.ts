/**
 * @file useSecurityLog.test.ts
 * @location src/lib/hooks/tests/useSecurityLog.test.ts
 *
 * Import paths:
 *   ../useSecurityLog     → src/lib/hooks/useSecurityLog.ts
 *   ../../components/...  → src/lib/components/FieldShieldInput.tsx
 */

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSecurityLog } from "../useSecurityLog";
import type { SensitiveClipboardEvent } from "../../components/FieldShieldInput";

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeClipboardEvent(
  overrides: Partial<SensitiveClipboardEvent> = {},
): SensitiveClipboardEvent {
  return {
    timestamp: new Date().toISOString(),
    fieldLabel: "SSN",
    findings: ["SSN"],
    masked: "███████████",
    eventType: "copy",
    ...overrides,
  };
}

// ─── pushEvent ────────────────────────────────────────────────────────────────

describe("useSecurityLog — pushEvent", () => {
  it("starts with empty events", () => {
    const { result } = renderHook(() => useSecurityLog());
    expect(result.current.events).toHaveLength(0);
  });

  it("adds an event to the log", () => {
    const { result } = renderHook(() => useSecurityLog());
    act(() => {
      result.current.pushEvent({
        field: "SSN",
        type: "COPY_BLOCKED",
        findings: ["SSN"],
      });
    });
    expect(result.current.events).toHaveLength(1);
  });

  it("assigns sequential IDs starting at 1", () => {
    const { result } = renderHook(() => useSecurityLog());
    act(() => {
      result.current.pushEvent({
        field: "f1",
        type: "COPY_BLOCKED",
        findings: [],
      });
      result.current.pushEvent({
        field: "f2",
        type: "COPY_BLOCKED",
        findings: [],
      });
      result.current.pushEvent({
        field: "f3",
        type: "COPY_BLOCKED",
        findings: [],
      });
    });
    // newest-first, so IDs are [3, 2, 1]
    expect(result.current.events.map((e) => e.id)).toEqual([3, 2, 1]);
  });

  it("all IDs are unique across many events", () => {
    const { result } = renderHook(() => useSecurityLog());
    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.pushEvent({ field: "f", type: "CUSTOM", findings: [] });
      }
    });
    const ids = result.current.events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("prepends new events — newest is at index 0", () => {
    const { result } = renderHook(() => useSecurityLog());
    act(() => {
      result.current.pushEvent({
        field: "first",
        type: "COPY_BLOCKED",
        findings: [],
      });
      result.current.pushEvent({
        field: "second",
        type: "COPY_BLOCKED",
        findings: [],
      });
    });
    expect(result.current.events[0].field).toBe("second");
    expect(result.current.events[1].field).toBe("first");
  });

  it("stamps a non-empty timestamp on each event", () => {
    const { result } = renderHook(() => useSecurityLog());
    act(() => {
      result.current.pushEvent({ field: "f", type: "CUSTOM", findings: [] });
    });
    expect(result.current.events[0].timestamp).toBeTruthy();
    expect(typeof result.current.events[0].timestamp).toBe("string");
  });

  it("preserves all fields passed to pushEvent", () => {
    const { result } = renderHook(() => useSecurityLog());
    act(() => {
      result.current.pushEvent({
        field: "Patient ID",
        type: "PASTE_DETECTED",
        findings: ["SSN", "EMAIL"],
        detail: "custom detail",
      });
    });
    const ev = result.current.events[0];
    expect(ev.field).toBe("Patient ID");
    expect(ev.type).toBe("PASTE_DETECTED");
    expect(ev.findings).toEqual(["SSN", "EMAIL"]);
    expect(ev.detail).toBe("custom detail");
  });
});

// ─── maxEvents ────────────────────────────────────────────────────────────────

describe("useSecurityLog — maxEvents", () => {
  it("defaults to 20 events max", () => {
    const { result } = renderHook(() => useSecurityLog());
    act(() => {
      for (let i = 0; i < 25; i++) {
        result.current.pushEvent({
          field: `f${i}`,
          type: "CUSTOM",
          findings: [],
        });
      }
    });
    expect(result.current.events).toHaveLength(20);
  });

  it("respects a custom maxEvents option", () => {
    const { result } = renderHook(() => useSecurityLog({ maxEvents: 5 }));
    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.pushEvent({
          field: `f${i}`,
          type: "CUSTOM",
          findings: [],
        });
      }
    });
    expect(result.current.events).toHaveLength(5);
  });

  it("drops the oldest event when the cap is exceeded", () => {
    const { result } = renderHook(() => useSecurityLog({ maxEvents: 3 }));
    act(() => {
      result.current.pushEvent({
        field: "first",
        type: "CUSTOM",
        findings: [],
      });
      result.current.pushEvent({
        field: "second",
        type: "CUSTOM",
        findings: [],
      });
      result.current.pushEvent({
        field: "third",
        type: "CUSTOM",
        findings: [],
      });
      result.current.pushEvent({
        field: "fourth",
        type: "CUSTOM",
        findings: [],
      });
    });
    const fields = result.current.events.map((e) => e.field);
    expect(fields).not.toContain("first");
    expect(fields).toContain("fourth");
    expect(fields).toContain("third");
    expect(fields).toContain("second");
  });

  it("maxEvents: 1 keeps only the most recent event", () => {
    const { result } = renderHook(() => useSecurityLog({ maxEvents: 1 }));
    act(() => {
      result.current.pushEvent({ field: "a", type: "CUSTOM", findings: [] });
      result.current.pushEvent({ field: "b", type: "CUSTOM", findings: [] });
    });
    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].field).toBe("b");
  });
});

// ─── makeClipboardHandler ─────────────────────────────────────────────────────

describe("useSecurityLog — makeClipboardHandler", () => {
  it("maps copy eventType → COPY_BLOCKED", () => {
    const { result } = renderHook(() => useSecurityLog());
    act(() => {
      result.current.makeClipboardHandler("copy_cut")(
        makeClipboardEvent({ eventType: "copy" }),
      );
    });
    expect(result.current.events[0].type).toBe("COPY_BLOCKED");
  });

  it("maps cut eventType → CUT_BLOCKED", () => {
    const { result } = renderHook(() => useSecurityLog());
    act(() => {
      result.current.makeClipboardHandler("copy_cut")(
        makeClipboardEvent({ eventType: "cut" }),
      );
    });
    expect(result.current.events[0].type).toBe("CUT_BLOCKED");
  });

  it("maps paste context → PASTE_DETECTED", () => {
    const { result } = renderHook(() => useSecurityLog());
    act(() => {
      result.current.makeClipboardHandler("paste")(
        makeClipboardEvent({ eventType: "paste" }),
      );
    });
    expect(result.current.events[0].type).toBe("PASTE_DETECTED");
  });

  it("uses fieldLabel as event field", () => {
    const { result } = renderHook(() => useSecurityLog());
    act(() => {
      result.current.makeClipboardHandler("copy_cut")(
        makeClipboardEvent({ fieldLabel: "Credit Card" }),
      );
    });
    expect(result.current.events[0].field).toBe("Credit Card");
  });

  it("propagates findings array", () => {
    const { result } = renderHook(() => useSecurityLog());
    act(() => {
      result.current.makeClipboardHandler("copy_cut")(
        makeClipboardEvent({ findings: ["SSN", "PHONE"] }),
      );
    });
    expect(result.current.events[0].findings).toEqual(["SSN", "PHONE"]);
  });

  it("truncates detail to 32 chars with ellipsis for long masked values", () => {
    const { result } = renderHook(() => useSecurityLog());
    act(() => {
      result.current.makeClipboardHandler("copy_cut")(
        makeClipboardEvent({ masked: "█".repeat(50) }),
      );
    });
    const detail = result.current.events[0].detail!;
    expect(detail.length).toBeLessThanOrEqual(33); // 32 chars + "…"
    expect(detail.endsWith("…")).toBe(true);
  });

  it("does not add ellipsis when masked is 32 chars or fewer", () => {
    const { result } = renderHook(() => useSecurityLog());
    const shortMasked = "█".repeat(10);
    act(() => {
      result.current.makeClipboardHandler("copy_cut")(
        makeClipboardEvent({ masked: shortMasked }),
      );
    });
    expect(result.current.events[0].detail).toBe(shortMasked);
  });
});

// ─── clearLog ─────────────────────────────────────────────────────────────────

describe("useSecurityLog — clearLog", () => {
  it("empties the events array", () => {
    const { result } = renderHook(() => useSecurityLog());
    act(() => {
      result.current.pushEvent({ field: "f", type: "CUSTOM", findings: [] });
      result.current.pushEvent({ field: "f", type: "CUSTOM", findings: [] });
      result.current.clearLog();
    });
    expect(result.current.events).toHaveLength(0);
  });

  it("resets the ID counter — first event after clear gets ID 1", () => {
    const { result } = renderHook(() => useSecurityLog());
    act(() => {
      result.current.pushEvent({ field: "f", type: "CUSTOM", findings: [] });
      result.current.pushEvent({ field: "f", type: "CUSTOM", findings: [] });
      result.current.clearLog();
      result.current.pushEvent({ field: "f", type: "CUSTOM", findings: [] });
    });
    expect(result.current.events[0].id).toBe(1);
  });
});

// ─── StrictMode double-invocation safety ──────────────────────────────────────

describe("useSecurityLog — StrictMode safety", () => {
  it("does not produce duplicate entries for a single pushEvent call", () => {
    const { result } = renderHook(() => useSecurityLog());
    act(() => {
      result.current.pushEvent({
        field: "f",
        type: "COPY_BLOCKED",
        findings: [],
      });
    });
    // Under the old buggy implementation (setEvents nested in setCounter updater)
    // StrictMode would double-invoke the updater and produce 2 entries.
    expect(result.current.events).toHaveLength(1);
  });

  it("produces exactly N entries for N pushEvent calls", () => {
    const { result } = renderHook(() => useSecurityLog());
    act(() => {
      result.current.pushEvent({
        field: "f1",
        type: "COPY_BLOCKED",
        findings: [],
      });
      result.current.pushEvent({
        field: "f2",
        type: "CUT_BLOCKED",
        findings: [],
      });
      result.current.pushEvent({
        field: "f3",
        type: "PASTE_DETECTED",
        findings: [],
      });
    });
    expect(result.current.events).toHaveLength(3);
  });
});

// ─── Callback referential stability ───────────────────────────────────────────

describe("useSecurityLog — callback stability", () => {
  it("pushEvent reference is stable across re-renders", () => {
    const { result, rerender } = renderHook(() => useSecurityLog());
    const first = result.current.pushEvent;
    rerender();
    expect(result.current.pushEvent).toBe(first);
  });

  it("clearLog reference is stable across re-renders", () => {
    const { result, rerender } = renderHook(() => useSecurityLog());
    const first = result.current.clearLog;
    rerender();
    expect(result.current.clearLog).toBe(first);
  });

  it("makeClipboardHandler reference is stable across re-renders", () => {
    const { result, rerender } = renderHook(() => useSecurityLog());
    const first = result.current.makeClipboardHandler;
    rerender();
    expect(result.current.makeClipboardHandler).toBe(first);
  });
});

// ─── All SecurityEventType values ─────────────────────────────────────────────

describe("useSecurityLog — all SecurityEventType values", () => {
  it.each([
    "COPY_BLOCKED",
    "CUT_BLOCKED",
    "PASTE_DETECTED",
    "SUBMIT",
    "PURGE",
    "CUSTOM",
  ] as const)("accepts type=%s", (type) => {
    const { result } = renderHook(() => useSecurityLog());
    act(() => {
      result.current.pushEvent({ field: "f", type, findings: [] });
    });
    expect(result.current.events[0].type).toBe(type);
  });
});
