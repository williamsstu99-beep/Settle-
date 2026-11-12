import { describe, expect, it } from "vitest";
import { buildRequestBody, mapLimit, parseResponse, routeCacheKey } from "./google-routes";
import { RateLimiter, TtlCache } from "./cache";
import { oauthHeader } from "./trademe";

const A = { lat: -36.8485, lng: 174.7633 }, B = { lat: -36.8801, lng: 174.7571 };
const dep = new Date("2026-11-11T19:00:00Z");

describe("Google Routes request/response", () => {
  it("asks for traffic-aware driving at peak", () => {
    const b = buildRequestBody(A, B, "drive", dep);
    expect(b).toMatchObject({ travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE", departureTime: "2026-11-11T19:00:00.000Z" });
  });
  it("sends a departure time for transit but no routing preference", () => {
    const b = buildRequestBody(A, B, "transit", dep);
    expect(b.travelMode).toBe("TRANSIT");
    expect(b.departureTime).toBeDefined();
    expect(b.routingPreference).toBeUndefined();
  });
  it("sends neither for bike or walk", () => {
    for (const m of ["bike", "walk"] as const) {
      const b = buildRequestBody(A, B, m, dep);
      expect(b.departureTime).toBeUndefined();
      expect(b.routingPreference).toBeUndefined();
    }
  });
  it("parses durations and handles an empty response", () => {
    expect(parseResponse({ routes: [{ duration: "1325s", distanceMeters: 6200, polyline: { encodedPolyline: "abc" } }] })).toEqual({ status: "ok", minutes: 22, meters: 6200, polyline: "abc" });
    expect(parseResponse({})).toEqual({ status: "no_route" });
  });
  it("caches nearby points together", () => {
    expect(routeCacheKey(A, B, "bike", "peak")).toBe(routeCacheKey({ lat: -36.84851, lng: 174.76332 }, B, "bike", "peak"));
    expect(routeCacheKey(A, B, "bike", "peak")).not.toBe(routeCacheKey(A, B, "walk", "peak"));
  });
});

describe("helpers", () => {
  it("mapLimit keeps order and respects the cap", async () => {
    let live = 0, peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      live++; peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBeLessThanOrEqual(3);
  });
  it("cache expires and rate limiter blocks over the limit", async () => {
    const c = new TtlCache<number>(10);
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(c.get("a")).toBeUndefined();
    const rl = new RateLimiter(2, 1000);
    expect([rl.allow("x"), rl.allow("x"), rl.allow("x"), rl.allow("y")]).toEqual([true, true, false, true]);
  });
  it("builds the TradeMe PLAINTEXT OAuth header", () => {
    expect(oauthHeader("KEY", "SEC")).toBe('OAuth oauth_consumer_key="KEY", oauth_signature_method="PLAINTEXT", oauth_signature="SEC%26"');
  });
});

import { computeRoute } from "./google-routes";
import { vi, afterEach } from "vitest";

describe("Google errors", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("carries Google's reason code so setup problems can be explained", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 403, message: "Requests from referer <empty> are blocked.", status: "PERMISSION_DENIED", details: [{ reason: "API_KEY_HTTP_REFERRER_BLOCKED" }] } }), { status: 403 })));
    await expect(computeRoute({ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, "drive", dep, "k", "t1")).rejects.toMatchObject({ status: 403, message: "Requests from referer <empty> are blocked. (API_KEY_HTTP_REFERRER_BLOCKED)" });
  });
});

import { computeTimes, parseMatrix, parseResponse as parseRoute } from "./google-routes";

describe("transit steps", () => {
  it("joins walking steps and keeps line names on rides", () => {
    const r = parseRoute({
      routes: [{
        duration: "1800s", distanceMeters: 6000, polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC" },
        legs: [{ steps: [
          { travelMode: "WALK", polyline: { encodedPolyline: "_p~iF~ps|U" } },
          { travelMode: "WALK", polyline: { encodedPolyline: "_ulLnnqC" } },
          { travelMode: "TRANSIT", polyline: { encodedPolyline: "_mqNvxq`@" }, transitDetails: { transitLine: { nameShort: "25B", vehicle: { type: "BUS" } } } },
          { travelMode: "TRANSIT", polyline: { encodedPolyline: "_mqNvxq`@" }, transitDetails: { transitLine: { name: "Western Line", vehicle: { type: "HEAVY_RAIL" } } } },
          { travelMode: "WALK", polyline: { encodedPolyline: "_ulLnnqC" } },
        ] }],
      }],
    });
    expect(r.status === "ok" && r.steps?.map((s) => [s.kind, s.line ?? "", s.vehicle ?? ""])).toEqual([["walk", "", ""], ["ride", "25B", "BUS"], ["ride", "Western Line", "HEAVY_RAIL"], ["walk", "", ""]]);
  });
  it("leaves driving routes without steps", () => {
    const r = parseRoute({ routes: [{ duration: "600s", distanceMeters: 1, polyline: { encodedPolyline: "abc" } }] });
    expect(r.status === "ok" && r.steps).toBeUndefined();
  });
});

