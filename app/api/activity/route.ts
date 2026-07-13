import { NextResponse } from "next/server";

/**
 * POST /api/activity
 *
 * "Active session" signal. When a registered visitor starts interacting with
 * the map, the client (lib/activity.ts, throttled to 1/30min) posts their email
 * here. We look up the HubSpot contact and create a task for each notify-owner,
 * associated to that contact, so the owners get pinged that a known lead is back
 * on the site. Best-effort: unknown contacts and a missing token are quiet
 * no-ops; failures are logged and never surfaced to the visitor.
 *
 * Env: HUBSPOT_TOKEN — HubSpot Private App token with crm.objects.contacts.read
 * and crm.objects.tasks.write. Dormant (no-op) until set.
 */

const HUBSPOT_CONTACTS_ENDPOINT =
  "https://api.hubapi.com/crm/v3/objects/contacts";
const HUBSPOT_TASKS_ENDPOINT = "https://api.hubapi.com/crm/v3/objects/tasks";
const LEAD_SOURCE_LABEL = "TX Hotel RevPAR Intelligence";

// Owners notified when a known visitor is active. Nate = 87647669, Luke = 74418463.
const NOTIFY_OWNER_IDS = ["87647669", "74418463"];
const TASK_TO_CONTACT_ASSOC_TYPE = 204; // HUBSPOT_DEFINED Task -> Contact

type ActivityPayload = { email: string; context?: string; pageUri?: string };
type Contact = { id: string; name: string };

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function findContact(
  token: string,
  email: string
): Promise<Contact | null> {
  try {
    const res = await fetch(`${HUBSPOT_CONTACTS_ENDPOINT}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filterGroups: [
          { filters: [{ propertyName: "email", operator: "EQ", value: email }] },
        ],
        properties: ["email", "firstname", "lastname"],
        limit: 1,
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      results?: {
        id: string;
        properties?: { firstname?: string; lastname?: string; email?: string };
      }[];
    };
    const r = j.results?.[0];
    if (!r) return null;
    const p = r.properties ?? {};
    const name =
      [p.firstname, p.lastname].filter(Boolean).join(" ") || p.email || email;
    return { id: r.id, name };
  } catch (err) {
    console.error("[activity] contact search threw", err);
    return null;
  }
}

async function createActivityTasks(
  token: string,
  contact: Contact,
  payload: ActivityPayload
): Promise<void> {
  const now = Date.now();
  const body = [
    `${contact.name} is active on the ${LEAD_SOURCE_LABEL} site right now.`,
    payload.context ? `Activity: ${payload.context}` : "",
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
              hs_task_subject: `Website activity: ${contact.name} is back on the map`,
              hs_task_body: body,
              hs_task_status: "NOT_STARTED",
              hs_task_priority: "MEDIUM",
              hs_task_type: "TODO",
              hs_timestamp: String(now),
              hubspot_owner_id: ownerId,
            },
            associations: [
              {
                to: { id: contact.id },
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
            "[activity] task create non-OK",
            ownerId,
            res.status,
            await res.text()
          );
        }
      } catch (err) {
        console.error("[activity] task create threw", ownerId, err);
      }
    })
  );
}

export async function POST(req: Request) {
  let body: Partial<ActivityPayload>;
  try {
    body = await req.json();
  } catch {
    return bad(400, "Invalid JSON body.");
  }

  const email = (body.email ?? "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return bad(400, "A valid email is required.");
  }

  const token = process.env.HUBSPOT_TOKEN;
  if (!token) return NextResponse.json({ ok: true, skipped: "no-token" });

  const contact = await findContact(token, email);
  if (!contact) return NextResponse.json({ ok: true, skipped: "unknown-contact" });

  await createActivityTasks(token, contact, {
    email,
    context: body.context,
    pageUri: body.pageUri,
  });

  return NextResponse.json({ ok: true });
}
