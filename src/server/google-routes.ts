import type { LatLng, Mode } from "@/core/types";
import { TtlCache } from "./cache";

/**
 * Google Routes API (computeRoutes). One call per option→anchor pair, so we
 * get the route line as well as the time. Results are cached by rounded
 * coordinates + mode, because a flat-to-workplace commute barely changes and
 * many users share the same places.
 */

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELD_MASK = "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline";

const TRAVEL_MODE: Record<Mode, string> = { drive: "DRIVE", transit: "TRANSIT", bike: "BICYCLE", walk: "WALK" };

export type RouteResult =
  | { status: "ok"; minutes: number; meters: number; polyline: string }
  | { status: "no_route" };

const cache = new TtlCache<RouteResult>(3 * 24 * 3600 * 1000);

const round = (p: LatLng) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
export const routeCacheKey = (o: LatLng, d: LatLng, mode: Mode, slot: string) => `${mode}|${round(o)}|${round(d)}|${slot}`;

export class RoutesApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function buildRequestBody(origin: LatLng, destination: LatLng, mode: Mode, departure: Date) {
  const body: Record<string, unknown> = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    travelMode: TRAVEL_MODE[mode],
    polylineQuality: "OVERVIEW",
  };
  if (mode === "drive") {
    body.routingPreference = "TRAFFIC_AWARE";
    body.departureTime = departure.toISOString();
  } else if (mode === "transit") {
    body.departureTime = departure.toISOString();
  }
  return body;
}

export function parseResponse(json: unknown): RouteResult {
  const r = (json as { routes?: { duration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string } }[] })?.routes?.[0];
  if (!r?.duration) return { status: "no_route" };
  const secs = parseFloat(r.duration);
  return {
    status: "ok",
    minutes: Math.max(1, Math.round(secs / 60)),
    meters: r.distanceMeters ?? 0,
    polyline: r.polyline?.encodedPolyline ?? "",
  };
}

export async function computeRoute(
  origin: LatLng,
  destination: LatLng,
  mode: Mode,
  departure: Date,
  apiKey: string,
  slot = "peak",
): Promise<RouteResult> {
  const key = routeCacheKey(origin, destination, mode, slot);
  const hit = cache.get(key);
  if (hit) return hit;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(buildRequestBody(origin, destination, mode, departure)),
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `Google Routes API returned ${res.status}`;
    try {
      const err = JSON.parse(text)?.error as { message?: string; status?: string; details?: { reason?: string }[] } | undefined;
      const reason = err?.details?.find((d) => d.reason)?.reason;
      msg = [err?.message ?? msg, reason ? `(${reason})` : err?.status ? `(${err.status})` : ""].filter(Boolean).join(" ");
    } catch {}
    // A mode Google can't serve in this region (e.g. bike in some countries) is "no route", not a failure.
    if (res.status === 400 && /not supported|unsupported|no route/i.test(msg)) {
      const none: RouteResult = { status: "no_route" };
      cache.set(key, none);
      return none;
    }
    throw new RoutesApiError(msg, res.status);
  }
  const result = parseResponse(await res.json());
  cache.set(key, result);
  return result;
}

/** Run async jobs with a concurrency cap. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
