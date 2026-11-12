import type { LatLng } from "@/core/types";
import { TtlCache } from "./cache";
import { RoutesApiError } from "./google-routes";

/**
 * "Along the way": Places API (New) text search restricted to a route, with
 * routing summaries so each result comes with how long it takes to stop there.
 */

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,routingSummaries";

export type AlongResult = {
  id: string;
  name: string;
  address?: string;
  location: LatLng;
  rating?: number;
  ratings?: number;
  mapsUrl?: string;
  /** Minutes from home to this stop. */
  fromHome?: number;
  /** Extra minutes compared with going straight to the place (0 = right on the way). */
  detour?: number;
};

type ApiPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
};
type ApiSummary = { legs?: { duration?: string }[] };

const mins = (d?: string) => (d ? Math.round(parseFloat(d) / 60) : undefined);

/**
 * Turn the response into results sorted by detour. With search along route,
 * each routing summary has two legs: home → stop and stop → end of the route.
 */
export function parseAlong(json: unknown, baseMinutes: number): AlongResult[] {
  const j = json as { places?: ApiPlace[]; routingSummaries?: ApiSummary[] };
  const out: AlongResult[] = [];
  (j.places ?? []).forEach((p, i) => {
    const lat = p.location?.latitude, lng = p.location?.longitude;
    if (!p.id || lat == null || lng == null) return;
    const legs = j.routingSummaries?.[i]?.legs ?? [];
    const a = mins(legs[0]?.duration), b = mins(legs[1]?.duration);
    out.push({
      id: p.id,
      name: p.displayName?.text || "Unnamed place",
      address: p.formattedAddress,
      location: { lat, lng },
      rating: p.rating,
      ratings: p.userRatingCount,
      mapsUrl: p.googleMapsUri,
      fromHome: a,
      detour: a != null && b != null ? Math.max(0, a + b - baseMinutes) : undefined,
    });
  });
  return out.sort((x, y) => (x.detour ?? 999) - (y.detour ?? 999) || (y.rating ?? 0) - (x.rating ?? 0));
}

const cache = new TtlCache<AlongResult[]>(24 * 3600 * 1000, 2000);

export async function searchAlong(query: string, polyline: string, origin: LatLng, travelMode: "DRIVE" | "WALK" | "BICYCLE", baseMinutes: number, apiKey: string): Promise<AlongResult[]> {
  const key = `${query.toLowerCase()}|${travelMode}|${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}|${polyline.length}:${polyline.slice(0, 40)}:${polyline.slice(-40)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 8,
      searchAlongRouteParameters: { polyline: { encodedPolyline: polyline } },
      routingParameters: { origin: { latitude: origin.lat, longitude: origin.lng }, travelMode },
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `Google Places API returned ${res.status}`;
    try {
      const err = JSON.parse(text)?.error as { message?: string; details?: { reason?: string }[] } | undefined;
      const reason = err?.details?.find((d) => d.reason)?.reason;
      msg = [err?.message ?? msg, reason ? `(${reason})` : ""].filter(Boolean).join(" ");
    } catch {}
    throw new RoutesApiError(msg, res.status);
  }
  const results = parseAlong(await res.json(), baseMinutes);
  cache.set(key, results);
  return results;
}
