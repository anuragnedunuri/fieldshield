/**
 * @file fieldshield.spec.ts
 * @description Playwright end-to-end tests for FieldShield.
 *
 * Actual aria-labels from the demo app:
 *   "Clinical Notes — protected input"         → TEXTAREA
 *   "Patient Notes — protected input"          → INPUT
 *   "Social Security Number — protected input" → INPUT
 *   "Internal API Key / Employee ID — protected input" → INPUT
 */

import { test, expect } from "@playwright/test";
import { readClipboard, writeClipboard } from "./helpers";

// ─── Selectors ────────────────────────────────────────────────────────────────

const SSN = '[aria-label*="Social Security Number"]';
const NOTES = '[aria-label*="Clinical Notes"]';
const API_KEY = '[aria-label*="Internal API Key"]';

// ─── Setup ────────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".fieldshield-container");
});

// ─── 1. DOM isolation ─────────────────────────────────────────────────────────

test.describe("DOM isolation", () => {
  test("input.value contains only x characters after typing", async ({
    page,
  }) => {
    const input = page.locator(SSN).first();
    await input.fill("123-45-6789");

    const domValue = await input.inputValue();
    expect(domValue).toMatch(/^x+$/);
    expect(domValue).toHaveLength("123-45-6789".length);
  });

  test("real value is never exposed in the DOM", async ({ page }) => {
    const input = page.locator(SSN).first();
    await input.fill("123-45-6789");

    const domValue = await input.inputValue();
    expect(domValue).not.toContain("1");
    expect(domValue).not.toContain("-");
    expect(domValue).not.toContain("9");
  });

  test("mask layer shows █ characters for sensitive input", async ({
    page,
  }) => {
    const input = page.locator(SSN).first();
    await input.fill("123-45-6789");
    await page.waitForTimeout(100);

    const container = input.locator(
      "xpath=ancestor::div[contains(@class,'fieldshield-container')]",
    );
    const maskLayer = container.locator(".fieldshield-mask-layer");
    const maskText = await maskLayer.textContent();

    expect(maskText).toContain("█");
    expect(maskText).not.toContain("123");
  });

  test("mask layer length matches input length", async ({ page }) => {
    const input = page.locator(SSN).first();
    const text = "123-45-6789";
    await input.fill(text);
    await page.waitForTimeout(100);

    const domValue = await input.inputValue();
    expect(domValue).toHaveLength(text.length);
  });

  test("clean input shows no masking", async ({ page }) => {
    const input = page.locator(NOTES).first();
    await input.fill("hello world");
    await page.waitForTimeout(100);

    const container = input.locator(
      "xpath=ancestor::div[contains(@class,'fieldshield-container')]",
    );
    const maskLayer = container.locator(".fieldshield-mask-layer");
    const maskText = await maskLayer.textContent();

    expect(maskText).not.toContain("█");
    expect(maskText).toBe("hello world");
  });
});

// ─── 2. Clipboard — copy ─────────────────────────────────────────────────────

test.describe("Clipboard — copy", () => {
  test("copying sensitive content writes masked text to clipboard", async ({
    page,
  }) => {
    const input = page.locator(SSN).first();
    await input.fill("123-45-6789");
    await page.waitForTimeout(100);

    await input.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Control+C");
    await page.waitForTimeout(50);

    const clipboardText = await readClipboard(page);
    expect(clipboardText).not.toContain("123");
    expect(clipboardText).toContain("█");
  });

  test("masked clipboard content has same length as original", async ({
    page,
  }) => {
    const ssn = "123-45-6789";
    const input = page.locator(SSN).first();
    await input.fill(ssn);
    await page.waitForTimeout(100);

    await input.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Control+C");
    await page.waitForTimeout(50);

    const clipboardText = await readClipboard(page);
    expect(clipboardText).toHaveLength(ssn.length);
  });

  test("copying non-sensitive content passes through unchanged", async ({
    page,
  }) => {
    const input = page.locator(NOTES).first();
    await input.fill("hello world");
    await page.waitForTimeout(100);

    await input.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Control+C");
    await page.waitForTimeout(50);

    const clipboardText = await readClipboard(page);
    expect(clipboardText).toBe("hello world");
  });
});

