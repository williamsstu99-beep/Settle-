import { describe, expect, it } from "vitest";
import { awayFrom, chooseSides, dockedBox, overlap, SIDES, type Pt, type Side, type SideItem } from "./layout";

const home = (id: string, x: number, y: number, selected = false): SideItem => {
  const at = { x, y }, w = selected ? 304 : 214, h = selected ? 250 : 84, reach = (selected ? 34 : 22) - 8;
  return { id, at, priority: selected ? 0 : 2, prefer: ["right", "left", "below", "above"], boxes: Object.fromEntries(SIDES.map((s) => [s, dockedBox(at, w, h, s, reach)])) as Record<Side, ReturnType<typeof dockedBox>> };
};
const place = (id: string, x: number, y: number, from?: Pt): SideItem => {
  const at = { x, y };
  return { id, at, priority: 1, prefer: awayFrom(at, from), boxes: Object.fromEntries(SIDES.map((s) => [s, dockedBox(at, 290, 112, s, 0)])) as Record<Side, ReturnType<typeof dockedBox>> };
};
const markersOf = (items: SideItem[]) => items.map((i) => ({ id: i.id, at: i.at, r: 30 }));

function check(items: SideItem[], routePts: Pt[] = [], prev = {}) {
  const sides = chooseSides(items, markersOf(items), routePts, prev);
  const boxes = items.map((i) => ({ id: i.id, box: i.boxes[sides[i.id]] }));
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) expect(overlap(boxes[a].box, boxes[b].box), `${boxes[a].id} vs ${boxes[b].id}`).toBe(0);
  return sides;
}

describe("card sides", () => {
  it("docks a card right against its hub (no stem), tucked slightly under it", () => {
    const b = dockedBox({ x: 100, y: 100 }, 200, 80, "right", 26);
    expect(b).toEqual({ x: 126, y: 60, w: 200, h: 80 });
    expect(dockedBox({ x: 100, y: 100 }, 200, 80, "left", 26).x + 200).toBe(74);
  });
  it("faces place cards away from the incoming route", () => {
    expect(awayFrom({ x: 500, y: 300 }, { x: 300, y: 300 })[0]).toBe("right");
    expect(awayFrom({ x: 500, y: 300 }, { x: 500, y: 500 })[0]).toBe("above");
  });
  it("keeps 3 homes and 3 places apart", () => {
    const sel = { x: 560, y: 520 };
    check([home("B", sel.x, sel.y, true), home("A", 820, 260), home("C", 300, 760), place("work", 520, 120, sel), place("gym", 880, 470, sel), place("gf", 690, 780, sel)]);
  });
  it("keeps 5 homes and 4 places apart", () => {
    const sel = { x: 600, y: 450 };
    check([home("A", sel.x, sel.y, true), home("B", 980, 250), home("C", 250, 300), home("D", 300, 800), home("E", 1000, 760), place("w", 600, 80, sel), place("g", 1050, 520, sel), place("p", 640, 860, sel), place("s", 120, 560, sel)], [], {});
  });
  it("avoids sitting on the selected home's routes when it can", () => {
    const sel = { x: 400, y: 400 };
    const route = Array.from({ length: 20 }, (_, i) => ({ x: 400 + i * 15, y: 400 })); // runs to the right
    const sides = chooseSides([home("A", sel.x, sel.y, true)], [], route);
    expect(sides.A).not.toBe("right");
  });
  it("keeps the previous side while it's still clear (no flip-flopping)", () => {
    const items = [home("A", 400, 400, true), place("w", 400, 120, { x: 400, y: 400 })];
    const first = chooseSides(items, markersOf(items), []);
    const again = chooseSides(items, markersOf(items), [], { ...first, A: "left" });
    expect(again.A).toBe("left"); // left is clear, so it stays left even though right is preferred
    expect(again.w).toBe(first.w);
  });
  it("moves off the previous side when it now collides", () => {
    const items = [home("A", 400, 400, true), home("B", 650, 400)]; // B sits where A's right-side card would go
    const sides = chooseSides(items, markersOf(items), [], { A: "right" });
    expect(sides.A).not.toBe("right");
  });
});

describe("crowded layouts", () => {
  it("moves an earlier card aside when that's the only way to clear a later one (the Gym / Girlfriend case)", () => {
    const sel = { x: 717, y: 458 };
    const items = [home("B", sel.x, sel.y, true), home("A", 1040, 206), home("C", 610, 730), place("work", 747, 135, sel), place("gym", 906, 387, sel), place("gf", 783, 548, sel)];
    items[0].boxes = Object.fromEntries(SIDES.map((s) => [s, dockedBox(sel, 304, 252, s, 26)])) as SideItem["boxes"];
    check(items, [], { B: "left", gym: "below", gf: "below" });
  });
});

describe("hysteresis never traps a card", () => {
  it("drops the old sides when keeping them would leave an overlap (captured from the live page)", () => {
    const sel = { x: 338, y: 459 };
    const items = [home("ex-2", sel.x, sel.y, true), home("ex-1", 468, 207), home("ex-3", 230, 729), place("work", 367, 135, sel), place("gym", 526, 387, sel), place("gf", 403, 549, sel)];
    items[0].boxes = Object.fromEntries(SIDES.map((s) => [s, dockedBox(sel, 304, 252, s, 26)])) as SideItem["boxes"];
    for (const it of items.slice(3)) it.boxes = Object.fromEntries(SIDES.map((s) => [s, dockedBox(it.at, 280, 124, s, 0)])) as SideItem["boxes"];
    check(items, [], { "ex-2": "left", work: "left", gym: "below", gf: "below", "ex-1": "right", "ex-3": "right" });
  });
});
