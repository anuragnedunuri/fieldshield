/**
 * @file setup.ts
 * @location src/tests/setup.ts
 *
 * Global test setup for FieldShield test suite.
 * Imported by vitest.config.ts via setupFiles.
 */

import "@testing-library/jest-dom";
import { vi, beforeEach, afterEach } from "vitest";

// ─── requestAnimationFrame ────────────────────────────────────────────────────

globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
  cb(performance.now());
  return 0;
};

globalThis.cancelAnimationFrame = vi.fn();

// ─── matchMedia ───────────────────────────────────────────────────────────────

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ─── ClipboardEvent polyfill ─────────────────────────────────────────────────
// jsdom does not implement ClipboardEvent. Polyfill it so fireClipboardEvent
// in component tests can construct one with clipboardData.

if (typeof ClipboardEvent === "undefined") {
  globalThis.ClipboardEvent = class ClipboardEvent extends Event {
    clipboardData: DataTransfer | null;
    constructor(type: string, options?: ClipboardEventInit) {
      super(type, options);
      this.clipboardData = (options?.clipboardData as DataTransfer) ?? null;
    }
  } as unknown as typeof ClipboardEvent;
}

// ─── Canvas stub ─────────────────────────────────────────────────────────────
// Silence jsdom HTMLCanvasElement warning — jsdom does not implement
// the Canvas API. FieldShield does not use canvas. This warning comes
// from testing dependencies that incidentally reference canvas.
HTMLCanvasElement.prototype.getContext = () => null;

// ─── MockWorker ───────────────────────────────────────────────────────────────

export class MockWorker {
  static instances: MockWorker[] = [];

  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;

  private defaultPatterns: Record<string, RegExp> = {};
  private userPatterns: Record<string, RegExp> = {};
  private internalTruth = "";
  private terminated = false;

  constructor() {
    MockWorker.instances.push(this);
  }

  postMessage(data: unknown, transfer?: Transferable[]): void {
    if (this.terminated) return;

    const msg = data as { type: string; payload?: unknown };

    switch (msg.type) {
      case "CONFIG": {
        const payload = msg.payload as {
          defaultPatterns: Record<string, string>;
          customPatterns: Record<string, string>;
        };
        this.defaultPatterns = this._compile(payload.defaultPatterns);
        this.userPatterns = this._compile(payload.customPatterns);
        break;
      }

      case "PROCESS": {
        const { text } = msg.payload as { text: string };
        this.internalTruth = text;
        const { masked, findings } = this._processText(text);
        this._emit({ type: "UPDATE", masked, findings });
        break;
      }

      case "GET_TRUTH": {
        if (transfer && transfer[0]) {
          const port = transfer[0] as MessagePort;
          port.postMessage({ text: this.internalTruth });
        } else {
          console.warn(
            "[FieldShield] GET_TRUTH received with no MessagePort — " +
              "caller will time out. Pass port2 via the transfer array.",
          );
        }
        break;
      }

      case "PURGE": {
        this.internalTruth = "";
        this._emit({ type: "PURGED" });
        break;
      }

      default: {
        console.warn(
          `[FieldShield] Worker received unknown message type: "${(msg as { type: string }).type}"`,
        );
        break;
      }
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  simulateError(message = "Worker error"): void {
    this.onerror?.(new ErrorEvent("error", { message }));
  }

  setTruth(value: string): void {
    this.internalTruth = value;
  }

  getTruth(): string {
    return this.internalTruth;
  }

  private _emit(data: unknown): void {
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  private _compile(sources: Record<string, string>): Record<string, RegExp> {
    const result: Record<string, RegExp> = {};
    for (const [name, src] of Object.entries(sources)) {
      try {
        result[name] = new RegExp(src, "gi");
      } catch {
        // skip invalid patterns
      }
    }
    return result;
  }

  private _processText(text: string): { masked: string; findings: string[] } {
    let maskedText = text;
    const findings: string[] = [];
    const allPatterns = { ...this.defaultPatterns, ...this.userPatterns };

    for (const [name, regex] of Object.entries(allPatterns)) {
      try {
        regex.lastIndex = 0;
        if (regex.test(text)) {
          findings.push(name);
          regex.lastIndex = 0;
          maskedText = maskedText.replace(regex, (m) => "█".repeat(m.length));
        }
      } catch {
        regex.lastIndex = 0;
      }
    }

    return { masked: maskedText, findings: [...new Set(findings)] };
  }
}

vi.stubGlobal("Worker", MockWorker);

// ─── Reset between tests ──────────────────────────────────────────────────────

beforeEach(() => {
  MockWorker.instances = [];
});

// ─── Clipboard API mock ───────────────────────────────────────────────────────

Object.defineProperty(navigator, "clipboard", {
  writable: true,
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(""),
  },
});

// ─── Console suppression ──────────────────────────────────────────────────────

const originalWarn = console.warn;
const originalError = console.error;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation((msg: string, ...rest) => {
    if (typeof msg === "string" && msg.includes("[FieldShield]")) return;
    originalWarn(msg, ...rest);
  });
  vi.spyOn(console, "error").mockImplementation((msg: string, ...rest) => {
    if (typeof msg === "string" && msg.includes("[FieldShield]")) return;
    originalError(msg, ...rest);
  });
});

// ─── Cleanup ──────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
