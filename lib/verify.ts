import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "crypto";
import { APP_NAME } from "./disclaimer";

/**
 * Email verification for the registration gate (server-only).
 *
 * Flow: POST /api/verify emails a 6-digit code and returns a signed token.
 * The gate then POSTs /api/lead with { verify: { code, token } } and the lead
 * route checks the code against the token before recording the lead.
 *
 * Stateless: the token carries the email and expiry, signed with HMAC over
 * (payload + code). Without the server secret a token cannot be forged and
 * the code cannot be recovered from it.
 *
 * Verification is OFF (the gate goes straight to /api/lead, as before) unless
 * both of these are set in the Vercel project:
 *   RESEND_API_KEY      Resend API key used to send the code email
 *   LEAD_VERIFY_FROM    sender, e.g. "Texas Hotel Data AI <verify@texashoteldata.ai>"
 *                       (the domain must be verified in Resend)
 * Optional:
 *   LEAD_VERIFY_SECRET  HMAC key for tokens; derived from RESEND_API_KEY if unset
 */

export const CODE_TTL_MS = 15 * 60 * 1000;
const TOKEN_VERSION = 1;

type TokenPayload = { v: number; e: string; x: number; n: string };

export type VerifyCheck =
  | { ok: true }
  | { ok: false; reason: "malformed" | "expired" | "email" | "code" };

export function isVerifyEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.LEAD_VERIFY_FROM);
}

export function verifySecret(): string | null {
  if (process.env.LEAD_VERIFY_SECRET) return process.env.LEAD_VERIFY_SECRET;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return createHash("sha256")
    .update(`tx-hotel-heatmap/lead-verify:${key}`)
    .digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function newCode(): string {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function sign(payloadB64: string, code: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${payloadB64}.${code}`)
    .digest("base64url");
}

/** Token for `code`, bound to `email`, valid for CODE_TTL_MS from `now`. */
export function signChallenge(
  email: string,
  code: string,
  secret: string,
  now: number = Date.now()
): string {
  const payload: TokenPayload = {
    v: TOKEN_VERSION,
    e: normalizeEmail(email),
    x: now + CODE_TTL_MS,
    n: randomBytes(9).toString("base64url"),
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64, code, secret)}`;
}

export function checkChallenge(
  email: string,
  code: string,
  token: string,
  secret: string,
  now: number = Date.now()
): VerifyCheck {
  const parts = (token || "").split(".");
  if (parts.length !== 2 || !/^\d{6}$/.test(code || "")) {
    return { ok: false, reason: "malformed" };
  }
  const [payloadB64, sig] = parts;
  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    !payload ||
    payload.v !== TOKEN_VERSION ||
    typeof payload.e !== "string" ||
    typeof payload.x !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }
  const expected = Buffer.from(sign(payloadB64, code, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "code" };
  }
  if (payload.e !== normalizeEmail(email)) return { ok: false, reason: "email" };
  if (now > payload.x) return { ok: false, reason: "expired" };
  return { ok: true };
}

/** Sends the code through Resend's HTTP API. Throws on any failure. */
export async function sendCodeEmail(to: string, code: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_VERIFY_FROM;
  if (!key || !from) throw new Error("verification email not configured");

  const minutes = Math.round(CODE_TTL_MS / 60000);
  const text =
    `Your ${APP_NAME} verification code is ${code}.\n\n` +
    `It expires in ${minutes} minutes. If you did not request it, you can ignore this email.\n\n` +
    `${APP_NAME}, powered by Matthews`;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111827;line-height:1.5">` +
    `<p>Your ${APP_NAME} verification code is:</p>` +
    `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</p>` +
    `<p>It expires in ${minutes} minutes. If you did not request it, you can ignore this email.</p>` +
    `<p style="color:#6b7280;font-size:13px">${APP_NAME}, powered by Matthews</p>` +
    `</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Your ${APP_NAME} code: ${code}`,
      text,
      html,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`resend ${res.status}: ${detail.slice(0, 300)}`);
  }
}
