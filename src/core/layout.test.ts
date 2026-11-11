import { describe, expect, it } from "vitest";
import { overlap, placeCards, type CardInput } from "./layout";

const prop = (id: string, x: number, y: number, expanded = false, priority = 2): CardInput => ({ id, kind: "property", at: { x, y }, w: expanded ? 240 : 168, h: expanded ? 178 : 42, priority: expanded ? 0 : priority });
const anchor = (id: string, x: number, y: number, from?: { x: number; y: number }): CardInput => ({ id, kind: "anchor", at: { x, y }, w: 190, h: 54, priority: 1, from });

function noOverlaps(cards: CardInput[], view = { x: 0, y: 0, w: 1000, h: 800 }) {
  const placed = placeCards(cards, view);
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) expect(overlap(placed[i].box, placed[j].box), `${placed[i].id} vs ${placed[j].id}`).toBe(0);
  for (const p of placed) for (const c of cards) {
    if (c.id === p.id) continue;
    const b = p.box, d = c.at;
    expect(d.x > b.x && d.x < b.x + b.w && d.y > b.y && d.y < b.y + b.h, `${p.id} covers dot of ${c.id}`).toBe(false);
  }
  return placed;
}

describe("map card placement", () => {
  it("puts a property card above its dot with the stem joining straight down", () => {
    const [p] = placeCards([prop("a", 500, 400)]);
    expect(p.side).toBe("above");
    expect(p.box.y + p.box.h).toBeLessThan(400);
    expect(p.joint.x).toBe(500);
  });
  it("puts an anchor card on the side away from the incoming route", () => {
    const [right] = placeCards([anchor("w", 500, 300, { x: 300, y: 300 })]);
    expect(right.side).toBe("right");
    const [above] = placeCards([anchor("w", 500, 300, { x: 500, y: 500 })]);
    expect(above.side).toBe("above");
  });
  it("keeps 3 homes and 3 places apart in a typical Auckland layout", () => {
    const home = { x: 600, y: 330 };
    noOverlaps([
      prop("beach", home.x, home.y, true),
      prop("valley", 480, 560),
      prop("dominion", 380, 720),
      anchor("work", 520, 180, home),
      anchor("gym", 760, 470, home),
      anchor("partner", 590, 640, home),
    ]);
  });
  it("keeps 5 homes and 4 places apart when homes are close together", () => {
    const sel = { x: 500, y: 420 };
    noOverlaps([
      prop("a", sel.x, sel.y, true),
      prop("b", 600, 470),
      prop("c", 420, 560),
      prop("d", 700, 620),
      prop("e", 300, 400),
      anchor("w", 480, 130, sel),
      anchor("g", 820, 380, sel),
      anchor("p", 560, 720, sel),
      anchor("s", 180, 640, sel),
    ], { x: 0, y: 0, w: 1100, h: 820 });
  });
  it("gives the selected (expanded) card first pick", () => {
    const placed = placeCards([prop("other", 500, 300), prop("sel", 505, 310, true)]);
    expect(placed[0].id).toBe("sel");
    expect(placed[0].side).toBe("above");
  });
});
