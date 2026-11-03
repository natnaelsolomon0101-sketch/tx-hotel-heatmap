import { NextResponse } from "next/server";
import {
  isVerifyEnabled,
  newCode,
  normalizeEmail,
  sendCodeEmail,
  signChallenge,
  verifySecret,
} from "@/lib/verify";

/**
 * POST /api/verify  { email, name }
 *
 * Step 1 of the registration gate's email check (see lib/verify.ts and
 * components/LeadGate.tsx). Emails a 6-digit code and returns a signed token
 * the gate sends back to /api/lead with the code.
 *
 * Responses:
 *   200 { ok, enabled: false }          verification not configured; the gate
 *                                       submits the lead directly (fail-open)
 *   200 { ok, enabled: true, token }    code emailed; gate shows the code step
 *   200 { ok, enabled: false, degraded } send failed; gate submits directly so
 *                                       a mail outage never locks visitors out
 *   400 / 429 { error }                 bad email / asked again too quickly
 */

const RESEND_COOLDOWN_MS = 25 * 1000;
// Best-effort, per-instance throttle so the endpoint can't be used to flood an
// inbox. Serverless instances don't share it; the gate's 30s resend timer is
// the main control for real users.
const lastSent = new Map<string, number>();

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  let body: { email?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Invalid JSON body.");
  }

  const email = (body.email ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return bad(400, "Please enter a valid email address.");
  }

  const secret = verifySecret();
  if (!isVerifyEnabled() || !secret) {
    return NextResponse.json({ ok: true, enabled: false });
  }

  const key = normalizeEmail(email);
  const now = Date.now();
  const prev = lastSent.get(key);
  if (prev && now - prev < RESEND_COOLDOWN_MS) {
    return bad(429, "Please wait a few seconds before asking for another code.");
  }

  const code = newCode();
  const token = signChallenge(email, code, secret, now);
  try {
    await sendCodeEmail(email, code);
  } catch (err) {
    console.error("[verify] send failed, letting the visitor through", err);
    return NextResponse.json({ ok: true, enabled: false, degraded: true });
  }

  lastSent.set(key, now);
  if (lastSent.size > 5000) lastSent.clear();
  console.log(`[verify] code sent email="${email}"`);
  return NextResponse.json({ ok: true, enabled: true, token });
}
