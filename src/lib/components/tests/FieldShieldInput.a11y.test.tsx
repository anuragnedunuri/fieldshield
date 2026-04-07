/**
 * @file FieldShieldInput.a11y.test.tsx
 * @location src/lib/components/tests/FieldShieldInput.a11y.test.tsx
 *
 * Accessibility tests for FieldShieldInput.
 *
 * Covers:
 *   - axe-core automated scan (catches ~30% of WCAG violations automatically)
 *   - ARIA attribute presence and correctness
 *   - aria-errormessage wiring when sensitive data detected
 *   - Keyboard navigation — field reachable via Tab, no keyboard trap
 *   - Screen reader label correctness — aria-label overrides scrambled DOM value
 *   - Live region behavior — findings announced without interrupting speech
 *   - a11yMode render — correct password input semantics
 *
 * Install dependencies before running:
 *   npm install --save-dev @axe-core/react vitest-axe
 */

import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { FieldShieldInput } from "../FieldShieldInput";

// ─── axe automated scan ───────────────────────────────────────────────────────

describe("FieldShieldInput — axe automated scan", () => {
  it("has no axe violations in standard mode on mount", async () => {
    const { container } = render(<FieldShieldInput label="SSN" />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it("has no axe violations in a11yMode on mount", async () => {
    const { container } = render(<FieldShieldInput label="SSN" a11yMode />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it("has no axe violations in standard mode when sensitive data is detected", async () => {
    const { container } = render(<FieldShieldInput label="SSN" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "123-45-6789");
    // Wait for worker UPDATE to set isUnsafe = true
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it("has no axe violations with no label provided", async () => {
    const { container } = render(<FieldShieldInput />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it("has no axe violations when disabled", async () => {
    const { container } = render(<FieldShieldInput label="SSN" disabled />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it("has no axe violations for textarea type", async () => {
    const { container } = render(
      <FieldShieldInput label="Clinical Notes" type="textarea" />,
    );
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });
});

// ─── ARIA attributes ──────────────────────────────────────────────────────────

describe("FieldShieldInput — ARIA attributes", () => {
  it("container has role=group", () => {
    render(<FieldShieldInput label="SSN" />);
    const container = document.querySelector(".fieldshield-container");
    expect(container).toHaveAttribute("role", "group");
  });

  it("container has aria-labelledby pointing to the input id", () => {
    render(<FieldShieldInput label="SSN" />);
    const container = document.querySelector(".fieldshield-container");
    const input = screen.getByRole("textbox");
    expect(container).toHaveAttribute("aria-labelledby", input.id);
  });

  it("input has aria-label set", () => {
    render(<FieldShieldInput label="SSN" />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-label");
    expect(input.getAttribute("aria-label")).toContain("SSN");
  });

  it("input has aria-describedby pointing to description element", () => {
    render(<FieldShieldInput label="SSN" />);
    const input = screen.getByRole("textbox");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const descEl = document.getElementById(describedBy!.split(" ")[0]);
    expect(descEl).toBeInTheDocument();
  });

  it("aria-invalid is false on mount", () => {
    render(<FieldShieldInput label="SSN" />);
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "aria-invalid",
      "false",
    );
  });

  it("aria-invalid becomes true when sensitive data detected", async () => {
    render(<FieldShieldInput label="SSN" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "123-45-6789");
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
  });

  it("aria-invalid returns to false when field is cleared", async () => {
    render(<FieldShieldInput label="SSN" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "123-45-6789");
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    await userEvent.clear(input);
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "false"));
  });

  it("spellcheck is false", () => {
    render(<FieldShieldInput label="SSN" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("spellcheck", "false");
  });

  it("autocomplete is off", () => {
    render(<FieldShieldInput label="SSN" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("autocomplete", "off");
  });

  it("aria-required is set when required prop is true", () => {
    render(<FieldShieldInput label="SSN" required />);
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "aria-required",
      "true",
    );
  });
});

// ─── aria-errormessage ────────────────────────────────────────────────────────

describe("FieldShieldInput — aria-errormessage", () => {
  it("aria-errormessage is not set when field is clean", () => {
    render(<FieldShieldInput label="SSN" />);
    const input = screen.getByRole("textbox");
    expect(input).not.toHaveAttribute("aria-errormessage");
  });

  it("aria-errormessage is set when sensitive data is detected", async () => {
    render(<FieldShieldInput label="SSN" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "123-45-6789");
    await waitFor(() => expect(input).toHaveAttribute("aria-errormessage"));
    const errorId = input.getAttribute("aria-errormessage");
    expect(document.getElementById(errorId!)).toBeInTheDocument();
  });

  it("aria-errormessage points to the findings live region", async () => {
    render(<FieldShieldInput label="SSN" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "123-45-6789");
    await waitFor(() => expect(input).toHaveAttribute("aria-errormessage"));
    const errorId = input.getAttribute("aria-errormessage");
    const errorEl = document.getElementById(errorId!);
    expect(errorEl).toHaveClass("fieldshield-findings");
  });

  it("aria-errormessage is removed when field is cleared", async () => {
    render(<FieldShieldInput label="SSN" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "123-45-6789");
    await waitFor(() => expect(input).toHaveAttribute("aria-errormessage"));
    await userEvent.clear(input);
    await waitFor(() => expect(input).not.toHaveAttribute("aria-errormessage"));
  });

  it("aria-errormessage works correctly in a11yMode", async () => {
    render(<FieldShieldInput label="SSN" a11yMode />);
    const input = document.querySelector(
      "input[type=password]",
    ) as HTMLInputElement;
    await userEvent.type(input, "123-45-6789");
    await waitFor(() => expect(input).toHaveAttribute("aria-errormessage"));
    const errorId = input.getAttribute("aria-errormessage");
    expect(document.getElementById(errorId!)).toBeInTheDocument();
  });
});

// ─── Live region ──────────────────────────────────────────────────────────────

describe("FieldShieldInput — live region", () => {
  it("findings live region is present in DOM at mount", () => {
    render(<FieldShieldInput label="SSN" />);
    const liveRegion = document.querySelector(".fieldshield-findings");
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveAttribute("role", "status");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion).toHaveAttribute("aria-atomic", "true");
  });

  it("live region is empty when field is clean", () => {
    render(<FieldShieldInput label="SSN" />);
    const liveRegion = document.querySelector(".fieldshield-findings");
    expect(liveRegion).toBeEmptyDOMElement();
  });

  it("live region contains warning text when sensitive data detected", async () => {
    render(<FieldShieldInput label="SSN" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "123-45-6789");
    await waitFor(() => {
      const liveRegion = document.querySelector(".fieldshield-findings");
      expect(liveRegion).not.toBeEmptyDOMElement();
      expect(liveRegion).toHaveTextContent("Sensitive data detected");
    });
  });

  it("live region clears when field is emptied", async () => {
    render(<FieldShieldInput label="SSN" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "123-45-6789");
    await waitFor(() => {
      expect(
        document.querySelector(".fieldshield-findings"),
      ).not.toBeEmptyDOMElement();
    });
    await userEvent.clear(input);
    await waitFor(() => {
      expect(
        document.querySelector(".fieldshield-findings"),
      ).toBeEmptyDOMElement();
    });
  });
});

// ─── Keyboard navigation ──────────────────────────────────────────────────────

describe("FieldShieldInput — keyboard navigation", () => {
  it("field is reachable via Tab", async () => {
    render(
      <div>
        <button>Before</button>
        <FieldShieldInput label="SSN" />
        <button>After</button>
      </div>,
    );
    const beforeBtn = screen.getByText("Before");
    beforeBtn.focus();
    await userEvent.tab();
    const input = screen.getByRole("textbox");
    expect(document.activeElement).toBe(input);
  });

  it("Tab moves focus out of the field — no keyboard trap", async () => {
    render(
      <div>
        <FieldShieldInput label="SSN" />
        <button>After</button>
      </div>,
    );
    const input = screen.getByRole("textbox");
    input.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByText("After"));
  });

  it("Shift+Tab moves focus backwards out of the field", async () => {
    render(
      <div>
        <button>Before</button>
        <FieldShieldInput label="SSN" />
      </div>,
    );
    const input = screen.getByRole("textbox");
    input.focus();
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByText("Before"));
  });
});

// ─── a11yMode render ──────────────────────────────────────────────────────────

describe("FieldShieldInput — a11yMode", () => {
  it("renders a password input in a11yMode", () => {
    render(<FieldShieldInput label="SSN" a11yMode />);
    const input = document.querySelector("input[type=password]");
    expect(input).toBeInTheDocument();
  });

  it("does not render the mask layer in a11yMode", () => {
    render(<FieldShieldInput label="SSN" a11yMode />);
    expect(
      document.querySelector(".fieldshield-mask-layer"),
    ).not.toBeInTheDocument();
  });

  it("a11yMode password input has aria-invalid set correctly", async () => {
    render(<FieldShieldInput label="SSN" a11yMode />);
    const input = document.querySelector(
      "input[type=password]",
    ) as HTMLInputElement;
    expect(input).toHaveAttribute("aria-invalid", "false");
    await userEvent.type(input, "123-45-6789");
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
  });

  it("a11yMode has aria-label fallback when no label prop provided", () => {
    render(<FieldShieldInput a11yMode />);
    const input = document.querySelector(
      "input[type=password]",
    ) as HTMLInputElement;
    expect(input).toHaveAttribute("aria-label", "Protected field");
  });

  it("a11yMode has axe violations check", async () => {
    const { container } = render(<FieldShieldInput label="SSN" a11yMode />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });
});
