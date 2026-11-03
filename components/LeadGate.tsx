"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { APP_NAME, FIRST_RUN_ACK } from "@/lib/disclaimer";
import { markActivityBaseline } from "@/lib/activity";

const STORAGE_KEY = "txrevpar.lead.v1";
const RESEND_SECONDS = 30;

const INPUT_CLS =
  "transition-base h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-subtle focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

type Field = "name" | "email" | "phone";
type Step = "details" | "code";
type Verify = { code: string; token: string };

/**
 * One-time registration wall. First-time visitors submit name/email/phone and
 * acknowledge the estimates disclaimer before the app is usable.
 *
 * When email verification is configured on the server (see lib/verify.ts),
 * /api/verify emails a 6-digit code and the gate asks for it before the lead
 * is POSTed to /api/lead (Airtable + HubSpot). When it isn't configured, or the
 * code email can't be sent, the gate submits the lead directly.
 *
 * Fail-open: apart from a wrong/expired code, no backend error ever blocks a
 * visitor. On success a flag in localStorage suppresses the gate on future
 * visits from this browser.
 */
export default function LeadGate() {
  // `null` = still checking storage (render nothing to avoid a flash of the
  // gate for already-registered users). `true`/`false` = show/hide the gate.
  const [open, setOpen] = useState<boolean | null>(null);
  const [values, setValues] = useState({ name: "", email: "", phone: "" });
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<Step>("details");
  const [code, setCode] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    let registered = false;
    try {
      registered = localStorage.getItem(STORAGE_KEY) != null;
    } catch {
      registered = false;
    }
    setOpen(!registered);
  }, []);

  useEffect(() => {
    if (open) {
      // Lock background scroll and focus the first field.
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      nameRef.current?.focus();
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  if (!open) return null;

  const set = (f: Field, v: string) =>
    setValues((prev) => ({ ...prev, [f]: v }));

  function validateDetails(): string | null {
    const name = values.name.trim();
    const email = values.email.trim();
    const phone = values.phone.trim();
    if (!name) return "Please enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return "Please enter a valid email address.";
    if (phone.replace(/\D/g, "").length < 7)
      return "Please enter a valid phone number.";
    if (!agree) return "Please acknowledge the notice to continue.";
    return null;
  }

  // Step 1: details. Ask the server for an email code; if verification is off
  // (or the code email can't be sent) go straight to recording the lead.
  async function submitDetails(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const invalid = validateDetails();
    if (invalid) return setError(invalid);

    setSubmitting(true);
    let res: Response;
    let data: { enabled?: boolean; token?: string; error?: string } = {};
    try {
      res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email.trim(),
          name: values.name.trim(),
        }),
      });
      data = await res.json().catch(() => ({}));
    } catch {
      // Network/backend issue: fail open.
      await finish(undefined);
      return;
    }

    if (res.status === 400 || res.status === 429) {
      setError(data.error || "Please try again.");
      setSubmitting(false);
      return;
    }
    if (!res.ok || !data.enabled || !data.token) {
      await finish(undefined);
      return;
    }

    setToken(data.token);
    setCode("");
    setStep("code");
    setCooldown(RESEND_SECONDS);
    setSubmitting(false);
    setTimeout(() => codeRef.current?.focus(), 50);
  }

  // Step 2: the 6-digit code from the email.
  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code.trim()))
      return setError("Please enter the 6-digit code from your email.");
    setSubmitting(true);
    await finish({ code: code.trim(), token: token ?? "" });
  }

  // Record the lead and open the app. Only a rejected code keeps the gate up;
  // any other backend hiccup (Airtable/HubSpot unconfigured or down) must NEVER
  // block a visitor once client-side validation has passed.
  async function finish(verify: Verify | undefined) {
    const name = values.name.trim();
    const email = values.email.trim();
    const phone = values.phone.trim();

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          verify,
          pageUri:
            typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });
      if (res.status === 400) {
        const j = (await res.json().catch(() => ({}))) as {
          code?: string;
          error?: string;
        };
        if (j.code === "verify_invalid") {
          setError(j.error || "That code is not right. Please try again.");
          setSubmitting(false);
          return;
        }
      }
    } catch {
      /* network/backend issue: non-fatal, still let the visitor in */
    }

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ email, at: new Date().toISOString() })
      );
    } catch {
      /* storage disabled: gate will re-show next visit, acceptable */
    }
    // Tell HubSpot who this visitor is so the anonymous tracking session (and
    // future pageviews) stitch to the contact we just created server-side.
    try {
      const w = window as unknown as { _hsq?: unknown[][] };
      const hsq = (w._hsq = w._hsq || []);
      hsq.push(["identify", { email, firstname: name }]);
      hsq.push(["trackPageView"]);
    } catch {
      /* tracking script not loaded yet: non-fatal */
    }
    // Registration already fired a "new lead" notification; suppress the
    // "active session" ping for this first visit so owners aren't double-pinged.
    markActivityBaseline();
    setOpen(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-gate-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md overflow-hidden rounded-panel bg-surface shadow-lg ring-1 ring-border">
        <div className="border-b border-border px-6 py-5">
          <div className="label-overline text-accent">{APP_NAME}</div>
          <h2
            id="lead-gate-title"
            className="text-display mt-1 text-foreground"
          >
            Before you start
          </h2>
          <p className="text-meta mt-2 text-muted-foreground">{FIRST_RUN_ACK}</p>
        </div>

        {step === "code" ? (
          <form onSubmit={submitCode} className="space-y-3 px-6 py-5" noValidate>
            <p className="text-meta text-muted-foreground">
              We emailed a 6-digit code to{" "}
              <span className="font-medium text-foreground">
                {values.email.trim()}
              </span>
              . Enter it below to continue.
            </p>
            <Labeled label="Verification code">
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${INPUT_CLS} text-center font-mono text-lg tracking-[0.4em]`}
                placeholder="000000"
              />
            </Labeled>

            {error && (
              <p role="alert" className="text-meta font-medium text-negative">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="transition-base mt-1 flex h-11 w-full items-center justify-center rounded-lg bg-ink text-sm font-semibold text-surface hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Verifying…" : "Verify & Continue"}
            </button>
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  setStep("details");
                  setError(null);
                }}
                className="text-meta text-subtle underline underline-offset-2 hover:text-foreground"
              >
                Use a different email
              </button>
              <button
                type="button"
                disabled={cooldown > 0 || submitting}
                onClick={() => submitDetails()}
                className="text-meta text-accent underline underline-offset-2 hover:opacity-80 disabled:no-underline disabled:opacity-50"
              >
                {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitDetails} className="space-y-3 px-6 py-5" noValidate>
            <Labeled label="Name">
              <input
                ref={nameRef}
                type="text"
                autoComplete="name"
                required
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                className={INPUT_CLS}
                placeholder="Jane Smith"
              />
            </Labeled>
            <Labeled label="Email">
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={values.email}
                onChange={(e) => set("email", e.target.value)}
                className={INPUT_CLS}
                placeholder="jane@company.com"
              />
            </Labeled>
            <Labeled label="Phone">
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                value={values.phone}
                onChange={(e) => set("phone", e.target.value)}
                className={INPUT_CLS}
                placeholder="(555) 123-4567"
              />
            </Labeled>

            <label className="flex cursor-pointer items-start gap-2 pt-1">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-accent focus-visible:ring-2 focus-visible:ring-accent"
              />
              <span className="text-meta text-muted-foreground">
                I understand these are derived estimates, not official or
                property-reported figures, and not investment or professional
                advice. See the{" "}
                <Link
                  href="/about"
                  className="text-accent underline underline-offset-2 hover:opacity-80"
                >
                  About the Data
                </Link>{" "}
                page.
              </span>
            </label>

            {error && (
              <p role="alert" className="text-meta font-medium text-negative">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="transition-base mt-1 flex h-11 w-full items-center justify-center rounded-lg bg-ink text-sm font-semibold text-surface hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Agree & Continue"}
            </button>
            <p className="text-center text-[11px] text-subtle">
              All fields are required. We use your details to contact you about
              this data. No spam.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label-overline mb-1 block">{label}</span>
      {children}
    </label>
  );
}
