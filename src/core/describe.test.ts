import { describe, expect, it } from "vitest";
import type { LegView, OptionSummary } from "./compare";
import { fareLine, modeDetail, rankBadge, suburbOf, terrain } from "./describe";
import type { Leg } from "./types";

const row = (id: string, minutes: (number | null | undefined)[], fares: (number | undefined)[] = []): OptionSummary => ({
  option: { id, title: id, location: { lat: 0, lng: 0 }, source: { kind: "manual" } },
  dailyMinutes: null,
  leastTravel: false,
  legs: minutes.map((m, i) => ({ minutes: m, mode: "transit", leg: fares[i] != null ? ({ fare: { amount: fares[i], currency: "NZD" } } as Leg) : undefined }) as LegView),
});

describe("rank badges", () => {
  const rows = [row("A", [20]), row("B", [34]), row("C", [48])];
  it("names the fastest and orders the rest", () => {
    expect(rankBadge(rows, 0, "A")).toEqual({ text: "Fastest", strong: true });
    expect(rankBadge(rows, 0, "B")).toEqual({ text: "2nd of 3", strong: false });
    expect(rankBadge(rows, 0, "C")).toEqual({ text: "3rd of 3", strong: false });
  });
  it("calls out the cheapest when it isn't the fastest", () => {
    const withFares = [row("A", [20], [4.2]), row("B", [34], [3.1]), row("C", [48], [4.2])];
    expect(rankBadge(withFares, 0, "B")).toEqual({ text: "Cheapest", strong: false });
    expect(rankBadge(withFares, 0, "A")?.text).toBe("Fastest");
  });
  it("shares fastest on a tie, and shows nothing with only one home", () => {
    expect(rankBadge([row("A", [20]), row("B", [20])], 0, "B")?.text).toBe("Fastest");
    expect(rankBadge([row("A", [20])], 0, "A")).toBeNull();
    expect(rankBadge([row("A", [20]), row("B", [null])], 0, "A")).toBeNull();
  });
});

describe("mode detail lines", () => {
  const transit = (steps: Leg["steps"]) => ({ mode: "transit" as const, leg: { steps } as Leg });
  it("describes direct transit with frequency when known", () => {
    expect(modeDetail(transit([{ kind: "walk", polyline: "" }, { kind: "ride", polyline: "", line: "75", vehicle: "BUS", headwayMin: 10 }]))).toBe("Bus 75 · direct · every 10 min");
    expect(modeDetail(transit([{ kind: "ride", polyline: "", line: "Western Line", vehicle: "HEAVY_RAIL" }]))).toBe("Western Line · direct");
  });
  it("names the change stop", () => {
    expect(modeDetail(transit([{ kind: "ride", polyline: "", line: "27H", vehicle: "BUS" }, { kind: "ride", polyline: "", line: "Western Line", vehicle: "HEAVY_RAIL", from: "Kingsland" }]))).toBe("Bus 27H → Western Line · 1 change at Kingsland");
  });
  it("gives a peak range for drives and terrain for bikes, or just the mode", () => {
    expect(modeDetail({ mode: "drive", leg: { peak: [5, 9] } as Leg })).toBe("Drive · 5–9 min at peak");
    expect(modeDetail({ mode: "drive", leg: undefined })).toBe("Drive");
    expect(modeDetail({ mode: "bike", leg: { ascent: 30 } as Leg })).toBe("Bike · Some hills");
    expect(modeDetail({ mode: "walk", leg: {} as Leg })).toBe("Walk");
    expect([terrain(5), terrain(30), terrain(80)]).toEqual(["Flat", "Some hills", "Hilly"]);
  });
  it("shows a fare only when Google gave one", () => {
    expect(fareLine({ mode: "transit", leg: { fare: { amount: 4.2, currency: "NZD" } } as Leg }, "en-NZ")).toBe("$4.20 each way · $8.40/day return");
    expect(fareLine({ mode: "transit", leg: {} as Leg })).toBeNull();
    expect(fareLine({ mode: "drive", leg: { fare: { amount: 4, currency: "NZD" } } as Leg })).toBeNull();
  });
  it("picks the suburb out of an address", () => {
    expect(suburbOf({ address: "12 Fanshawe St, Wynyard Quarter, Auckland" })).toBe("Wynyard Quarter");
    expect(suburbOf({ address: "Newmarket, Auckland" })).toBe("Newmarket");
    expect(suburbOf({})).toBeUndefined();
  });
});