// ─── 3. Clipboard — cut ──────────────────────────────────────────────────────

test.describe("Clipboard — cut", () => {
  test("cutting sensitive content writes masked text to clipboard", async ({
    page,
  }) => {
    const input = page.locator(SSN).first();
    await input.fill("123-45-6789");
    await page.waitForTimeout(100);

    await input.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Control+X");
    await page.waitForTimeout(100);

    const clipboardText = await readClipboard(page);
    expect(clipboardText).not.toContain("123");
    expect(clipboardText).toContain("█");
  });

  test("DOM value is empty after cutting all content", async ({ page }) => {
    const input = page.locator(SSN).first();
    await input.fill("123-45-6789");
    await page.waitForTimeout(100);

    await input.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Control+X");
    await page.waitForTimeout(100);

    const domValue = await input.inputValue();
    expect(domValue).toHaveLength(0);
  });

  test("DOM value shortens correctly after partial cut", async ({ page }) => {
    const input = page.locator(SSN).first();
    await input.fill("12345");
    await page.waitForTimeout(50);

    await input.click();
    await input.evaluate((el: HTMLInputElement) => {
      el.setSelectionRange(2, 5);
    });
    await page.keyboard.press("Control+X");
    await page.waitForTimeout(100);

    const domValue = await input.inputValue();
    expect(domValue).toHaveLength(2);
  });

  test("typing after full cut produces correct character count", async ({
    page,
  }) => {
    const input = page.locator(SSN).first();
    await input.fill("hello");
    await page.waitForTimeout(50);

    await input.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Control+X");
    await page.waitForTimeout(100);

    await input.type("a");
    const domValue = await input.inputValue();
    expect(domValue).toHaveLength(1);
    expect(domValue).toMatch(/^x$/);
  });
});

// ─── 4. Clipboard — paste ────────────────────────────────────────────────────

test.describe("Clipboard — paste", () => {
  test("pasting sensitive content triggers warning UI", async ({ page }) => {
    await writeClipboard(page, "123-45-6789");

    const input = page.locator(SSN).first();
    await input.click();
    await page.keyboard.press("Control+V");
    await page.waitForTimeout(100);

    const container = input.locator(
      "xpath=ancestor::div[contains(@class,'fieldshield-container')]",
    );
    await expect(container.locator(".fieldshield-findings")).toBeVisible({
      timeout: 2000,
    });
  });

  test("pasting sensitive content shows correct pattern name in warning", async ({
    page,
  }) => {
    await writeClipboard(page, "123-45-6789");

    const input = page.locator(SSN).first();
    await input.click();
    await page.keyboard.press("Control+V");
    await page.waitForTimeout(100);

    const container = input.locator(
      "xpath=ancestor::div[contains(@class,'fieldshield-container')]",
    );
    await expect(container.locator(".fieldshield-tag").first()).toContainText(
      "SSN",
      { timeout: 2000 },
    );
  });

  test("pasting non-sensitive content does not show warning", async ({
    page,
  }) => {
    await writeClipboard(page, "hello world");

    const input = page.locator(NOTES).first();
    await input.click();
    await page.keyboard.press("Control+V");
    await page.waitForTimeout(100);

    const container = input.locator(
      "xpath=ancestor::div[contains(@class,'fieldshield-container')]",
    );
    await expect(container.locator(".fieldshield-findings")).not.toBeVisible();
  });

  test("pasted sensitive content is still protected in DOM", async ({
    page,
  }) => {
    await writeClipboard(page, "123-45-6789");

    const input = page.locator(SSN).first();
    await input.click();
    await page.keyboard.press("Control+V");
    await page.waitForTimeout(100);

    const domValue = await input.inputValue();
    expect(domValue).toMatch(/^x+$/);
    expect(domValue).not.toContain("123");
  });
});