describe("route matrix", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("parses elements into a grid and treats missing routes as no route", () => {
    const g = parseMatrix([
      { originIndex: 0, destinationIndex: 1, duration: "900s", distanceMeters: 4000, condition: "ROUTE_EXISTS" },
      { originIndex: 1, destinationIndex: 0, condition: "ROUTE_NOT_FOUND" },
      { originIndex: 0, destinationIndex: 0, duration: "60s", condition: "ROUTE_EXISTS", status: { code: 3 } },
    ], 2, 2);
    expect(g[0][1]).toEqual({ status: "ok", minutes: 15, meters: 4000 });
    expect(g[1][0].status).toBe("no_route");
    expect(g[0][0].status).toBe("no_route");
  });
  it("only asks Google for pairs it hasn't cached", async () => {
    const calls: { origins: unknown[] }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      return new Response(JSON.stringify(body.origins.flatMap((_: unknown, o: number) => body.destinations.map((_: unknown, d: number) => ({ originIndex: o, destinationIndex: d, duration: "600s", condition: "ROUTE_EXISTS" })))));
    }));
    const o = [{ lat: -36.9, lng: 174.7 }, { lat: -36.91, lng: 174.71 }], d = [{ lat: -36.84, lng: 174.76 }];
    await computeTimes(o, d, "walk", dep, "k", "mx");
    const again = await computeTimes(o, d, "walk", dep, "k", "mx");
    expect(calls).toHaveLength(1);
    expect(again[1][0]).toEqual({ status: "ok", minutes: 10, meters: 0 });
    await computeTimes([...o, { lat: -36.95, lng: 174.8 }], d, "walk", dep, "k", "mx");
    expect(calls).toHaveLength(2);
    expect(calls[1].origins).toHaveLength(1);
  });
});

import { parseMoney, totalAscent } from "./google-routes";

describe("place card extras", () => {
  it("reads transit fares, stops and headway, and skips missing or zero fares", () => {
    expect(parseMoney({ currencyCode: "NZD", units: "4", nanos: 200000000 })).toEqual({ amount: 4.2, currency: "NZD" });
    expect(parseMoney({ currencyCode: "NZD", units: "0" })).toBeUndefined();
    expect(parseMoney(undefined)).toBeUndefined();
    const r = parseRoute({ routes: [{ duration: "1800s", distanceMeters: 1, polyline: { encodedPolyline: "abc" }, travelAdvisory: { transitFare: { currencyCode: "NZD", units: "3", nanos: 500000000 } },
      legs: [{ steps: [{ travelMode: "TRANSIT", polyline: { encodedPolyline: "_p~iF~ps|U" }, transitDetails: { transitLine: { nameShort: "75" }, stopDetails: { departureStop: { name: "Britomart" } }, headway: "600s" } }] }] }] });
    expect(r.status === "ok" && [r.fare, r.steps?.[0].from, r.steps?.[0].headwayMin]).toEqual([{ amount: 3.5, currency: "NZD" }, "Britomart", 10]);
  });
  it("adds up climbing only", () => {
    expect(totalAscent([10, 20, 15, 40, 40.5, 30])).toBe(35);
    expect(totalAscent([])).toBe(0);
  });
  it("asks for a peak range on drives and terrain on walks, and survives them failing", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => {
      if (url.includes("elevation")) { seen.push("elevation"); return new Response(JSON.stringify({ status: "REQUEST_DENIED" })); }
      const body = init?.body ? JSON.parse(init.body) : {};
      seen.push(body.trafficModel ?? body.travelMode);
      const secs = body.trafficModel === "OPTIMISTIC" ? 300 : body.trafficModel === "PESSIMISTIC" ? 540 : 420;
      return new Response(JSON.stringify({ routes: [{ duration: `${secs}s`, distanceMeters: 1, polyline: { encodedPolyline: "_p~iF~ps|U" } }] }));
    }));
    const { computeRoute } = await import("./google-routes");
    const d = await computeRoute({ lat: 1.5, lng: 1 }, { lat: 2, lng: 2 }, "drive", dep, "k", "x1");
    expect(d.status === "ok" && d.peak).toEqual([5, 9]);
    const w = await computeRoute({ lat: 1.5, lng: 1 }, { lat: 2, lng: 2 }, "walk", dep, "k", "x2");
    expect(w.status === "ok" && w.ascent).toBeUndefined(); // Elevation API not enabled → just the mode name
    expect(seen).toEqual(expect.arrayContaining(["DRIVE", "OPTIMISTIC", "PESSIMISTIC", "WALK", "elevation"]));
    vi.unstubAllGlobals();
  });
});
