/**
 * @file FieldShieldInput.test.tsx
 * @location src/lib/components/tests/FieldShieldInput.test.tsx
 *
 * Integration tests for FieldShieldInput.
 *
 * Import paths:
 *   ../FieldShieldInput     → src/lib/components/FieldShieldInput.tsx
 *   ../../../tests/setup    → src/tests/setup.ts
 *   ../../patterns          → src/lib/patterns.ts (adjust if needed)
 */

import { createRef } from "react";
import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FieldShieldInput } from "../FieldShieldInput";
import type { FieldShieldHandle } from "../FieldShieldInput";
import { MockWorker } from "../../../tests/setup";
import { FIELDSHIELD_PATTERNS } from "../../patterns";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fireClipboardEvent(
  element: Element,
  type: "copy" | "cut" | "paste",
  clipboardText = "",
) {
  const clipboardData = {
    getData: vi.fn().mockReturnValue(clipboardText),
    setData: vi.fn(),
    clearData: vi.fn(),
    items: [],
    files: [],
    types: [],
  };
  fireEvent(
    element,
    new ClipboardEvent(type, {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboardData as unknown as DataTransfer,
    }),
  );
  return clipboardData;
}

function getLatestWorker(): MockWorker {
  return MockWorker.instances[MockWorker.instances.length - 1];
}

async function waitForWorkerUpdate() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

// ─── DOM scrambling ───────────────────────────────────────────────────────────

