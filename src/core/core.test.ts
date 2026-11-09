import { describe, expect, it } from "vitest";
import { nextPeakDeparture, zonedTime } from "./time";
import { decodePolyline, midpoint } from "./polyline";
import { compare, formatDistance, formatMinutes, formatPrice, legKey } from "./compare";
import { parsePriceDisplay, parseTradeMeListingId, tradeMeToOption } from "./sources/trademe";
import type { Anchor, Leg, Option } from "./types";

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
  const leg = (o: string, a: Anchor, minutes: number): [string, Leg] => [legKey(o, a.id, a.mode), { optionId: o, anchorId: a.id, mode: a.mode, status: "ok", minutes }];

  it("totals, fastest per anchor and a single least-travel winner", () => {
    const legs = new Map([leg("a", anchors[0], 20), leg("a", anchors[1], 15), leg("b", anchors[0], 30), leg("b", anchors[1], 10)]);
    const c = compare([opt("a"), opt("b")], anchors, legs);
    expect(c.rows.map((r) => r.totalMinutes)).toEqual([35, 40]);
    expect(c.fastest).toEqual([20, 10]);
    expect(c.rows.map((r) => r.leastTravel)).toEqual([true, false]);
  });
  it("does not crown a winner on a tie or with a single option", () => {
    const legs = new Map([leg("a", anchors[0], 20), leg("a", anchors[1], 10), leg("b", anchors[0], 10), leg("b", anchors[1], 20)]);
    expect(compare([opt("a"), opt("b")], anchors, legs).rows.some((r) => r.leastTravel)).toBe(false);
    const one = compare([opt("a")], anchors, legs);
    expect(one.rows[0].leastTravel).toBe(false);
    expect(one.fastest).toEqual([null, null]);
  });
  it("leaves totals empty when a leg has no route", () => {
    const legs = new Map([leg("a", anchors[0], 20), [legKey("a", "g", "bike"), { optionId: "a", anchorId: "g", mode: "bike", status: "no_route" } as Leg]]);
    expect(compare([opt("a")], anchors, legs).rows[0].totalMinutes).toBeNull();
  });
  it("is keyed by mode, so changing an anchor's mode needs new legs", () => {
    const legs = new Map([leg("a", anchors[0], 20)]);
    const walking = [{ ...anchors[0], mode: "walk" as const }];
    expect(compare([opt("a")], walking, legs).rows[0].legs[0]).toBeUndefined();
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
