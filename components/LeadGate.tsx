"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { APP_NAME, FIRST_RUN_ACK } from "@/lib/disclaimer";

const STORAGE_KEY = "txrevpar.lead.v1";

const INPUT_CLS =
  "transition-base h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-subtle focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

type Field = "name" | "email" | "phone";

/**
 * One-time registration wall. First-time visitors submit name/email/phone and
 * acknowledge the estimates disclaimer before the app is usable. The lead is
 * POSTed to /api/lead (Airtable + HubSpot) and, on success, a flag in
 * localStorage suppresses the gate on future visits from this browser.
 */
export default function LeadGate() {
  // `null` = still checking storage (render nothing to avoid a flash of the
  // gate for already-registered users). `true`/`false` = show/hide the gate.
  const [open, setOpen] = useState<boolean | null>(null);
  const [values, setValues] = useState({ name: "", email: "", phone: "" });
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const name = values.name.trim();
    const email = values.email.trim();
    const phone = values.phone.trim();

    if (!name) return setError("Please enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return setError("Please enter a valid email address.");
    if (phone.replace(/\D/g, "").length < 7)
      return setError("Please enter a valid phone number.");
    if (!agree) return setError("Please acknowledge the notice to continue.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          pageUri:
            typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Something went wrong. Please try again.");
      }
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ email, at: new Date().toISOString() })
        );
      } catch {
        /* storage disabled — gate will re-show next visit, acceptable */
      }
      // Tell HubSpot who this visitor is so the anonymous tracking session (and
      // future pageviews) stitch to the contact we just created server-side.
      try {
        const w = window as unknown as { _hsq?: unknown[][] };
        const hsq = (w._hsq = w._hsq || []);
        hsq.push(["identify", { email, firstname: name }]);
        hsq.push(["trackPageView"]);
      } catch {
        /* tracking script not loaded yet — non-fatal */
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
      setSubmitting(false);
    }
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

        <form onSubmit={submit} className="space-y-3 px-6 py-5" noValidate>
          <Labeled label="Name">
            <input
              ref={nameRef}
              type="text"
              autoComplete="name"
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
            We use your details to contact you about this data. No spam.
          </p>
        </form>
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
