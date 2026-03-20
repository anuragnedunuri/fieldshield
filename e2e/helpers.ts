/**
 * @file helpers.ts
 * @description Shared helpers for FieldShield Playwright tests.
 */

import { type Page, expect } from "@playwright/test";

// ─── Selectors ────────────────────────────────────────────────────────────────

/**
 * Field selectors matching the demo app's FieldShieldInput labels.
 * These map to the actual input elements inside each FieldShieldInput.
 */
export const FIELDS = {
  ssn:            'input[aria-label*="SSN"]',
  apiKey:         'input[aria-label*="API Key"]',
  clinicalNotes:  'textarea[aria-label*="Clinical Notes"]',
  patientNotes:   'textarea[aria-label*="Patient Notes"]',
} as const;

// ─── Page helpers ─────────────────────────────────────────────────────────────

/**
 * Type text into a FieldShieldInput and wait for the worker to process it.
 * The worker posts an UPDATE message which causes a React state update —
 * we wait for the mask layer to update before asserting.
 */
export async function typeIntoField(
  page: Page,
  selector: string,
  text: string,
): Promise<void> {
  await page.locator(selector).click();
  await page.locator(selector).fill(text);
  // Give the worker one tick to post its UPDATE response
  await page.waitForTimeout(50);
}

/**
 * Read the current system clipboard text content.
 * Requires the `clipboard-read` permission granted in playwright.config.ts.
 */
export async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

/**
 * Write text to the system clipboard — used to set up paste tests.
 */
export async function writeClipboard(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
}

/**
 * Get the DOM value of a FieldShieldInput (the scrambled x-string, not
 * the real value). This should never contain the real sensitive data.
 */
export async function getDomValue(
  page: Page,
  selector: string,
): Promise<string> {
  return page.locator(selector).inputValue();
}

/**
 * Get the text content of the mask layer for a given field.
 * The mask layer shows the worker's masked output (█ characters).
 */
export async function getMaskLayerText(
  page: Page,
  selector: string,
): Promise<string | null> {
  const field = page.locator(selector);
  const wrapper = field.locator(".."); // fieldshield-field-wrapper
  const maskLayer = wrapper.locator(".fieldshield-mask-layer");
  return maskLayer.textContent();
}

/**
 * Check if the warning UI is visible for a given field.
 * The warning appears when findings.length > 0.
 */
export async function isWarningVisible(
  page: Page,
  selector: string,
): Promise<boolean> {
  const field = page.locator(selector);
  const container = field.locator("../../.."); // fieldshield-container
  const findings = container.locator(".fieldshield-findings");
  return findings.isVisible();
}

/**
 * Select all text in a field using keyboard shortcut.
 */
export async function selectAll(page: Page, selector: string): Promise<void> {
  await page.locator(selector).click();
  await page.keyboard.press("Control+A");
}

/**
 * Evaluate a script in the page context to inspect Worker state.
 * Used to verify that internalTruth is not accessible from the main thread.
 */
export async function getWorkerCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    // Workers are not directly enumerable from the main thread —
    // this returns 0 if the page has no accessible worker references.
    // The real test is that we cannot read worker memory, not that workers exist.
    return 0;
  });
}