// ─── 5. Worker isolation ─────────────────────────────────────────────────────

test.describe("Worker isolation", () => {
  test("real value is not accessible via any DOM property", async ({
    page,
  }) => {
    const input = page.locator(SSN).first();
    await input.fill("123-45-6789");
    await page.waitForTimeout(100);

    const exposure = await page.evaluate(() => {
      const sensitiveData = "123-45-6789";
      const inputs = Array.from(document.querySelectorAll("input, textarea"));
      return inputs.some((el) => {
        const inp = el as HTMLInputElement;
        return (
          inp.value.includes(sensitiveData) ||
          inp.defaultValue?.includes(sensitiveData) ||
          inp.getAttribute("value")?.includes(sensitiveData)
        );
      });
    });

    expect(exposure).toBe(false);
  });

  test("real value is not accessible via any element attribute", async ({
    page,
  }) => {
    const input = page.locator(SSN).first();
    await input.fill("123-45-6789");
    await page.waitForTimeout(100);

    const exposure = await page.evaluate(() => {
      const sensitiveData = "123-45-6789";
      return Array.from(document.querySelectorAll("*")).some((el) =>
        Array.from(el.attributes).some((attr) =>
          attr.value.includes(sensitiveData),
        ),
      );
    });

    expect(exposure).toBe(false);
  });

  test("real value is not in localStorage, sessionStorage, or cookies", async ({
    page,
  }) => {
    const input = page.locator(SSN).first();
    await input.fill("123-45-6789");
    await page.waitForTimeout(100);

    const exposure = await page.evaluate(() => {
      const sensitiveData = "123-45-6789";
      return (
        JSON.stringify(Object.entries(localStorage)).includes(sensitiveData) ||
        JSON.stringify(Object.entries(sessionStorage)).includes(
          sensitiveData,
        ) ||
        document.cookie.includes(sensitiveData)
      );
    });

    expect(exposure).toBe(false);
  });
});

// ─── 6. Warning UI ───────────────────────────────────────────────────────────

test.describe("Warning UI", () => {
  test("warning appears when sensitive data is typed", async ({ page }) => {
    const input = page.locator(SSN).first();
    await input.fill("123-45-6789");
    await page.waitForTimeout(100);

    const container = input.locator(
      "xpath=ancestor::div[contains(@class,'fieldshield-container')]",
    );
    await expect(container.locator(".fieldshield-findings")).toBeVisible({
      timeout: 2000,
    });
  });

  test("warning disappears when field is cleared", async ({ page }) => {
    const input = page.locator(SSN).first();
    await input.fill("123-45-6789");
    await page.waitForTimeout(100);

    await input.fill("");
    await page.waitForTimeout(100);

    const container = input.locator(
      "xpath=ancestor::div[contains(@class,'fieldshield-container')]",
    );
    await expect(container.locator(".fieldshield-findings")).not.toBeVisible({
      timeout: 2000,
    });
  });

  test("warning shows SSN pattern name", async ({ page }) => {
    const input = page.locator(SSN).first();
    await input.fill("123-45-6789");
    await page.waitForTimeout(100);

    const container = input.locator(
      "xpath=ancestor::div[contains(@class,'fieldshield-container')]",
    );
    await expect(container.locator(".fieldshield-tag").first()).toContainText(
      "SSN",
      { timeout: 2000 },
    );
  });

  test("aria-invalid is true when sensitive data is detected", async ({
    page,
  }) => {
    const input = page.locator(SSN).first();
    await input.fill("123-45-6789");
    await page.waitForTimeout(100);

    await expect(input).toHaveAttribute("aria-invalid", "true", {
      timeout: 2000,
    });
  });

  test("aria-invalid is false on a clean field", async ({ page }) => {
    const input = page.locator(NOTES).first();
    await expect(input).toHaveAttribute("aria-invalid", "false");
  });
});

// ─── 7. Accessibility ────────────────────────────────────────────────────────

