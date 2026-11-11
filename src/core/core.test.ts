import { describe, expect, it } from "vitest";
import { nextPeakDeparture, zonedTime } from "./time";
import { decodePolyline, midpoint } from "./polyline";
import { compare, effectiveMode, formatDistance, formatMinutes, formatPrice, legKey, pairKey } from "./compare";
import { parsePriceDisplay, parseTradeMeListingId, tradeMeToOption } from "./sources/trademe";
import type { Anchor, Leg, Option, Time } from "./types";

describe("nextPeakDeparture", () => {
  it("returns tomorrow 8am NZ time on a weekday evening", () => {
    // Wed 2026-11-11 19:00 NZDT (UTC+13) = 06:00Z
    const t = nextPeakDeparture("Pacific/Auckland", new Date("2026-11-11T06:00:00Z"));
    expect(t.toISOString()).toBe("2026-11-11T19:00:00.000Z"); // Thu 08:00 NZDT
  });
  it("skips the weekend", () => {
    // Sat 2026-11-14 10:00 NZDT
    const t = nextPeakDeparture("Pacific/Auckland", new Date("2026-11-13T21:00:00Z"));
    expect(t.toISOString()).toBe("2026-11-15T19:00:00.000Z"); // Mon 16 Nov 08:00 NZDT
  });
  it("uses today when it is still before 8am on a weekday", () => {
    // Mon 2026-11-16 06:30 NZDT
    const t = nextPeakDeparture("Pacific/Auckland", new Date("2026-11-15T17:30:00Z"));
    expect(t.toISOString()).toBe("2026-11-15T19:00:00.000Z");
  });
  it("handles other zones and DST", () => {
    expect(zonedTime(2026, 7, 1, 8, "Europe/London").toISOString()).toBe("2026-07-01T07:00:00.000Z");
    expect(zonedTime(2026, 1, 15, 8, "Europe/London").toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(zonedTime(2026, 6, 15, 8, "Pacific/Auckland").toISOString()).toBe("2026-06-14T20:00:00.000Z");
  });
  it("falls back to UTC for an unknown zone", () => {
    const t = nextPeakDeparture("Not/AZone", new Date("2026-11-11T09:00:00Z"));
    expect(t.toISOString()).toBe("2026-11-12T08:00:00.000Z");
  });
});

describe("polyline", () => {
  it("decodes Google's reference example", () => {
    const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(pts).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });
  it("finds the midpoint of a straight path", () => {
    const m = midpoint([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 2 }])!;
    expect(m.lat).toBeCloseTo(0);
    expect(m.lng).toBeCloseTo(1);
  });
});

