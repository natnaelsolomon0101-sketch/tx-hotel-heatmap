// Client-side "active session" reporter. When a registered visitor (someone who
// cleared the lead gate) starts interacting with the map, we fire a single ping
// to /api/activity, which notifies the owners in HubSpot. Throttled to once per
// 30 min per browser so a busy session produces ONE notification, not dozens.

const LEAD_KEY = "txrevpar.lead.v1";
const ACTIVITY_KEY = "txrevpar.activity.v1";
const THROTTLE_MS = 30 * 60 * 1000; // 30 minutes

/** The registered visitor's email from the lead-gate record, or null if anon. */
function registeredEmail(): string | null {
  try {
    const raw = localStorage.getItem(LEAD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: string };
    return parsed.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Fire a one-per-session "active on the site" ping for a known visitor.
 * No-op for anonymous visitors and when pinged within the last 30 min. The
 * throttle window is claimed up front so concurrent handlers can't double-fire.
 * Best-effort and never throws.
 */
export function reportActivity(context?: string): void {
  if (typeof window === "undefined") return;
  const email = registeredEmail();
  if (!email) return;

  const now = Date.now();
  try {
    const last = Number(localStorage.getItem(ACTIVITY_KEY) || 0);
    if (now - last < THROTTLE_MS) return;
    localStorage.setItem(ACTIVITY_KEY, String(now));
  } catch {
    // storage unavailable — skip rather than risk repeated pings
    return;
  }

  try {
    // keepalive lets the request survive if they navigate away immediately.
    fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, context, pageUri: window.location.href }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * Suppress the "active session" ping for the next throttle window. Called right
 * after registration so a brand-new lead doesn't generate both a "new lead"
 * task and an "active session" task in the same visit.
 */
export function markActivityBaseline(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}