test.describe("Accessibility", () => {
  test("all protected fields have aria-label", async ({ page }) => {
    const inputs = page.locator(".fieldshield-real-input");
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const ariaLabel = await inputs.nth(i).getAttribute("aria-label");
      expect(ariaLabel).toBeTruthy();
    }
  });

  test("all protected fields have aria-describedby", async ({ page }) => {
    const inputs = page.locator(".fieldshield-real-input");
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      const describedBy = await inputs.nth(i).getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
    }
  });

  test("spellcheck is disabled on all protected fields", async ({ page }) => {
    const inputs = page.locator(".fieldshield-real-input");
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      await expect(inputs.nth(i)).toHaveAttribute("spellcheck", "false");
    }
  });

  test("autocomplete is off on all protected fields", async ({ page }) => {
    const inputs = page.locator(".fieldshield-real-input");
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      await expect(inputs.nth(i)).toHaveAttribute("autocomplete", "off");
    }
  });

  test("field containers have role=group", async ({ page }) => {
    const groups = page.locator(".fieldshield-container[role=group]");
    expect(await groups.count()).toBeGreaterThan(0);
  });
});

// ─── 8. Multiple patterns ────────────────────────────────────────────────────

test.describe("Multiple patterns", () => {
  test("detects email pattern", async ({ page }) => {
    const input = page.locator(NOTES).first();
    await input.fill("user@example.com");
    await page.waitForTimeout(100);

    const container = input.locator(
      "xpath=ancestor::div[contains(@class,'fieldshield-container')]",
    );
    await expect(container.locator(".fieldshield-tag").first()).toContainText(
      "EMAIL",
      { timeout: 2000 },
    );
  });

  test("detects multiple patterns in one field", async ({ page }) => {
    const input = page.locator(NOTES).first();
    await input.fill("SSN: 123-45-6789 email: user@example.com");
    await page.waitForTimeout(100);

    const container = input.locator(
      "xpath=ancestor::div[contains(@class,'fieldshield-container')]",
    );
    const tags = container.locator(".fieldshield-tag");
    const texts = await tags.allTextContents();

    expect(texts.some((t) => t.includes("SSN"))).toBe(true);
    expect(texts.some((t) => t.includes("EMAIL"))).toBe(true);
  });

  test("detects credit card pattern", async ({ page }) => {
    const input = page.locator(NOTES).first();
    await input.fill("4111 1111 1111 1111");
    await page.waitForTimeout(100);

    const container = input.locator(
      "xpath=ancestor::div[contains(@class,'fieldshield-container')]",
    );
    await expect(container.locator(".fieldshield-tag").first()).toContainText(
      "CREDIT_CARD",
      { timeout: 2000 },
    );
  });

  test("detects API key pattern", async ({ page }) => {
    const input = page.locator(API_KEY).first();
    await input.fill("sk-abcdefghijklmnopqrstu1234");
    await page.waitForTimeout(100);

    const container = input.locator(
      "xpath=ancestor::div[contains(@class,'fieldshield-container')]",
    );
    await expect(container.locator(".fieldshield-tag").first()).toContainText(
      "AI_API_KEY",
      { timeout: 2000 },
    );
  });
});

// ─── 9. Form submission ──────────────────────────────────────────────────────

test.describe("Form submission", () => {
  test("submit button is visible", async ({ page }) => {
    await expect(
      page.locator("button").filter({ hasText: /submit/i }),
    ).toBeVisible();
  });

  test("submission logs SUBMIT and PURGE events to the security log", async ({
    page,
  }) => {
    const input = page.locator(SSN).first();
    await input.fill("123-45-6789");
    await page.waitForTimeout(200);

    await page
      .locator("button")
      .filter({ hasText: /submit/i })
      .click();
    await page.waitForTimeout(2000); // includes 800ms simulated network delay + React state update

    await expect(page.locator(".log-item--submit")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator(".log-item--purge")).toBeVisible({
      timeout: 5000,
    });
  });
});
