/**
 * Screen-space placement for map cards. Each card belongs to a point (its dot)
 * and is tried in a few positions around it; the first position that doesn't
 * collide with already-placed cards or other dots wins, otherwise the least
 * bad one. Higher-priority cards are placed first and so get their favourite
 * spot. Pure and deterministic, so it can be tested without a map.
 */

export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

export type CardInput = {
  id: string;
  kind: "property" | "anchor";
  at: Pt; // the dot, in pixels
  w: number;
  h: number;
  priority: number; // lower is placed first
  /** Where routes come from (anchors): the card prefers the far side of its dot. */
  from?: Pt;
};

export type Placed = { id: string; box: Box; at: Pt; /** Where a leader line meets the card. */ joint: Pt; side: Side };
export type Side = "above" | "below" | "left" | "right" | "above-left" | "above-right";

const STEM = 22; // property card sits this far above its dot
const GAP = 14; // anchor card distance from its dot
const DOT_R = 10; // keep this much clear around every dot

function boxFor(c: CardInput, side: Side): Box {
  const { x, y } = c.at;
  const gap = c.kind === "property" ? STEM : GAP;
  switch (side) {
    case "above": return { x: x - c.w / 2, y: y - gap - c.h, w: c.w, h: c.h };
    case "below": return { x: x - c.w / 2, y: y + gap, w: c.w, h: c.h };
    case "left": return { x: x - gap - c.w, y: y - c.h / 2, w: c.w, h: c.h };
    case "right": return { x: x + gap, y: y - c.h / 2, w: c.w, h: c.h };
    case "above-left": return { x: x - c.w + 24, y: y - gap - c.h, w: c.w, h: c.h };
    case "above-right": return { x: x - 24, y: y - gap - c.h, w: c.w, h: c.h };
  }
}

function sidesFor(c: CardInput): Side[] {
  if (c.kind === "property") return ["above", "above-right", "above-left", "below", "right", "left"];
  if (!c.from) return ["right", "left", "above", "below"];
  // Prefer the side facing away from where the route arrives.
  const dx = c.at.x - c.from.x, dy = c.at.y - c.from.y;
  const dir: Record<"right" | "left" | "above" | "below", Pt> = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, above: { x: 0, y: -1 }, below: { x: 0, y: 1 } };
  return (Object.keys(dir) as (keyof typeof dir)[]).sort((a, b) => dir[b].x * dx + dir[b].y * dy - (dir[a].x * dx + dir[a].y * dy));
}

export function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

const covers = (b: Box, p: Pt) => p.x > b.x - DOT_R && p.x < b.x + b.w + DOT_R && p.y > b.y - DOT_R && p.y < b.y + b.h + DOT_R;

/** The point on the box edge facing the dot, where a stem or leader line joins. */
function jointFor(b: Box, side: Side): Pt {
  switch (side) {
    case "above": case "above-left": case "above-right": return { x: Math.min(Math.max(b.x + b.w / 2, b.x + 12), b.x + b.w - 12), y: b.y + b.h };
    case "below": return { x: b.x + b.w / 2, y: b.y };
    case "left": return { x: b.x + b.w, y: b.y + b.h / 2 };
    case "right": return { x: b.x, y: b.y + b.h / 2 };
  }
}

export function placeCards(cards: CardInput[], view?: Box): Placed[] {
  const placed: Placed[] = [];
  const dots = cards.map((c) => ({ id: c.id, at: c.at }));
  for (const c of [...cards].sort((a, b) => a.priority - b.priority)) {
    let best: { box: Box; side: Side; cost: number } | null = null;
    sidesFor(c).forEach((side, i) => {
      const box = boxFor(c, side);
      let cost = i * 40; // mild preference for earlier sides
      for (const p of placed) cost += overlap(box, p.box) * 10;
      for (const d of dots) if (d.id !== c.id && covers(box, d.at)) cost += 4000;
      if (view) {
        const outside = c.w * c.h - overlap(box, view);
        cost += outside * 4;
      }
      if (!best || cost < best.cost) best = { box, side, cost };
    });
    const b = best!;
    placed.push({ id: c.id, box: b.box, at: c.at, side: b.side, joint: stemJoint(b.box, b.side, c) });
  }
  return placed;
}

function stemJoint(box: Box, side: Side, c: CardInput): Pt {
  if (c.kind === "property" && (side === "above" || side === "above-left" || side === "above-right")) {
    // Stem goes straight up from the dot when the dot sits under the card.
    const x = Math.min(Math.max(c.at.x, box.x + 12), box.x + box.w - 12);
    return { x, y: box.y + box.h };
  }
  return jointFor(box, side);
}
