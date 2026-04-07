/**
 * @file index.ts
 * @description Public API barrel for the FieldShield library.
 *
 * Import from "fieldshield" to access all public components, hooks,
 * utilities, types, and built-in patterns.
 *
 * @example
 * ```tsx
 * import { FieldShieldInput, FIELDSHIELD_PATTERNS, collectSecureValues } from "fieldshield";
 * ```
 *
 * @module fieldshield
 */

// ─── Component ────────────────────────────────────────────────────────────────
export { FieldShieldInput } from "./components/FieldShieldInput";
export type {
  FieldShieldHandle,
  FieldShieldInputProps,
  SensitiveClipboardEvent,
} from "./components/FieldShieldInput";

// ─── Hooks ────────────────────────────────────────────────────────────────────
export { useFieldShield } from "./hooks/useFieldShield";
export type { CustomPattern, UseFieldShieldReturn } from "./hooks/useFieldShield";

export { useSecurityLog } from "./hooks/useSecurityLog";
export type {
  SecurityEvent,
  SecurityEventType,
  UseSecurityLogOptions,
  UseSecurityLogReturn,
} from "./hooks/useSecurityLog";

// ─── Utilities ────────────────────────────────────────────────────────────────
export { collectSecureValues, purgeSecureValues } from "./utils/collectSecureValue";
export type { FieldShieldRefMap, SecureValues } from "./utils/collectSecureValue";

// ─── Patterns ─────────────────────────────────────────────────────────────────
export { FIELDSHIELD_PATTERNS, OPT_IN_PATTERNS } from "./patterns";