describe("compare", () => {
  const anchors: Anchor[] = [
    { id: "w", name: "Work", icon: "work", location: { lat: 0, lng: 0 }, mode: "transit" },
    { id: "g", name: "Gym", icon: "gym", location: { lat: 0, lng: 0 }, mode: "bike" },
  ];
  const opt = (id: string): Option => ({ id, title: id, location: { lat: 0, lng: 0 }, source: { kind: "manual" } });
  const time = (o: string, a: string, mode: Time["mode"], minutes: number | null): [string, Time] => [legKey(o, a, mode), minutes == null ? { optionId: o, anchorId: a, mode, status: "no_route" } : { optionId: o, anchorId: a, mode, status: "ok", minutes }];
  const leg = (o: string, a: string, mode: Leg["mode"], minutes: number): [string, Leg] => [legKey(o, a, mode), { optionId: o, anchorId: a, mode, status: "ok", minutes, polyline: "x" }];

  it("totals return trips per day, sorts least travel first and crowns one winner", () => {
    const times = new Map([time("a", "w", "transit", 30), time("a", "g", "bike", 15), time("b", "w", "transit", 20), time("b", "g", "bike", 10)]);
    const c = compare([opt("a"), opt("b")], anchors, new Map(), times);
    expect(c.rows.map((r) => [r.option.id, r.dailyMinutes, r.leastTravel])).toEqual([["b", 60, true], ["a", 90, false]]);
    expect(c.fastest).toEqual([20, 10]);
  });
  it("uses an override for one home → place only", () => {
    const times = new Map([time("a", "w", "transit", 30), time("a", "w", "drive", 12), time("a", "g", "bike", 15), time("b", "w", "transit", 30), time("b", "g", "bike", 15)]);
    const c = compare([opt("a"), opt("b")], anchors, new Map(), times, { [pairKey("a", "w")]: "drive" });
    const a = c.rows.find((r) => r.option.id === "a")!;
    expect(a.legs[0]).toMatchObject({ mode: "drive", overridden: true, minutes: 12 });
    expect(a.dailyMinutes).toBe(54);
    expect(c.rows.find((r) => r.option.id === "b")!.legs[0]).toMatchObject({ mode: "transit", overridden: false });
    expect(effectiveMode({ [pairKey("a", "w")]: "drive" }, "b", anchors[0])).toBe("transit");
  });
  it("prefers the route's time over the batch estimate", () => {
    const times = new Map([time("a", "w", "transit", 30), time("a", "g", "bike", 15)]);
    const legs = new Map([leg("a", "w", "transit", 31)]);
    expect(compare([opt("a")], anchors, legs, times).rows[0].legs[0].minutes).toBe(31);
  });
  it("marks short walks as walkable unless walking is already chosen", () => {
    const times = new Map([time("a", "w", "transit", 12), time("a", "w", "walk", 15), time("a", "g", "bike", 5), time("a", "g", "walk", 16)]);
    const c = compare([opt("a")], anchors, new Map(), times);
    expect(c.rows[0].legs.map((l) => l.walkable)).toEqual([true, false]);
    const w = compare([opt("a")], anchors, new Map(), times, { [pairKey("a", "w")]: "walk" });
    expect(w.rows[0].legs[0].walkable).toBe(false);
  });
  it("leaves the total empty when a chosen mode has no route, and keeps those homes last", () => {
    const times = new Map([time("a", "w", "transit", null), time("a", "g", "bike", 5), time("b", "w", "transit", 40), time("b", "g", "bike", 40)]);
    const c = compare([opt("a"), opt("b")], anchors, new Map(), times);
    expect(c.rows.map((r) => [r.option.id, r.dailyMinutes])).toEqual([["b", 160], ["a", null]]);
    expect(c.rows[1].legs[0].minutes).toBeNull();
    expect(c.rows.some((r) => r.leastTravel)).toBe(false);
  });
});

describe("formatting", () => {
  it("formats minutes, distance and price", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(80)).toBe("1 h 20 min");
    expect(formatDistance(640)).toBe("640 m");
    expect(formatDistance(6240)).toBe("6.2 km");
    expect(formatDistance(16093, "imperial")).toBe("10.0 mi");
    expect(formatPrice({ amount: 640, period: "week", currency: "NZD" }, "en-NZ")).toBe("$640/wk");
  });
});

describe("TradeMe source", () => {
  it("extracts listing IDs from common link shapes", () => {
    expect(parseTradeMeListingId("https://www.trademe.co.nz/a/property/residential/rent/auckland/auckland-city/sandringham/listing/4979207695")).toBe("4979207695");
    expect(parseTradeMeListingId("trademe.co.nz/a/property/residential/rent/x/listing/4979207695?bof=abc")).toBe("4979207695");
    expect(parseTradeMeListingId("https://www.trademe.co.nz/Browse/Listing.aspx?id=4979207695")).toBe("4979207695");
    expect(parseTradeMeListingId("https://www.tmsandbox.co.nz/a/property/residential/rent/listing/2149678312")).toBe("2149678312");
  });
  it("rejects other sites and plain addresses", () => {
    expect(parseTradeMeListingId("https://example.com/listing/4979207695")).toBeNull();
    expect(parseTradeMeListingId("12 Haverstock Rd, Sandringham")).toBeNull();
  });
  it("parses rent", () => {
    expect(parsePriceDisplay("$640 per week")).toEqual({ amount: 640, period: "week", currency: "NZD" });
    expect(parsePriceDisplay("$1,050 per week")).toEqual({ amount: 1050, period: "week", currency: "NZD" });
    expect(parsePriceDisplay("Enquire")).toBeUndefined();
  });
  it("maps a listing response to an option and refuses one without a location", () => {
    const o = tradeMeToOption(
      {
        ListingId: 4979207695,
        Title: "Tidy unit close to shops",
        PriceDisplay: "$640 per week",
        Suburb: "Sandringham",
        Region: "Auckland",
        GeographicLocation: { Latitude: -36.884, Longitude: 174.733 },
        Attributes: [
          { Name: "Location", Value: "14B Haverstock Road, Sandringham, Auckland" },
          { Name: "Bedrooms", Value: "2" },
          { Name: "Bathrooms", Value: "1" },
          { Name: "PropertyType", Value: "Unit" },
        ],
      },
      "https://www.trademe.co.nz/a/listing/4979207695",
    )!;
    expect(o).toMatchObject({ id: "tm-4979207695", title: "14B Haverstock Road", subtitle: "Sandringham, Auckland", bedrooms: 2, bathrooms: 1, propertyType: "Unit", price: { amount: 640, period: "week" } });
    expect(tradeMeToOption({ ListingId: 1, Title: "x" }, "u")).toBeNull();
  });
});

