import { NextResponse } from "next/server";

/**
 * POST /api/lead
 *
 * Registration-gate lead pipe. A first-time visitor submits name + email +
 * phone through the one-time gate (see components/LeadGate.tsx). Dual-write:
 *
 *   1. Airtable (primary, always-on) — appends a row to the shared "Website
 *      Leads" table in the Hotels CRE base. Authoritative log of every lead.
 *   2. HubSpot (best-effort) — creates/updates a Contact in HubSpot CRM tagged
 *      `website_lead_source = "TX Hotel RevPAR Intelligence"`. Skipped
 *      gracefully when no HUBSPOT_TOKEN is configured or the tier cap is hit;
 *      Airtable still records the lead and we log the HubSpot status.
 *
 * The client gets a success response as long as Airtable accepted the lead.
 *
 * Env vars (set as Sensitive in Vercel):
 *   AIRTABLE_PAT         — Airtable Personal Access Token
 *   AIRTABLE_BASE_ID     — Airtable base id (appXXXX...)
 *   AIRTABLE_LEADS_TABLE — table name, default "Website Leads"
 *   HUBSPOT_TOKEN        — HubSpot Private App token (optional; dormant until set)
 */

type LeadPayload = {
  name: string;
  email: string;
  phone: string;
  pageUri?: string;
};

const HUBSPOT_CONTACTS_ENDPOINT =
  "https://api.hubapi.com/crm/v3/objects/contacts";
const HUBSPOT_TASKS_ENDPOINT = "https://api.hubapi.com/crm/v3/objects/tasks";
const LEAD_SOURCE_LABEL = "TX Hotel RevPAR Intelligence";

// Owners who get an instant HubSpot notification when a new visitor registers.
// A task assigned to each fires that owner's task-assignment notification.
// Nate = 87647669, Luke = 74418463.
const NOTIFY_OWNER_IDS = ["87647669", "74418463"];
// Default HUBSPOT_DEFINED association type id for Task -> Contact.
const TASK_TO_CONTACT_ASSOC_TYPE = 204;

