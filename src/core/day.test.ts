import { describe, expect, it } from "vitest";
import { compare, legKey, pairKey } from "./compare";
import { dayStops, dropIndex, fromAnchor, moveTo, newDayName, pruneDays, reorderDay, toggleSkip, tripsFor, type Day } from "./day";
import { activeDay, anchorColor, decodePlan, encodePlan, EXAMPLE_PLAN } from "./plan";
import type { Anchor, Option, Time } from "./types";

const anchor = (id: string, mode: Anchor["mode"] = "drive"): Anchor => ({ id, name: id, icon: "other", location: { lat: id.length, lng: 0 }, mode });
const W = anchor("work"), G = anchor("gym", "bike"), P = anchor("partner");
const anchors = [W, G, P];
const home = (id: string): Option => ({ id, title: id, location: { lat: 9, lng: 9 }, source: { kind: "manual" } });
const day = (patch: Partial<Day> = {}): Day => ({ id: "d", name: "My day", order: ["gym", "work"], skip: [], home: true, ...patch });

describe("days", () => {
  it("with no day, every anchor is its own trip from home", () => {
    const t = tripsFor(home("A"), anchors);
    expect(t.map((x) => [x.from, x.to, x.kind])).toEqual([["A", "work", "own"], ["A", "gym", "own"], ["A", "partner", "own"]]);
  });

  it("chains the day's stops in order, adds the trip home, and puts new anchors on the end", () => {
    const t = tripsFor(home("A"), anchors, day());
    expect(t.map((x) => [x.from, x.to, x.kind, x.defaultMode])).toEqual([
      ["A", "gym", "first", "bike"],
      [fromAnchor("gym"), "work", "chain", "drive"],
      [fromAnchor("work"), "partner", "chain", "drive"],
      [fromAnchor("partner"), "A", "back", "drive"],
    ]);
    expect(t[3].anchor.name).toBe("Home");
    expect(anchorColor(t[3].anchor, -1).id).toBe("home");
  });

  it("keeps anchors taken out of the day as their own trips from home", () => {
    const t = tripsFor(home("A"), anchors, day({ skip: ["partner"], home: false }));
    expect(t.map((x) => [x.from, x.to, x.kind])).toEqual([["A", "gym", "first"], [fromAnchor("gym"), "work", "chain"], ["A", "partner", "own"]]);
    expect(dayStops(anchors, day({ skip: ["gym", "work", "partner"] })).stops).toEqual([]);
    expect(tripsFor(home("A"), anchors, day({ skip: ["gym", "work", "partner"] })).every((x) => x.kind === "own")).toBe(true);
  });

  it("reorders, skips and restores", () => {
    expect(reorderDay(day({ order: ["gym", "work", "partner"], skip: ["partner"] }), ["work", "gym"]).order).toEqual(["work", "gym", "partner"]);
    const off = toggleSkip(day(), "gym");
    expect(off.skip).toEqual(["gym"]);
    const on = toggleSkip(off, "gym");
    expect(on.skip).toEqual([]);
    expect(on.order).toEqual(["work", "gym"]); // back in at the end
    expect(pruneDays([day({ skip: ["gone"] })], [W])[0]).toMatchObject({ order: ["work"], skip: [] });
  });

  it("names new days without clashing", () => {
    expect(newDayName([])).toBe("My day");
    expect(newDayName([day(), day({ name: "Day 2" })])).toBe("Day 3");
  });

  it("works out where a dragged row lands", () => {
    expect(dropIndex([10, 30, 50], 5)).toBe(0);
    expect(dropIndex([10, 30, 50], 40)).toBe(2);
    expect(moveTo(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
    expect(moveTo(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(moveTo(["a", "b", "c"], "b", 9)).toEqual(["a", "c", "b"]);
  });
});

describe("compare on a day", () => {
  const t = (from: string, to: string, mode: Time["mode"], minutes: number): [string, Time] => [legKey(from, to, mode), { optionId: from, anchorId: to, mode, status: "ok", minutes }];
  const times = new Map([
    t("A", "gym", "bike", 10), t("B", "gym", "bike", 20),
    t(fromAnchor("gym"), "work", "drive", 15),
    t(fromAnchor("work"), "A", "drive", 30), t(fromAnchor("work"), "B", "drive", 12),
    t("A", "partner", "drive", 5), t("B", "partner", "drive", 5),
  ]);
  const d = day({ order: ["gym", "work"], skip: ["partner"] });

  it("times each trip from the previous stop and ranks homes on the whole day", () => {
    const c = compare([home("A"), home("B")], anchors, new Map(), times, {}, d);
    const a = c.rows.find((r) => r.option.id === "A")!;
    expect(a.legs.map((l) => [l.to, l.minutes, l.shared])).toEqual([["gym", 10, false], ["work", 15, true], ["A", 30, false], ["partner", 5, false]]);
    expect(a.dailyMinutes).toBe(10 + 15 + 30 + 2 * 5);
    expect(c.rows[0].option.id).toBe("B"); // 20 + 15 + 12 + 10 = 57 < 65
    expect(c.fastest).toEqual([10, null, 12, 5]); // the shared stop → stop trip is never ranked
  });

  it("uses overrides keyed by the trip", () => {
    const c = compare([home("A")], anchors, new Map(), new Map([...times, t(fromAnchor("gym"), "work", "bike", 25)]), { [pairKey(fromAnchor("gym"), "work")]: "bike" }, d);
    expect(c.rows[0].legs[1]).toMatchObject({ mode: "bike", overridden: true, minutes: 25 });
  });
});

describe("share links keep saved days", () => {
  it("round-trips days by anchor position, and the chosen day", () => {
    const [w, g, p] = EXAMPLE_PLAN.anchors.map((a) => a.id);
    const plan = { ...EXAMPLE_PLAN, days: [{ id: "x", name: "Gym day", order: [g, w], skip: [p], home: true }, { id: "y", name: "Weekend", order: [p], skip: [w, g], home: false }], dayId: "y" };
    const back = decodePlan(encodePlan(plan))!;
    const id = (i: number) => back.anchors[i].id;
    expect(back.days!.map((d) => [d.name, d.order, d.skip, d.home])).toEqual([["Gym day", [id(1), id(0)], [id(2)], true], ["Weekend", [id(2)], [id(0), id(1)], false]]);
    expect(activeDay(back)?.name).toBe("Weekend");
    expect(decodePlan(encodePlan(EXAMPLE_PLAN))!.days).toBeUndefined();
  });
});
