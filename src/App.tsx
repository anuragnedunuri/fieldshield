/**
 * @file App.tsx
 * @description Interactive demo application for FieldShield.
 *
 * Demonstrates:
 *   - Standard mode (DOM scrambling + overlay)
 *   - Accessibility mode (type="password" fallback)
 *   - Custom pattern detection
 *   - onSensitiveCopyAttempt callback → live security event log
 *   - onSensitivePaste callback → live security event log
 *   - getSecureValue() on form submission
 *   - purge() after submission
 */

import { useRef, useState } from "react";
import { FieldShieldInput } from "./lib/components/FieldShieldInput";
import type { FieldShieldHandle } from "./lib/components/FieldShieldInput";
import { useSecurityLog } from "./lib/hooks/useSecurityLog";
import type { SecurityEvent } from "./lib/hooks/useSecurityLog";
import {
  collectSecureValues,
  purgeSecureValues,
} from "./lib/utils/collectSecureValue";
import "./App.css";

// ─── Component ────────────────────────────────────────────────────────────────

export default function App() {
  const clinicalNotesRef = useRef<FieldShieldHandle>(null);
  const patientNotesRef = useRef<FieldShieldHandle>(null);
  const apiKeyRef = useRef<FieldShieldHandle>(null);
  const ssnRef = useRef<FieldShieldHandle>(null);

  const refs = {
    clinicalNotes: clinicalNotesRef,
    patientNotes: patientNotesRef,
    apiKey: apiKeyRef,
    ssn: ssnRef,
  };

  const { events, pushEvent, makeClipboardHandler } = useSecurityLog({
    maxEvents: 20,
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);

    const values = await collectSecureValues(refs);

    // Simulate a network request
    await new Promise((r) => setTimeout(r, 800));

    pushEvent({
      field: "All fields",
      type: "SUBMIT",
      findings: [],
      detail: `${Object.values(values)
        .filter(Boolean)
        .map((v) => `${v.length} chars`)
        .join(" · ")} retrieved securely`,
    });

    purgeSecureValues(refs);

    pushEvent({
      field: "All fields",
      type: "PURGE",
      findings: [],
      detail: "Worker memory zeroed",
    });

    setSubmitting(false);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <div className="app">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">⬡</span>
            <span className="logo-name">FieldShield</span>
            <span className="logo-badge">v1.0</span>
          </div>
          <p className="header-tagline">
            Sensitive input protection against DOM scraping, session recorders
            &amp; LLM clipboard exfiltration.
          </p>
        </div>
      </header>

      {/* ── Main layout ────────────────────────────────────────────────── */}
      <main className="app-main">
        {/* ── Left: demo form ── */}
        <section className="demo-panel">
          <div className="panel-header">
            <h2 className="panel-title">Patient Intake Form</h2>
            <span className="panel-subtitle">
              All fields are FieldShield-protected
            </span>
          </div>

          <div className="form-fields">
            {/* Clinical notes — TEXTAREA, standard mode */}
            <div className="field-group">
              <div className="field-meta">
                <span className="field-mode-badge">Textarea</span>
                <span className="field-hint">
                  Multi-line — try pasting a paragraph with an SSN inside
                </span>
              </div>
              <FieldShieldInput
                ref={clinicalNotesRef}
                label="Clinical Notes"
                type="textarea"
                placeholder="Enter clinical observations…"
                onSensitiveCopyAttempt={makeClipboardHandler("copy_cut")}
                onSensitivePaste={makeClipboardHandler("paste")}
              />
            </div>

            {/* Patient notes — standard mode, detects SSN / email / phone */}
            <div className="field-group">
              <div className="field-meta">
                <span className="field-mode-badge">Standard</span>
                <span className="field-hint">
                  Try typing or pasting an SSN (e.g.&nbsp;123-45-6789)
                </span>
              </div>
              <FieldShieldInput
                ref={patientNotesRef}
                label="Patient Notes"
                placeholder="Enter patient notes…"
                onSensitiveCopyAttempt={makeClipboardHandler("copy_cut")}
                onSensitivePaste={makeClipboardHandler("paste")}
              />
            </div>

            {/* SSN field — standard mode */}
            <div className="field-group">
              <div className="field-meta">
                <span className="field-mode-badge">Standard</span>
                <span className="field-hint">
                  Try typing&nbsp;
                  <code className="inline-code">123-45-6789</code>
                </span>
              </div>
              <FieldShieldInput
                ref={ssnRef}
                label="Social Security Number"
                placeholder="NNN-NN-NNNN"
                onSensitiveCopyAttempt={makeClipboardHandler("copy_cut")}
                onSensitivePaste={makeClipboardHandler("paste")}
              />
            </div>

            {/* API key — custom pattern + standard mode */}
            <div className="field-group">
              <div className="field-meta">
                <span className="field-mode-badge field-mode-badge--custom">
                  Custom pattern
                </span>
                <span className="field-hint">
                  Try pasting&nbsp;
                  <code className="inline-code">sk-abc123…</code>&nbsp;or an
                  email
                </span>
              </div>
              <FieldShieldInput
                ref={apiKeyRef}
                label="Internal API Key / Employee ID"
                placeholder="EMP-000000 or sk-…"
                customPatterns={[{ name: "EMPLOYEE_ID", regex: "EMP-\\d{6}" }]}
                onSensitiveCopyAttempt={makeClipboardHandler("copy_cut")}
                onSensitivePaste={makeClipboardHandler("paste")}
              />
            </div>

            {/* A11y mode demo */}
            <div className="field-group">
              <div className="field-meta">
                <span className="field-mode-badge field-mode-badge--a11y">
                  A11y mode
                </span>
                <span className="field-hint">
                  WCAG 2.1 AA — uses native{" "}
                  <code className="inline-code">type=&quot;password&quot;</code>
                </span>
              </div>
              <FieldShieldInput
                label="Emergency Contact SSN"
                placeholder="NNN-NN-NNNN"
                a11yMode
                onSensitiveCopyAttempt={makeClipboardHandler("copy_cut")}
              />
            </div>
          </div>

          {/* Submit */}
          <div className="form-actions">
            <button
              className={`submit-btn ${submitting ? "submit-btn--loading" : ""} ${submitted ? "submit-btn--success" : ""}`}
              onClick={handleSubmit}
              disabled={submitting || submitted}
            >
              {submitting ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  Retrieving securely…
                </>
              ) : submitted ? (
                <>✓ Submitted &amp; purged</>
              ) : (
                "Submit & purge memory"
              )}
            </button>
            <p className="submit-hint">
              Calls <code className="inline-code">getSecureValue()</code> on
              each field, then <code className="inline-code">purge()</code>.
            </p>
          </div>
        </section>

        {/* ── Right: security event log ── */}
        <aside className="log-panel">
          <div className="log-header">
            <span className="log-title">Security Event Log</span>
            <span className="log-count">{events.length}</span>
          </div>

          {events.length === 0 ? (
            <div className="log-empty">
              <span className="log-empty-icon">◎</span>
              <span>No events yet — try typing or copying sensitive data.</span>
            </div>
          ) : (
            <ol className="log-list" aria-label="Security events">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className={`log-item log-item--${ev.type.toLowerCase().replace("_", "-")}`}
                >
                  <div className="log-item-row">
                    <span
                      className={`log-type-badge log-type-badge--${ev.type.toLowerCase().replace("_", "-")}`}
                    >
                      {eventLabel(ev.type)}
                    </span>
                    <span className="log-time">{ev.timestamp}</span>
                  </div>
                  <div className="log-field">{ev.field}</div>
                  {ev.findings.length > 0 && (
                    <div className="log-findings">
                      {ev.findings.map((f) => (
                        <span key={f} className="log-finding-tag">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                  {ev.detail && <div className="log-detail">{ev.detail}</div>}
                </li>
              ))}
            </ol>
          )}
        </aside>
      </main>

      {/* ── Threat model footer ─────────────────────────────────────────── */}
      <footer className="app-footer">
        <div className="threat-grid">
          <ThreatCard
            icon="🛡"
            label="DOM Scraping"
            status="blocked"
            detail="Extensions reading input.value see only x characters"
          />
          <ThreatCard
            icon="📹"
            label="Session Recorders"
            status="blocked"
            detail="FullStory, LogRocket capture the scrambled overlay only"
          />
          <ThreatCard
            icon="🤖"
            label="LLM Clipboard"
            status="blocked"
            detail="Copy/cut writes masked text — real value never reaches clipboard"
          />
          <ThreatCard
            icon="⚠️"
            label="Kernel Keyloggers"
            status="out-of-scope"
            detail="OS-level access is outside the browser security boundary"
          />
        </div>
      </footer>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ThreatCard({
  icon,
  label,
  status,
  detail,
}: {
  icon: string;
  label: string;
  status: "blocked" | "out-of-scope";
  detail: string;
}) {
  return (
    <div className={`threat-card threat-card--${status}`}>
      <span className="threat-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="threat-body">
        <div className="threat-label">
          {label}
          <span className={`threat-status threat-status--${status}`}>
            {status === "blocked" ? "Protected" : "Out of scope"}
          </span>
        </div>
        <p className="threat-detail">{detail}</p>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function eventLabel(type: SecurityEvent["type"]): string {
  switch (type) {
    case "COPY_BLOCKED":
      return "Copy blocked";
    case "CUT_BLOCKED":
      return "Cut blocked";
    case "PASTE_DETECTED":
      return "Paste detected";
    case "SUBMIT":
      return "Submitted";
    case "PURGE":
      return "Memory purged";
    default:
      throw new Error(`[FieldShield] Unhandled event type: ${type as string}`);
  }
}
