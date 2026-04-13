/**
 * @file cursor-alignment.spec.ts
 * @description Regression tests for the v1.1.4 cursor-drift fix.
 *
 * The drift came from two defects that compounded:
 *   1. The real input used a forced monospace font (v1.1.1) while the mask
 *      layer inherited the consumer's proportional font. In proportional
 *      fonts, the real input's `xxxxx` scrambled value has different per-
 *      character advance widths than the mask layer's real-text glyphs, so
 *      the caret drifted from the visible character starting at character 1.
 *   2. Pattern detection replaced some mask glyphs with U+2588 (█), which
 *      had a different advance than the `x` in the real input, amplifying
 *      the drift whenever a pattern fired.
 *
 * The fix unified the font stack across both layers (monospace !important
 * on mask layer AND real input) and added box-sizing + line-height parity
 * so both layers measure characters identically.
 *
 * These tests verify the character-index cursor contract after the fix.
 * They do NOT measure pixel positions (Playwright's bounding-rect reads
 * drift between builds) — they assert the logical invariant that the
 * caret's selectionStart tracks the typed character count, and that
 * pattern detection does not perturb it.
 */

import { test, expect } from "@playwright/test";

const SSN = '[aria-label*="Social Security Number"]';

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".fieldshield-container");
});

test.describe("Cursor alignment — selectionStart tracking", () => {
  test("cursor does not drift on first character in default Vite font environment", async ({
    page,
  }) => {
    const input = page.locator(SSN).first();
    await input.focus();
    await page.keyboard.type("1");

    const selectionStart = await input.evaluate(
      (el: HTMLInputElement) => el.selectionStart,
    );
    expect(selectionStart).toBe(1);
  });

  test("cursor position tracks correctly through structured input", async ({
    page,
  }) => {
    const input = page.locator(SSN).first();
    await input.focus();

    // Type "123-45-6789" one character at a time and assert selectionStart
    // equals the count after each character. If any single character shifts
    // the caret by more than one position, this test catches it.
    const chars = "123-45-6789".split("");
    for (let i = 0; i < chars.length; i++) {
      await page.keyboard.type(chars[i]);
      const selectionStart = await input.evaluate(
        (el: HTMLInputElement) => el.selectionStart,
      );
      expect(selectionStart).toBe(i + 1);
    }
  });

  test("SSN pattern detection does not move cursor", async ({ page }) => {
    const input = page.locator(SSN).first();
    await input.focus();

    // Type the first 10 characters (one short of a complete SSN). At this
    // point pattern detection has not fired yet — the field is still clean.
    await page.keyboard.type("123-45-678");
    const beforeTrigger = await input.evaluate(
      (el: HTMLInputElement) => el.selectionStart,
    );
    expect(beforeTrigger).toBe(10);

    // Type the last character that completes the SSN pattern. The worker
    // will respond with findings=["SSN"] and the mask layer will re-render
    // with █ characters. The regression: previously this re-render could
    // cause visible cursor drift because the █ glyph had a different
    // advance than `x` in the consumer's font. After the fix both layers
    // use the same monospace font and the caret stays at position 11.
    await page.keyboard.type("9");
    const afterTrigger = await input.evaluate(
      (el: HTMLInputElement) => el.selectionStart,
    );
    expect(afterTrigger).toBe(11);

    // And the input must be flagged aria-invalid — pattern detection actually fired.
    // Checking the input's attribute rather than the mask-unsafe class is more
    // reliable because the first .fieldshield-field-wrapper on the page is the
    // Clinical Notes textarea, not the SSN field we typed into.
    await expect(input).toHaveAttribute("aria-invalid", "true");
  });

  test("backspace from mid-string maintains position and length", async ({
    page,
  }) => {
    const input = page.locator(SSN).first();
    await input.focus();
    await page.keyboard.type("hello");

    // Move the caret to the middle of the string (between "hel" and "lo").
    await input.evaluate((el: HTMLInputElement) => {
      el.setSelectionRange(3, 3);
    });

    await page.keyboard.press("Backspace");

    const selectionStart = await input.evaluate(
      (el: HTMLInputElement) => el.selectionStart,
    );
    expect(selectionStart).toBe(2);

    const domLength = await input.evaluate(
      (el: HTMLInputElement) => el.value.length,
    );
    expect(domLength).toBe(4);
  });
});
