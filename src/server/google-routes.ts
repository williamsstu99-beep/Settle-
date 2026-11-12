import type { LatLng, Leg, Mode, TransitStep } from "@/core/types";
import { TtlCache } from "./cache";

/**
 * Google Routes API (computeRoutes). One call per option→anchor pair, so we
 * get the route line as well as the time. Results are cached by rounded
 * coordinates + mode, because a flat-to-workplace commute barely changes and
 * many users share the same places.
 */

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const MATRIX_ENDPOINT = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const FIELD_MASK = "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline";
const TRANSIT_FIELD_MASK =
  FIELD_MASK +
  ",routes.legs.steps.travelMode,routes.legs.steps.polyline.encodedPolyline" +
  ",routes.legs.steps.transitDetails.transitLine.nameShort,routes.legs.steps.transitDetails.transitLine.name,routes.legs.steps.transitDetails.transitLine.vehicle.type" +
  ",routes.legs.steps.transitDetails.stopDetails.departureStop.name,routes.legs.steps.transitDetails.headway,routes.travelAdvisory.transitFare";
const ELEVATION_ENDPOINT = "https://maps.googleapis.com/maps/api/elevation/json";
const MATRIX_FIELD_MASK = "originIndex,destinationIndex,duration,distanceMeters,condition,status";

const TRAVEL_MODE: Record<Mode, string> = { drive: "DRIVE", transit: "TRANSIT", bike: "BICYCLE", walk: "WALK" };

export type RouteResult =
  | ({ status: "ok"; minutes: number; meters: number; polyline: string } & Pick<Leg, "steps" | "fare" | "peak" | "ascent">)
  | { status: "no_route" };

const cache = new TtlCache<RouteResult>(3 * 24 * 3600 * 1000);

const round = (p: LatLng) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
export const routeCacheKey = (o: LatLng, d: LatLng, mode: Mode, slot: string) => `${mode}|${round(o)}|${round(d)}|${slot}`;

export class RoutesApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export type TimeResult = { status: "ok"; minutes: number; meters: number } | { status: "no_route" };
const timeCache = new TtlCache<TimeResult>(3 * 24 * 3600 * 1000, 20000);

const point = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

