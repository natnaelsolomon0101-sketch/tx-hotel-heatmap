/**
 * GET /api/hotel-photo?name=<hotel>&loc=<lat,lng>
 *
 * Returns a JPEG for a hotel, proxied server-side so the API key never reaches
 * the browser. Tries, in order:
 *   1. Google Places (New) — a real hotel photo, when Google has one.
 *   2. Google Street View Static — a street-level shot of the building.
 *   3. 404 — the card falls back to its placeholder.
 *
 * Needs a key with "Places API (New)" + "Street View Static API" enabled. Uses
 * the server-only key when present, falling back to the public Maps key.
 */
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY =
  process.env.GOOGLE_PLACES_KEY ||
  process.env.GOOGLE_GEOCODING_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "";

const CACHE = "public, max-age=86400, s-maxage=604800, immutable";

function jpeg(body: ArrayBuffer) {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "image/jpeg", "Cache-Control": CACHE },
  });
}

async function placesPhoto(name: string, lat?: number, lng?: number) {
  const body: Record<string, unknown> = { textQuery: name, maxResultCount: 1 };
  if (lat != null && lng != null) {
    body.locationBias = {
      circle: { center: { latitude: lat, longitude: lng }, radius: 1000 },
    };
  }
  const search = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "places.photos",
    },
    body: JSON.stringify(body),
  });
  if (!search.ok) return null;
  const data = await search.json();
  const photo = data?.places?.[0]?.photos?.[0]?.name as string | undefined;
  if (!photo) return null;
  // The media endpoint 302-redirects to the actual image; fetch follows it.
  const media = await fetch(
    `https://places.googleapis.com/v1/${photo}/media?maxWidthPx=640&key=${KEY}`,
  );
  if (!media.ok) return null;
  return media.arrayBuffer();
}

async function streetView(lat: number, lng: number) {
  // Metadata is free and tells us whether imagery actually exists here.
  const meta = await fetch(
    `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${KEY}`,
  );
  if (!meta.ok) return null;
  const status = (await meta.json())?.status;
  if (status !== "OK") return null;
  const img = await fetch(
    `https://maps.googleapis.com/maps/api/streetview?size=640x360&location=${lat},${lng}&fov=80&pitch=8&key=${KEY}`,
  );
  if (!img.ok) return null;
  return img.arrayBuffer();
}

export async function GET(req: NextRequest) {
  if (!KEY) return new Response("no key", { status: 404 });

  const { searchParams } = new URL(req.url);
  const name = (searchParams.get("name") || "").trim();
  const loc = searchParams.get("loc") || "";
  const [latStr, lngStr] = loc.split(",");
  const lat = Number(latStr);
  const lng = Number(lngStr);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  if (!name && !hasCoords) return new Response("bad request", { status: 400 });

  try {
    if (name) {
      const p = await placesPhoto(name, hasCoords ? lat : undefined, hasCoords ? lng : undefined);
      if (p) return jpeg(p);
    }
    if (hasCoords) {
      const sv = await streetView(lat, lng);
      if (sv) return jpeg(sv);
    }
  } catch {
    // fall through to 404
  }
  return new Response("no photo", { status: 404 });
}