function bad(status: number, error: string, code?: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/** "Jane Q Public" → { firstName: "Jane", lastName: "Q Public" }. */
function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: name.trim(), lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

type HubSpotStatus = "Synced" | "Skipped (cap)" | "Error";

type HubSpotResult = { status: HubSpotStatus; contactId: string | null };

async function sendToHubSpot(payload: LeadPayload): Promise<HubSpotResult> {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) return { status: "Skipped (cap)", contactId: null };

  const { firstName, lastName } = splitName(payload.name);
  const body = {
    properties: {
      email: payload.email,
      firstname: firstName,
      lastname: lastName,
      ...(payload.phone ? { phone: payload.phone } : {}),
      website_lead_source: LEAD_SOURCE_LABEL,
      hs_lead_status: "NEW",
    },
  };

  try {
    const res = await fetch(HUBSPOT_CONTACTS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 409) {
      // Existing contact → look it up and patch.
      const search = await fetch(`${HUBSPOT_CONTACTS_ENDPOINT}/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                { propertyName: "email", operator: "EQ", value: payload.email },
              ],
            },
          ],
          limit: 1,
        }),
      });
      const sj = (await search.json()) as { results?: { id: string }[] };
      const id = sj.results?.[0]?.id ?? null;
      if (id) {
        await fetch(`${HUBSPOT_CONTACTS_ENDPOINT}/${id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      }
      return { status: "Synced", contactId: id };
    }

    if (res.status === 402) return { status: "Skipped (cap)", contactId: null };
    if (!res.ok) {
      console.error("[lead] hubspot non-OK", res.status, await res.text());
      return { status: "Error", contactId: null };
    }
    const created = (await res.json()) as { id?: string };
    return { status: "Synced", contactId: created.id ?? null };
  } catch (err) {
    console.error("[lead] hubspot fetch threw", err);
    return { status: "Error", contactId: null };
  }
}

/**
 * Instant-notification pipe. Creates one HubSpot task per owner in
 * NOTIFY_OWNER_IDS, each associated to the freshly-created contact and due now,
 * so every owner gets HubSpot's task-assignment notification the moment a
 * visitor registers. Best-effort: failures are logged, never block the lead.
 */
async function notifyOwners(
  token: string,
  contactId: string,
  payload: LeadPayload
): Promise<void> {
  const now = Date.now();
  const detail = [
    `${payload.name} just registered on the ${LEAD_SOURCE_LABEL} site.`,
    `Email: ${payload.email}`,
    payload.phone ? `Phone: ${payload.phone}` : "",
    payload.pageUri ? `Page: ${payload.pageUri}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await Promise.all(
    NOTIFY_OWNER_IDS.map(async (ownerId) => {
      try {
        const res = await fetch(HUBSPOT_TASKS_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            properties: {
              hs_task_subject: `New website lead: ${payload.name}`,
              hs_task_body: detail,
              hs_task_status: "NOT_STARTED",
              hs_task_priority: "HIGH",
              hs_task_type: "TODO",
              hs_timestamp: String(now),
              hubspot_owner_id: ownerId,
            },
            associations: [
              {
                to: { id: contactId },
                types: [
                  {
                    associationCategory: "HUBSPOT_DEFINED",
                    associationTypeId: TASK_TO_CONTACT_ASSOC_TYPE,
                  },
                ],
              },
            ],
          }),
        });
        if (!res.ok) {
          console.error(
            "[lead] task create non-OK",
            ownerId,
            res.status,
            await res.text()
          );
        }
      } catch (err) {
        console.error("[lead] task create threw", ownerId, err);
      }
    })
  );
}

async function sendToAirtable(
  payload: LeadPayload,
  hubspotStatus: HubSpotStatus
): Promise<{ ok: boolean; error?: string }> {
  const pat = process.env.AIRTABLE_PAT;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_LEADS_TABLE || "TX RevPAR Leads";

  if (!pat || !baseId) return { ok: false, error: "Airtable not configured." };

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(
    tableName
  )}`;
  const fields: Record<string, string> = {
    Name: payload.name.trim(),
    Email: payload.email,
    Topic: "App access",
    "Submitted At": new Date().toISOString(),
    Source: LEAD_SOURCE_LABEL,
    "HubSpot Status": hubspotStatus,
  };
  if (payload.phone) fields["Phone"] = payload.phone;
  if (payload.pageUri) fields["Page URL"] = payload.pageUri;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields, typecast: true }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[lead] airtable non-OK", res.status, text);
      return { ok: false, error: `Airtable returned ${res.status}.` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[lead] airtable fetch threw", err);
    return { ok: false, error: "Could not reach Airtable." };
  }
}

export async function POST(req: Request) {
  let body: Partial<LeadPayload>;
  try {
    body = await req.json();
  } catch {
    return bad(400, "Invalid JSON body.");
  }

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim();
  const phone = (body.phone ?? "").trim();
  const pageUri = body.pageUri;

  if (!name || !email || !phone) {
    return bad(400, "Name, email and phone are required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return bad(400, "Please enter a valid email address.");
  }
  if (phone.replace(/\D/g, "").length < 7) {
    return bad(400, "Please enter a valid phone number.");
  }

  const payload: LeadPayload = { name, email, phone, pageUri };

  // HubSpot first so Airtable can log its status.
  const hubspot = await sendToHubSpot(payload);

  // Instant notification: ping the owners the moment the contact exists.
  const token = process.env.HUBSPOT_TOKEN;
  if (token && hubspot.contactId) {
    await notifyOwners(token, hubspot.contactId, payload);
  }

  const airtable = await sendToAirtable(payload, hubspot.status);

  if (!airtable.ok) {
    return bad(502, airtable.error || "Could not save your details.", "SINKS_FAILED");
  }

  return NextResponse.json({
    ok: true,
    sinks: { airtable: "ok", hubspot: hubspot.status },
  });
}