describe("FieldShieldInput — DOM scrambling", () => {
  it("input.value contains only x characters after typing", async () => {
    render(<FieldShieldInput label="Test" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "hello");
    expect(input.value).toMatch(/^x+$/);
    expect(input.value).toHaveLength(5);
  });

  it("input.value length equals the number of characters typed", async () => {
    render(<FieldShieldInput label="Test" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "abc");
    expect(input.value).toHaveLength(3);
  });

  it("real value is never exposed in the DOM input element", async () => {
    render(<FieldShieldInput label="SSN" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "123-45-6789");
    expect(input.value).not.toContain("1");
    expect(input.value).not.toContain("-");
    expect(input.value).not.toContain("9");
  });

  it("mask layer does not contain the real sensitive value", async () => {
    render(<FieldShieldInput label="SSN" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    // Use sensitive input so the worker masks it with block characters.
    // Non-sensitive input passes through unchanged so the mask layer
    // correctly shows it — that would make this assertion meaningless.
    await userEvent.type(input, "123-45-6789");
    await waitForWorkerUpdate();
    const maskLayer = document.querySelector(".fieldshield-mask-layer");
    expect(maskLayer?.textContent).not.toContain("123-45-6789");
    expect(maskLayer?.textContent).toContain("█");
  });
});

// ─── Worker lifecycle ─────────────────────────────────────────────────────────

describe("FieldShieldInput — Worker lifecycle", () => {
  it("creates one Worker per field on mount", () => {
    render(<FieldShieldInput label="Test" />);
    expect(MockWorker.instances).toHaveLength(1);
  });

  it("sends CONFIG with built-in patterns on mount", () => {
    const spy = vi.spyOn(MockWorker.prototype, "postMessage");
    render(<FieldShieldInput label="Test" />);
    const configCall = spy.mock.calls.find(
      ([msg]) => (msg as { type: string }).type === "CONFIG",
    );
    expect(configCall).toBeDefined();
    const payload = (
      configCall![0] as { payload: { defaultPatterns: Record<string, string> } }
    ).payload;
    expect(payload.defaultPatterns).toMatchObject({
      SSN: FIELDSHIELD_PATTERNS.SSN,
    });
  });

  it("terminates the worker on unmount", () => {
    const { unmount } = render(<FieldShieldInput label="Test" />);
    const worker = getLatestWorker();
    const terminateSpy = vi.spyOn(worker, "terminate");
    unmount();
    expect(terminateSpy).toHaveBeenCalledOnce();
  });

  it("each field instance gets its own independent worker", () => {
    render(
      <>
        <FieldShieldInput label="Field A" />
        <FieldShieldInput label="Field B" />
        <FieldShieldInput label="Field C" />
      </>,
    );
    expect(MockWorker.instances).toHaveLength(3);
  });
});

// ─── Props: label ─────────────────────────────────────────────────────────────

describe("FieldShieldInput — label prop", () => {
  it("renders label text", () => {
    render(<FieldShieldInput label="Social Security Number" />);
    expect(screen.getByText("Social Security Number")).toBeInTheDocument();
  });

  it("label htmlFor matches input id", () => {
    render(<FieldShieldInput label="SSN" />);
    const label = screen.getByText("SSN").closest("label");
    const input = screen.getByRole("textbox");
    expect(label?.htmlFor).toBe(input.id);
  });
});

// ─── Props: placeholder ───────────────────────────────────────────────────────

describe("FieldShieldInput — placeholder prop", () => {
  it("renders placeholder text on the input", () => {
    render(<FieldShieldInput label="SSN" placeholder="NNN-NN-NNNN" />);
    expect(screen.getByPlaceholderText("NNN-NN-NNNN")).toBeInTheDocument();
  });
});

// ─── Props: disabled ──────────────────────────────────────────────────────────

describe("FieldShieldInput — disabled prop", () => {
  it("disables the input element", () => {
    render(<FieldShieldInput label="Test" disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("sets data-disabled on the container when disabled", () => {
    render(<FieldShieldInput label="Test" disabled />);
    expect(document.querySelector(".fieldshield-container")).toHaveAttribute(
      "data-disabled",
    );
  });

  it("does not set data-disabled when not disabled", () => {
    render(<FieldShieldInput label="Test" />);
    expect(
      document.querySelector(".fieldshield-container"),
    ).not.toHaveAttribute("data-disabled");
  });
});

// ─── Props: required ──────────────────────────────────────────────────────────

describe("FieldShieldInput — required prop", () => {
  it("sets required attribute on input", () => {
    render(<FieldShieldInput label="Test" required />);
    expect(screen.getByRole("textbox")).toBeRequired();
  });

  it("sets aria-required=true on input", () => {
    render(<FieldShieldInput label="Test" required />);
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "aria-required",
      "true",
    );
  });
});

// ─── Props: maxLength ─────────────────────────────────────────────────────────

describe("FieldShieldInput — maxLength prop", () => {
  it("sets maxlength attribute on input", () => {
    render(<FieldShieldInput label="Test" maxLength={11} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", "11");
  });
});

// ─── Props: inputMode ─────────────────────────────────────────────────────────

describe("FieldShieldInput — inputMode prop", () => {
  it("defaults to inputmode=text", () => {
    render(<FieldShieldInput label="Test" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("inputmode", "text");
  });

  it.each([
    "numeric",
    "decimal",
    "tel",
    "email",
    "search",
    "url",
    "none",
  ] as const)("accepts inputMode=%s", (mode) => {
    render(<FieldShieldInput label="Test" inputMode={mode} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("inputmode", mode);
  });
});

// ─── Props: type=textarea ─────────────────────────────────────────────────────

describe("FieldShieldInput — type=textarea", () => {
  it("renders a textarea element", () => {
    render(<FieldShieldInput label="Notes" type="textarea" />);
    expect(screen.getByRole("textbox").tagName).toBe("TEXTAREA");
  });

  it("applies rows prop to the textarea", () => {
    render(<FieldShieldInput label="Notes" type="textarea" rows={6} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "6");
  });

  it("defaults rows to 3", () => {
    render(<FieldShieldInput label="Notes" type="textarea" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "3");
  });

  it('field wrapper has data-type="textarea" in textarea mode', () => {
    render(<FieldShieldInput label="Notes" type="textarea" />);
    const wrapper = document.querySelector(".fieldshield-field-wrapper");
    expect(wrapper).toHaveAttribute("data-type", "textarea");
  });

  it("field wrapper has no data-type attribute in default text mode", () => {
    render(<FieldShieldInput label="Notes" />);
    const wrapper = document.querySelector(".fieldshield-field-wrapper");
    expect(wrapper).not.toHaveAttribute("data-type");
  });
});

// ─── Props: a11yMode ──────────────────────────────────────────────────────────

describe("FieldShieldInput — a11yMode", () => {
  it("renders a type=password input in a11y mode", () => {
    render(<FieldShieldInput label="Test" a11yMode />);
    expect(document.querySelector("input[type=password]")).toBeInTheDocument();
  });

  it("does not render the DOM scrambling overlay in a11y mode", () => {
    render(<FieldShieldInput label="Test" a11yMode />);
    expect(
      document.querySelector(".fieldshield-mask-layer"),
    ).not.toBeInTheDocument();
  });
});

// ─── Props: onFocus / onBlur ──────────────────────────────────────────────────

describe("FieldShieldInput — onFocus / onBlur", () => {
  it("calls onFocus when the input receives focus", async () => {
    const onFocus = vi.fn();
    render(<FieldShieldInput label="Test" onFocus={onFocus} />);
    await userEvent.click(screen.getByRole("textbox"));
    expect(onFocus).toHaveBeenCalledOnce();
  });

  it("calls onBlur when the input loses focus", async () => {
    const onBlur = vi.fn();
    render(<FieldShieldInput label="Test" onBlur={onBlur} />);
    await userEvent.click(screen.getByRole("textbox"));
    await userEvent.tab();
    expect(onBlur).toHaveBeenCalledOnce();
  });
});

// ─── Props: onChange ──────────────────────────────────────────────────────────

describe("FieldShieldInput — onChange", () => {
  it("calls onChange when user types", async () => {
    // onChange signature is (masked: string, findings: string[]) — not a React event
    const onChange = vi.fn() as (masked: string, findings: string[]) => void;
    render(<FieldShieldInput label="Test" onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "a");
    expect(onChange).toHaveBeenCalled();
  });

  it("DOM input value contains scrambled x-characters, not real value", async () => {
    render(<FieldShieldInput label="Test" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "hello");
    expect(input.value).toMatch(/^x+$/);
    expect(input.value).not.toContain("hello");
  });
});

// ─── getSecureValue via ref ───────────────────────────────────────────────────

describe("FieldShieldInput — getSecureValue ref method", () => {
  it("returns the real value typed into the field", async () => {
    const ref = createRef<FieldShieldHandle>();
    render(<FieldShieldInput label="SSN" ref={ref} />);
    await userEvent.type(screen.getByRole("textbox"), "hello");
    expect(await ref.current!.getSecureValue()).toBe("hello");
  });

  it("returns empty string before any typing", async () => {
    const ref = createRef<FieldShieldHandle>();
    render(<FieldShieldInput label="SSN" ref={ref} />);
    expect(await ref.current!.getSecureValue()).toBe("");
  });

  it("returns the real value including sensitive patterns", async () => {
    const ref = createRef<FieldShieldHandle>();
    render(<FieldShieldInput label="SSN" ref={ref} />);
    await userEvent.type(screen.getByRole("textbox"), "123-45-6789");
    expect(await ref.current!.getSecureValue()).toBe("123-45-6789");
  });
});

// ─── purge via ref ────────────────────────────────────────────────────────────

describe("FieldShieldInput — purge ref method", () => {
  it("sends PURGE message to the worker", async () => {
    const ref = createRef<FieldShieldHandle>();
    render(<FieldShieldInput label="Test" ref={ref} />);
    const spy = vi.spyOn(getLatestWorker(), "postMessage");
    act(() => ref.current!.purge());
    await waitForWorkerUpdate();
    expect(
      spy.mock.calls.some(
        ([msg]) => (msg as { type: string }).type === "PURGE",
      ),
    ).toBe(true);
  });

  it("getSecureValue returns empty string after purge", async () => {
    const ref = createRef<FieldShieldHandle>();
    render(<FieldShieldInput label="Test" ref={ref} />);
    await userEvent.type(screen.getByRole("textbox"), "sensitive data");
    act(() => ref.current!.purge());
    await waitForWorkerUpdate();
    expect(await ref.current!.getSecureValue()).toBe("");
  });

  it("purge clears DOM so typing after purge starts from empty", async () => {
    const ref = createRef<FieldShieldHandle>();
    render(<FieldShieldInput label="Test" ref={ref} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "hello");
    act(() => ref.current!.purge());
    await waitForWorkerUpdate();
    // DOM must be empty — subsequent delta calculation starts from length 0
    expect(input.value).toBe("");
    // Typing after purge must produce the correct real value
    await userEvent.type(input, "new");
    expect(await ref.current!.getSecureValue()).toBe("new");
  });
});

// ─── Copy interception ────────────────────────────────────────────────────────

describe("FieldShieldInput — copy interception", () => {
  it("calls onSensitiveCopyAttempt when copying sensitive content", async () => {
    const onCopy = vi.fn();
    render(<FieldShieldInput label="SSN" onSensitiveCopyAttempt={onCopy} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "123-45-6789");
    await waitForWorkerUpdate();
    input.setSelectionRange(0, input.value.length);
    fireClipboardEvent(input, "copy");
    await waitFor(() => expect(onCopy).toHaveBeenCalledOnce());
  });

  it("onSensitiveCopyAttempt payload has timestamp, fieldLabel, findings, masked, eventType", async () => {
    const onCopy = vi.fn();
    render(<FieldShieldInput label="SSN" onSensitiveCopyAttempt={onCopy} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "123-45-6789");
    await waitForWorkerUpdate();
    input.setSelectionRange(0, input.value.length);
    fireClipboardEvent(input, "copy");
    await waitFor(() => expect(onCopy).toHaveBeenCalled());
    const payload = onCopy.mock.calls[0][0];
    expect(payload).toHaveProperty("timestamp");
    expect(payload).toHaveProperty("fieldLabel");
    expect(payload).toHaveProperty("findings");
    expect(payload).toHaveProperty("masked");
    expect(payload).toHaveProperty("eventType", "copy");
  });

  it("does not call onSensitiveCopyAttempt for non-sensitive content", async () => {
    const onCopy = vi.fn();
    render(<FieldShieldInput label="Notes" onSensitiveCopyAttempt={onCopy} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "hello world");
    await waitForWorkerUpdate();
    input.setSelectionRange(0, input.value.length);
    fireClipboardEvent(input, "copy");
    expect(onCopy).not.toHaveBeenCalled();
  });

  it("clipboard receives masked █ content, not real value", async () => {
    const onCopy = vi.fn();
    render(<FieldShieldInput label="SSN" onSensitiveCopyAttempt={onCopy} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "123-45-6789");
    await waitForWorkerUpdate();
    input.setSelectionRange(0, input.value.length);
    const clipboardData = fireClipboardEvent(input, "copy");
    await waitFor(() => expect(onCopy).toHaveBeenCalled());
    const setDataContent = clipboardData.setData.mock.calls[0]?.[1] ?? "";
    expect(setDataContent).not.toContain("123");
    expect(setDataContent).toContain("█");
  });
});

// ─── Cut behavior ─────────────────────────────────────────────────────────────

describe("FieldShieldInput — cut behavior", () => {
  it("calls onSensitiveCopyAttempt with eventType=cut", async () => {
    const onCopy = vi.fn();
    render(<FieldShieldInput label="SSN" onSensitiveCopyAttempt={onCopy} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "123-45-6789");
    await waitForWorkerUpdate();
    input.setSelectionRange(0, input.value.length);
    fireClipboardEvent(input, "cut");
    await waitFor(() => expect(onCopy).toHaveBeenCalled());
    expect(onCopy.mock.calls[0][0].eventType).toBe("cut");
  });

  it("DOM value shortens after cut", async () => {
    render(<FieldShieldInput label="Test" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "hello");
    expect(input.value).toHaveLength(5);
    input.setSelectionRange(2, 5);
    fireClipboardEvent(input, "cut");
    await waitForWorkerUpdate();
    expect(input.value).toHaveLength(2);
  });

  it("getSecureValue returns shortened value after cut", async () => {
    const ref = createRef<FieldShieldHandle>();
    render(<FieldShieldInput label="Test" ref={ref} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "hello");
    input.setSelectionRange(0, input.value.length);
    fireClipboardEvent(input, "cut");
    await waitForWorkerUpdate();
    expect(await ref.current!.getSecureValue()).toBe("");
  });

  it("typing after a full cut produces correct length (no spurious x)", async () => {
    render(<FieldShieldInput label="Test" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "hello");
    input.setSelectionRange(0, input.value.length);
    fireClipboardEvent(input, "cut");
    await waitForWorkerUpdate();
    await userEvent.type(input, "a");
    expect(input.value).toHaveLength(1);
  });

  it("DOM value is correct length synchronously after partial cut (no rAF dependency)", async () => {
    render(<FieldShieldInput label="Test" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "abcde"); // real = "abcde", DOM = "xxxxx"
    input.setSelectionRange(2, 5); // select "cde"
    fireClipboardEvent(input, "cut");
    // DOM must reflect cut length immediately — no await needed.
    // This would fail if input.value update were still deferred in rAF.
    expect(input.value).toHaveLength(2);
  });

  it("typing immediately after partial cut produces the correct real value", async () => {
    const ref = createRef<FieldShieldHandle>();
    render(<FieldShieldInput label="Test" ref={ref} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "hello"); // real = "hello"
    input.setSelectionRange(2, 5); // select "llo"
    fireClipboardEvent(input, "cut"); // real = "he"
    // Type immediately — no await between cut and type simulates the
    // fast-typist race condition the rAF removal fixes.
    await userEvent.type(input, "y"); // real should = "hey"
    const value = await ref.current!.getSecureValue();
    expect(value).toBe("hey");
    expect(input.value).toHaveLength(3);
  });
});

// ─── Paste behavior ───────────────────────────────────────────────────────────

describe("FieldShieldInput — paste behavior", () => {
  it("calls onSensitivePaste when pasting sensitive content", async () => {
    const onPaste = vi.fn();
    render(<FieldShieldInput label="SSN" onSensitivePaste={onPaste} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.click(input);
    fireClipboardEvent(input, "paste", "123-45-6789");
    await waitFor(() => expect(onPaste).toHaveBeenCalled());
  });

  it("onSensitivePaste payload has correct shape", async () => {
    const onPaste = vi.fn();
    render(<FieldShieldInput label="SSN" onSensitivePaste={onPaste} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.click(input);
    fireClipboardEvent(input, "paste", "123-45-6789");
    await waitFor(() => expect(onPaste).toHaveBeenCalled());
    const payload = onPaste.mock.calls[0][0];
    expect(payload).toHaveProperty("timestamp");
    expect(payload).toHaveProperty("fieldLabel");
    expect(payload).toHaveProperty("findings");
    expect(payload).toHaveProperty("masked");
    expect(payload).toHaveProperty("eventType", "paste");
  });

  it("does not call onSensitivePaste for clean paste content", async () => {
    const onPaste = vi.fn();
    render(<FieldShieldInput label="Notes" onSensitivePaste={onPaste} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.click(input);
    fireClipboardEvent(input, "paste", "hello world no sensitive data");
    expect(onPaste).not.toHaveBeenCalled();
  });

  it("allows paste to proceed when onSensitivePaste returns nothing", async () => {
    const onPaste = vi.fn().mockReturnValue(undefined);
    render(<FieldShieldInput label="SSN" onSensitivePaste={onPaste} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.click(input);
    fireClipboardEvent(input, "paste", "123-45-6789");
    await waitFor(() => expect(onPaste).toHaveBeenCalled());
    // Paste proceeded — field has characters
    expect(input.value.length).toBeGreaterThan(0);
  });

  it("blocks paste when onSensitivePaste returns false", async () => {
    const onPaste = vi.fn().mockReturnValue(false);
    render(<FieldShieldInput label="SSN" onSensitivePaste={onPaste} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.click(input);
    fireClipboardEvent(input, "paste", "123-45-6789");
    await waitFor(() => expect(onPaste).toHaveBeenCalled());
    // Paste was blocked — field is empty
    expect(input.value).toHaveLength(0);
  });

  it("allows paste when onSensitivePaste returns true", async () => {
    const onPaste = vi.fn().mockReturnValue(true);
    render(<FieldShieldInput label="SSN" onSensitivePaste={onPaste} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.click(input);
    fireClipboardEvent(input, "paste", "123-45-6789");
    await waitFor(() => expect(onPaste).toHaveBeenCalled());
    expect(input.value.length).toBeGreaterThan(0);
  });

  it("does not block paste of non-sensitive content even with onSensitivePaste returning false", async () => {
    // onSensitivePaste only fires for sensitive content —
    // clean paste is never affected by the return value
    const onPaste = vi.fn().mockReturnValue(false);
    render(<FieldShieldInput label="Notes" onSensitivePaste={onPaste} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.click(input);
    fireClipboardEvent(input, "paste", "hello world");
    // onSensitivePaste was never called — paste proceeds normally
    expect(onPaste).not.toHaveBeenCalled();
    expect(input.value.length).toBeGreaterThan(0);
  });
});

// ─── maxProcessLength — paste blocking ───────────────────────────────────────

describe("FieldShieldInput — maxProcessLength paste blocking", () => {
  it("blocks paste that would push field over the limit", async () => {
    render(<FieldShieldInput label="Test" maxProcessLength={10} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.click(input);

    // Paste 11 characters — one over the limit
    fireClipboardEvent(input, "paste", "a".repeat(11));

    // DOM should be unchanged — paste was blocked
    expect(input.value).toHaveLength(0);
  });

  it("allows paste that fits within the limit", async () => {
    render(<FieldShieldInput label="Test" maxProcessLength={20} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.click(input);

    fireClipboardEvent(input, "paste", "hello");

    // Paste was accepted — DOM shows scrambled characters
    expect(input.value).toHaveLength(5);
    expect(input.value).toMatch(/^x+$/);
  });

  it("fires onMaxLengthExceeded when paste is blocked", async () => {
    const onExceeded = vi.fn();
    render(
      <FieldShieldInput
        label="Test"
        maxProcessLength={10}
        onMaxLengthExceeded={onExceeded}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.click(input);
    fireClipboardEvent(input, "paste", "a".repeat(15));

    expect(onExceeded).toHaveBeenCalledOnce();
    expect(onExceeded).toHaveBeenCalledWith(15, 10);
  });

  it("does not fire onSensitivePaste when paste is blocked by length", async () => {
    const onPaste = vi.fn();
    const onExceeded = vi.fn();
    render(
      <FieldShieldInput
        label="SSN"
        maxProcessLength={5}
        onSensitivePaste={onPaste}
        onMaxLengthExceeded={onExceeded}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.click(input);

    // Paste sensitive data that exceeds limit
    fireClipboardEvent(input, "paste", "123-45-6789");

    // Paste was blocked — onSensitivePaste must NOT fire for a reverted paste
    expect(onPaste).not.toHaveBeenCalled();
    expect(onExceeded).toHaveBeenCalledOnce();
  });

  it("accounts for existing content when checking paste length", async () => {
    const onExceeded = vi.fn();
    render(
      <FieldShieldInput
        label="Test"
        maxProcessLength={10}
        onMaxLengthExceeded={onExceeded}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;

    // Type 8 characters first
    await userEvent.type(input, "12345678");
    expect(input.value).toHaveLength(8);

    // Paste 3 more — 8 + 3 = 11, over the limit of 10
    await userEvent.click(input);
    fireClipboardEvent(input, "paste", "abc");

    expect(onExceeded).toHaveBeenCalledOnce();
    // Field still has the original 8 characters
    expect(input.value).toHaveLength(8);
  });
});

// ─── Custom patterns ─────────────────────────────────────────────────────────

describe("FieldShieldInput — customPatterns prop", () => {
  it("detects a custom pattern and includes it in findings", async () => {
    const onCopy = vi.fn();
    render(
      <FieldShieldInput
        label="Custom"
        customPatterns={[{ name: "CUSTOM_ID", regex: "\\bID-\\d{6}\\b" }]}
        onSensitiveCopyAttempt={onCopy}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await userEvent.type(input, "ID-123456");
    await waitForWorkerUpdate();
    input.setSelectionRange(0, input.value.length);
    fireClipboardEvent(input, "copy");
    await waitFor(() => expect(onCopy).toHaveBeenCalled());
    expect(onCopy.mock.calls[0][0].findings).toContain("CUSTOM_ID");
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────

describe("FieldShieldInput — accessibility", () => {
  it("input has an aria-label", () => {
    render(<FieldShieldInput label="SSN" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-label");
  });

  it("input has aria-describedby pointing to an existing element", () => {
    render(<FieldShieldInput label="SSN" />);
    const input = screen.getByRole("textbox");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const descEl = document.getElementById(describedBy!.split(" ")[0]);
    expect(descEl).toBeInTheDocument();
  });

  it("spellcheck is disabled", () => {
    render(<FieldShieldInput label="Test" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("spellcheck", "false");
  });

  it("autocomplete is off", () => {
    render(<FieldShieldInput label="Test" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("autocomplete", "off");
  });

  it("container has role=group", () => {
    render(<FieldShieldInput label="Test" />);
    expect(screen.getByRole("group")).toBeInTheDocument();
  });
});

// ─── Warning UI ───────────────────────────────────────────────────────────────

describe("FieldShieldInput — warning UI", () => {
  it("shows sensitive data warning after worker detects a pattern", async () => {
    render(<FieldShieldInput label="SSN" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "123-45-6789");
    await waitForWorkerUpdate();
    await waitFor(() => {
      expect(screen.getByText(/Clipboard blocked for/i)).toBeInTheDocument();
    });
  });

  it("warning includes the detected pattern name", async () => {
    render(<FieldShieldInput label="SSN" />);
    await userEvent.type(screen.getByRole("textbox"), "123-45-6789");
    await waitForWorkerUpdate();
    await waitFor(() => {
      // Use aria-label to target the pattern tag specifically — avoids
      // collision with the field label which also contains the text "SSN".
      expect(screen.getByLabelText("pattern: SSN")).toBeInTheDocument();
    });
  });
});

// ─── Worker error recovery ────────────────────────────────────────────────────

describe("FieldShieldInput — worker onerror recovery", () => {
  it("calling onerror on the worker does not throw or crash the component", async () => {
    render(<FieldShieldInput label="SSN" />);
    await userEvent.type(screen.getByRole("textbox"), "123-45-6789");
    await waitForWorkerUpdate();
    expect(() =>
      act(() => getLatestWorker().simulateError("catastrophic failure")),
    ).not.toThrow();
    // Component is still mounted and input is still accessible
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});

// ─── Worker initialization fallback (item 11) ────────────────────────────────

describe("FieldShieldInput — worker initialization fallback", () => {
  it("renders type=password when worker fails to initialize", async () => {
    vi.stubGlobal("Worker", () => {
      throw new Error("CSP blocked worker initialization");
    });

    render(<FieldShieldInput label="SSN" />);

    await waitFor(() => {
      expect(
        document.querySelector("input[type=password]"),
      ).toBeInTheDocument();
    });

    vi.unstubAllGlobals();
    vi.stubGlobal("Worker", MockWorker);
  });

  it("does not render the mask layer when worker fails", async () => {
    vi.stubGlobal("Worker", () => {
      throw new Error("CSP blocked");
    });

    render(<FieldShieldInput label="SSN" />);

    await waitFor(() => {
      expect(
        document.querySelector(".fieldshield-mask-layer"),
      ).not.toBeInTheDocument();
    });

    vi.unstubAllGlobals();
    vi.stubGlobal("Worker", MockWorker);
  });

  it("calls onWorkerError when the worker fires a runtime error", async () => {
    const onWorkerError = vi.fn();
    render(<FieldShieldInput label="SSN" onWorkerError={onWorkerError} />);
    await userEvent.type(screen.getByRole("textbox"), "hello");
    await waitForWorkerUpdate();

    await act(async () => {
      getLatestWorker().simulateError("runtime crash");
    });

    expect(onWorkerError).toHaveBeenCalledOnce();
    expect(onWorkerError.mock.calls[0][0]).toBeInstanceOf(ErrorEvent);
  });
});

// ─── className / style passthrough ───────────────────────────────────────────

describe("FieldShieldInput — className and style props", () => {
  it("applies className to the container", () => {
    render(<FieldShieldInput label="Test" className="my-custom-class" />);
    expect(document.querySelector(".fieldshield-container")).toHaveClass(
      "my-custom-class",
    );
  });

  it("applies style to the container", () => {
    render(<FieldShieldInput label="Test" style={{ marginTop: "20px" }} />);
    expect(document.querySelector(".fieldshield-container")).toHaveStyle({
      marginTop: "20px",
    });
  });
});

// ─── Mask layer font consistency ──────────────────────────────────────────────
//
// Regression tests for v1.1.4. The cursor drift fix depends on two invariants:
// (1) both the mask layer and the real input exist in the DOM at the same time
// and (2) the mask layer is marked aria-hidden so screen readers skip it — this
// matters especially now that the mask layer renders in a fixed monospace font
// that may differ from the surrounding page font.
//
// These tests exercise the prerequisites for the font-based alignment. Visual
// alignment itself cannot be asserted here because jsdom does not compute
// layout or font metrics — those assertions live in the Playwright suite.
describe("FieldShieldInput — mask layer font consistency", () => {
  it("mask layer has fieldshield-mask-layer class", () => {
    render(<FieldShieldInput label="Test" />);
    expect(document.querySelector(".fieldshield-mask-layer")).not.toBeNull();
  });

  it("real input has fieldshield-real-input class", () => {
    render(<FieldShieldInput label="Test" />);
    expect(document.querySelector(".fieldshield-real-input")).not.toBeNull();
  });

  it("both layers are present simultaneously", () => {
    // Overlay architecture invariant — the mask layer and real input must
    // coexist for font-based alignment to have anything to align.
    render(<FieldShieldInput label="Test" />);
    const mask = document.querySelector(".fieldshield-mask-layer");
    const real = document.querySelector(".fieldshield-real-input");
    expect(mask).not.toBeNull();
    expect(real).not.toBeNull();
  });

  it("mask layer is aria-hidden", () => {
    // Screen readers must skip the mask layer. In monospace mode the mask
    // text may not match the surrounding page font, and announcing it to
    // assistive tech would duplicate what the real input's aria-label
    // already provides.
    render(<FieldShieldInput label="Test" />);
    const mask = document.querySelector(".fieldshield-mask-layer");
    expect(mask).toHaveAttribute("aria-hidden", "true");
  });

  it("real input carries the fieldshield-real-input class only", () => {
    // Architecture invariant: the real input is always the element the
    // fieldshield-real-input CSS targets. The forced monospace + transparent
    // color rules depend on this class being present.
    render(<FieldShieldInput label="Test" />);
    const real = document.querySelector(".fieldshield-real-input");
    expect(real?.className).toContain("fieldshield-real-input");
  });
});
