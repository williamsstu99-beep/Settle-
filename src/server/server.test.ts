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