/** Mode-specific settings shared by single routes and the matrix. */
function modeSettings(mode: Mode, departure: Date): Record<string, unknown> {
  if (mode === "drive") return { travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE", departureTime: departure.toISOString() };
  if (mode === "transit") return { travelMode: "TRANSIT", departureTime: departure.toISOString() };
  return { travelMode: TRAVEL_MODE[mode] };
}

export function buildRequestBody(origin: LatLng, destination: LatLng, mode: Mode, departure: Date): Record<string, unknown> {
  return { origin: point(origin), destination: point(destination), polylineQuality: "OVERVIEW", ...modeSettings(mode, departure) };
}

type ApiStep = {
  travelMode?: string;
  polyline?: { encodedPolyline?: string };
  transitDetails?: {
    transitLine?: { nameShort?: string; name?: string; vehicle?: { type?: string } };
    stopDetails?: { departureStop?: { name?: string } };
    headway?: string;
  };
};
type Money = { currencyCode?: string; units?: string | number; nanos?: number };
type ApiRoute = {
  duration?: string;
  distanceMeters?: number;
  polyline?: { encodedPolyline?: string };
  legs?: { steps?: ApiStep[] }[];
  travelAdvisory?: { transitFare?: Money };
};

/** Google Money → number. Returns undefined for missing or zero fares (zero usually means "unknown"). */
export function parseMoney(m?: Money): { amount: number; currency: string } | undefined {
  if (!m?.currencyCode) return undefined;
  const amount = Number(m.units ?? 0) + (m.nanos ?? 0) / 1e9;
  return amount > 0 ? { amount: Math.round(amount * 100) / 100, currency: m.currencyCode } : undefined;
}

const toMinutes = (duration: string) => Math.max(1, Math.round(parseFloat(duration) / 60));

/**
 * Turn transit steps into walk/ride parts. Consecutive walking steps are
 * joined (Google splits a walk at every turn), rides keep their line name.
 */
export function parseTransitSteps(route: ApiRoute): TransitStep[] | undefined {
  const raw = route.legs?.flatMap((l) => l.steps ?? []) ?? [];
  if (!raw.some((s) => s.travelMode === "TRANSIT")) return undefined;
  const out: TransitStep[] = [];
  for (const s of raw) {
    const poly = s.polyline?.encodedPolyline;
    if (!poly) continue;
    if (s.travelMode === "TRANSIT") {
      const line = s.transitDetails?.transitLine;
      const headway = s.transitDetails?.headway ? Math.round(parseFloat(s.transitDetails.headway) / 60) : undefined;
      out.push({
        kind: "ride",
        polyline: poly,
        line: line?.nameShort || line?.name || undefined,
        vehicle: line?.vehicle?.type || undefined,
        from: s.transitDetails?.stopDetails?.departureStop?.name || undefined,
        headwayMin: headway && headway > 0 && headway < 180 ? headway : undefined,
      });
    } else {
      const prev = out[out.length - 1];
      if (prev?.kind === "walk") prev.polyline = joinPolylines(prev.polyline, poly);
      else out.push({ kind: "walk", polyline: poly });
    }
  }
  return out.length ? out : undefined;
}

/** Join two encoded polylines (re-encodes; precision 5). */
function joinPolylines(a: string, b: string): string {
  return encodePolyline([...decode(a), ...decode(b)]);
}
function decode(e: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < e.length) {
    for (const k of [0, 1]) {
      let r = 0, sh = 0, b: number;
      do { b = e.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
      const d = r & 1 ? ~(r >> 1) : r >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    out.push([lat, lng]);
  }
  return out;
}
function encodePolyline(pts: [number, number][]): string {
  let o = "", pl = 0, pg = 0;
  const enc = (v: number) => {
    v = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (v >= 32) { s += String.fromCharCode((32 | (v & 31)) + 63); v >>= 5; }
    return s + String.fromCharCode(v + 63);
  };
  for (const [a, g] of pts) { o += enc(a - pl) + enc(g - pg); pl = a; pg = g; }
  return o;
}

export function parseResponse(json: unknown): RouteResult {
  const r = (json as { routes?: ApiRoute[] })?.routes?.[0];
  if (!r?.duration) return { status: "no_route" };
  return {
    status: "ok",
    minutes: toMinutes(r.duration),
    meters: r.distanceMeters ?? 0,
    polyline: r.polyline?.encodedPolyline ?? "",
    steps: parseTransitSteps(r),
    fare: parseMoney(r.travelAdvisory?.transitFare),
  };
}

/** Total climb in metres from a list of elevations. Small wobbles (< 1 m) are ignored. */
export function totalAscent(elevations: number[]): number {
  let up = 0;
  for (let i = 1; i < elevations.length; i++) {
    const d = elevations[i] - elevations[i - 1];
    if (d > 1) up += d;
  }
  return Math.round(up);
}

/** Bike / walk: climb along the route from the Elevation API. Undefined if that API isn't enabled. */
async function ascentFor(polyline: string, apiKey: string): Promise<number | undefined> {
  if (!polyline) return undefined;
  try {
    const url = `${ELEVATION_ENDPOINT}?path=enc:${encodeURIComponent(polyline)}&samples=64&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const j = (await res.json()) as { status?: string; results?: { elevation?: number }[] };
    if (j.status !== "OK" || !j.results?.length) return undefined;
    return totalAscent(j.results.map((r) => r.elevation ?? 0));
  } catch {
    return undefined;
  }
}

const peakCache = new TtlCache<[number, number] | null>(3 * 24 * 3600 * 1000, 5000);

/**
 * Drive: best and worst case at the peak departure (two extra duration-only
 * requests). Only asked for the selected home's drives, not every route.
 */
export async function peakRange(origin: LatLng, destination: LatLng, departure: Date, apiKey: string, slot = "peak"): Promise<[number, number] | undefined> {
  const key = routeCacheKey(origin, destination, "drive", slot);
  const hit = peakCache.get(key);
  if (hit !== undefined) return hit ?? undefined;
  const r = await fetchPeakRange(origin, destination, departure, apiKey);
  peakCache.set(key, r ?? null);
  return r;
}

async function fetchPeakRange(origin: LatLng, destination: LatLng, departure: Date, apiKey: string): Promise<[number, number] | undefined> {
  try {
    const one = async (trafficModel: "OPTIMISTIC" | "PESSIMISTIC") => {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "routes.duration" },
        body: JSON.stringify({ origin: point(origin), destination: point(destination), travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE_OPTIMAL", trafficModel, departureTime: departure.toISOString() }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return undefined;
      const d = ((await res.json()) as { routes?: { duration?: string }[] }).routes?.[0]?.duration;
      return d ? toMinutes(d) : undefined;
    };
    const [lo, hi] = await Promise.all([one("OPTIMISTIC"), one("PESSIMISTIC")]);
    return lo != null && hi != null ? [Math.min(lo, hi), Math.max(lo, hi)] : undefined;
  } catch {
    return undefined;
  }
}

async function googleError(res: Response): Promise<RoutesApiError> {
  const text = await res.text().catch(() => "");
  let msg = `Google Routes API returned ${res.status}`;
  try {
    const err = JSON.parse(text)?.error as { message?: string; status?: string; details?: { reason?: string }[] } | undefined;
    const reason = err?.details?.find((d) => d.reason)?.reason;
    msg = [err?.message ?? msg, reason ? `(${reason})` : err?.status ? `(${err.status})` : ""].filter(Boolean).join(" ");
  } catch {}
  return new RoutesApiError(msg, res.status);
}

/** Google's answer for a mode it doesn't serve somewhere is "no route", not a failure. */
const unsupported = (e: RoutesApiError) => e.status === 400 && /not supported|unsupported|no route/i.test(e.message);

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
      "X-Goog-FieldMask": mode === "transit" ? TRANSIT_FIELD_MASK : FIELD_MASK,
    },
    body: JSON.stringify(buildRequestBody(origin, destination, mode, departure)),
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const err = await googleError(res);
    if (unsupported(err)) {
      const none: RouteResult = { status: "no_route" };
      cache.set(key, none);
      return none;
    }
    throw err;
  }
  const result = parseResponse(await res.json());
  if (result.status === "ok") {
    // Terrain for the place cards; optional and never fails the route. (The drive peak range is fetched separately.)
    if (mode === "bike" || mode === "walk") result.ascent = await ascentFor(result.polyline, apiKey);
  }
  cache.set(key, result);
  if (result.status === "ok") timeCache.set(key, { status: "ok", minutes: result.minutes, meters: result.meters });
  return result;
}

type MatrixElement = { originIndex?: number; destinationIndex?: number; duration?: string; distanceMeters?: number; condition?: string; status?: { code?: number } };

export function parseMatrix(json: unknown, origins: number, destinations: number): TimeResult[][] {
  const grid: TimeResult[][] = Array.from({ length: origins }, () => Array.from({ length: destinations }, () => ({ status: "no_route" as const })));
  const els = Array.isArray(json) ? (json as MatrixElement[]) : [];
  for (const e of els) {
    const o = e.originIndex ?? 0, d = e.destinationIndex ?? 0;
    if (o >= origins || d >= destinations) continue;
    if ((e.status?.code ?? 0) !== 0 || e.condition !== "ROUTE_EXISTS" || !e.duration) continue;
    grid[o][d] = { status: "ok", minutes: toMinutes(e.duration), meters: e.distanceMeters ?? 0 };
  }
  return grid;
}

/**
 * Travel times only (no route lines) for every origin × destination in one
 * mode, using the Route Matrix API. Cached per pair; only uncached origins are
 * sent to Google.
 */
export async function computeTimes(origins: LatLng[], destinations: LatLng[], mode: Mode, departure: Date, apiKey: string, slot = "peak"): Promise<TimeResult[][]> {
  const keyOf = (o: number, d: number) => routeCacheKey(origins[o], destinations[d], mode, slot);
  const grid: (TimeResult | undefined)[][] = origins.map((_, o) => destinations.map((_, d) => timeCache.get(keyOf(o, d))));
  const need = origins.map((_, o) => o).filter((o) => grid[o].some((t) => !t));
  if (need.length && destinations.length) {
    const res = await fetch(MATRIX_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": MATRIX_FIELD_MASK },
      body: JSON.stringify({ origins: need.map((o) => ({ waypoint: point(origins[o]) })), destinations: destinations.map((d) => ({ waypoint: point(d) })), ...modeSettings(mode, departure) }),
      signal: AbortSignal.timeout(15000),
    });
    let fresh: TimeResult[][];
    if (!res.ok) {
      const err = await googleError(res);
      if (!unsupported(err)) throw err;
      fresh = need.map(() => destinations.map(() => ({ status: "no_route" as const })));
    } else {
      fresh = parseMatrix(await res.json(), need.length, destinations.length);
    }
    need.forEach((o, i) => destinations.forEach((_, d) => {
      grid[o][d] = fresh[i][d];
      timeCache.set(keyOf(o, d), fresh[i][d]);
    }));
  }
  return grid as TimeResult[][];
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