import { decodePlan, encodePlan, EXAMPLE_PLAN } from "./plan";

describe("share links", () => {
  it("round-trips a plan through the URL", () => {
    const back = decodePlan(encodePlan(EXAMPLE_PLAN))!;
    expect(back.anchors.map((a) => [a.name, a.icon, a.mode, a.location])).toEqual(EXAMPLE_PLAN.anchors.map((a) => [a.name, a.icon, a.mode, a.location]));
    expect(back.options.map((o) => [o.title, o.price?.amount, o.bedrooms])).toEqual([["Beach Road", 560, 1], ["Valley Road", 890, 3], ["Dominion Road", 580, 2]]);
    expect(back.example).toBeUndefined();
  });
  it("handles non-Latin text and drops junk", () => {
    const p = decodePlan(encodePlan({ anchors: [{ id: "x", name: "Māori café ☕", icon: "cafe", location: { lat: 1, lng: 2 }, mode: "walk" }], options: [] }))!;
    expect(p.anchors[0].name).toBe("Māori café ☕");
    expect(decodePlan("not-base64!!")).toBeNull();
    const bad = btoa(JSON.stringify({ a: [["x", "evil", 999, 0, "fly"]], o: [["y", "", 1, 1, 0, 0, "", ""]] }));
    const d = decodePlan(bad)!;
    expect(d.anchors).toHaveLength(0);
    expect(d.options).toHaveLength(1);
  });
});

import { easeInOut, measure, partialPath } from "./polyline";

describe("progressive route drawing", () => {
  const m = measure([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 3 }]);
  it("cuts a path by distance, not by point count", () => {
    expect(partialPath(m, 0.5)).toEqual([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 1.5 }]);
    expect(partialPath(m, 0.25).at(-1)!.lng).toBeCloseTo(0.75);
  });
  it("returns the start at 0 and the whole path at 1", () => {
    expect(partialPath(m, 0)).toEqual([{ lat: 0, lng: 0 }]);
    expect(partialPath(m, 1)).toBe(m.path);
  });
  it("eases from 0 to 1", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
  });
});

describe("share links keep mode choices", () => {
  it("round-trips per-route overrides by position", () => {
    const plan = { ...EXAMPLE_PLAN, overrides: { "ex-2|ex-work": "drive" as const, "ex-3|ex-gym": "walk" as const } };
    const back = decodePlan(encodePlan(plan))!;
    const o = (i: number) => back.options[i].id, a = (i: number) => back.anchors[i].id;
    expect(back.overrides).toEqual({ [`${o(1)}|${a(0)}`]: "drive", [`${o(2)}|${a(1)}`]: "walk" });
  });
});

import { ANCHOR_COLORS, anchorColor, nextAnchorColor } from "./plan";
import { safePhoto } from "./sources/trademe";

describe("place colours", () => {
  it("assigns the next unused colour and keeps existing ones", () => {
    expect(nextAnchorColor([])).toBe(ANCHOR_COLORS[0]);
    expect(nextAnchorColor([{ color: ANCHOR_COLORS[0] }, { color: ANCHOR_COLORS[2] }])).toBe(ANCHOR_COLORS[1]);
    expect(anchorColor({ color: "#123456" }, 5)).toBe("#123456");
    expect(anchorColor({}, 1)).toBe(ANCHOR_COLORS[1]);
  });
  it("gives places from a share link their colours by position", () => {
    const back = decodePlan(encodePlan(EXAMPLE_PLAN))!;
    expect(back.anchors.map((a) => a.color)).toEqual(ANCHOR_COLORS.slice(0, 3));
  });
});

describe("listing photos", () => {
  it("accepts TradeMe image hosts over https only", () => {
    expect(safePhoto("https://trademe.tmcdn.co.nz/photoserver/plus/123.jpg")).toBe("https://trademe.tmcdn.co.nz/photoserver/plus/123.jpg");
    expect(safePhoto("http://trademe.tmcdn.co.nz/x.jpg")).toBeUndefined();
    expect(safePhoto("https://evil.example.com/x.jpg")).toBeUndefined();
    expect(safePhoto("javascript:alert(1)")).toBeUndefined();
  });
});
