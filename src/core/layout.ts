/**
 * Which side of its marker each map card sits on. Cards are drawn at a fixed
 * CSS offset from their marker, so once a side is chosen the card moves with
 * the map by itself. This only runs when the homes or places, the selection or
 * the zoom level change; it never runs on pan. A card keeps its previous side
 * while that side is still clear, so cards don't flip back and forth.
 *
 * Pure and deterministic; works in any pixel space (world pixels at the
 * current zoom are fine, since only relative positions matter).
 */

export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };
export type Side = "right" | "left" | "above" | "below";
export const SIDES: Side[] = ["right", "left", "above", "below"];

export type SideItem = {
  id: string;
  at: Pt; // the marker's centre
  /** The card's box for each side, relative to nothing: absolute pixels. */
  boxes: Record<Side, Box>;
  /** Sides in order of preference. */
  prefer: Side[];
  priority: number; // lower is placed first and gets first pick
};

export function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

const inside = (b: Box, p: Pt, pad = 0) => p.x > b.x - pad && p.x < b.x + b.w + pad && p.y > b.y - pad && p.y < b.y + b.h + pad;

/**
 * @param markers every marker centre (hubs and place markers), so cards don't cover them
 * @param routePts sample points along the selected home's routes, so cards avoid them
 * @param prev the previous choice, kept when still clear (hysteresis)
 */
export function chooseSides(items: SideItem[], markers: { id: string; at: Pt; r: number }[], routePts: Pt[], prev: Record<string, Side> = {}): Record<string, Side> {
  const kept = solve(items, markers, routePts, prev);
  if (!Object.keys(prev).length) return kept;
  // Keeping old sides can box a card in. If it does, also try a fresh layout and take the cleaner one.
  const keptBad = collisions(items, kept);
  if (keptBad === 0) return kept;
  const fresh = solve(items, markers, routePts, {});
  return collisions(items, fresh) < keptBad ? fresh : kept;
}

/** Total overlap area between cards for a choice of sides. */
export function collisions(items: SideItem[], sides: Record<string, Side>): number {
  let total = 0;
  for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) total += overlap(items[a].boxes[sides[items[a].id]], items[b].boxes[sides[items[b].id]]);
  return total;
}

function solve(items: SideItem[], markers: { id: string; at: Pt; r: number }[], routePts: Pt[], prev: Record<string, Side>): Record<string, Side> {
  const order = [...items].sort((a, b) => a.priority - b.priority);
  const out: Record<string, Side> = {};

  const score = (it: SideItem, side: Side, others: Box[]) => {
    const box = it.boxes[side];
    let collide = 0;
    for (const o of others) collide += overlap(box, o);
    for (const m of markers) if (m.id !== it.id && inside(box, m.at, m.r)) collide += 5000;
    let routes = 0;
    for (const p of routePts) if (inside(box, p)) routes++;
    return { side, collide, total: collide * 10 + routes * 60 + it.prefer.indexOf(side) * 30 };
  };
  const pick = (it: SideItem, others: Box[], stay?: Side) => {
    const scored = it.prefer.map((side) => score(it, side, others));
    let best = scored.reduce((a, b) => (b.total < a.total ? b : a));
    const keep = stay ? scored.find((s) => s.side === stay) : undefined;
    // Hysteresis: stay put unless that side now collides and a better one exists.
    if (keep && keep.collide === 0 && keep.total <= best.total + 400) best = keep;
    return best.side;
  };

  // 1) Greedy: higher priority first, each against the cards already placed.
  const placed: Box[] = [];
  for (const it of order) {
    out[it.id] = pick(it, placed, prev[it.id]);
    placed.push(it.boxes[out[it.id]]);
  }
  // 2) Refine: each card reconsiders against every other card, until nothing moves.
  for (let round = 0; round < 4; round++) {
    let moved = false;
    for (const it of order) {
      const others = order.filter((o) => o.id !== it.id).map((o) => o.boxes[out[o.id]]);
      const side = pick(it, others, out[it.id]);
      if (side !== out[it.id]) {
        out[it.id] = side;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

/**
 * Card box for a side, given the marker centre, the card size and how the
 * card docks: `reach` is how far from the centre the card's near edge sits
 * (negative tucks the card under the marker).
 */
export function dockedBox(at: Pt, w: number, h: number, side: Side, reach: number): Box {
  switch (side) {
    case "right": return { x: at.x + reach, y: at.y - h / 2, w, h };
    case "left": return { x: at.x - reach - w, y: at.y - h / 2, w, h };
    case "above": return { x: at.x - w / 2, y: at.y - reach - h, w, h };
    case "below": return { x: at.x - w / 2, y: at.y + reach, w, h };
  }
}

/** Sides ordered to face away from where routes come from (for place cards). */
export function awayFrom(at: Pt, from?: Pt): Side[] {
  if (!from) return [...SIDES];
  const dx = at.x - from.x, dy = at.y - from.y;
  const dir: Record<Side, Pt> = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, above: { x: 0, y: -1 }, below: { x: 0, y: 1 } };
  return [...SIDES].sort((a, b) => dir[b].x * dx + dir[b].y * dy - (dir[a].x * dx + dir[a].y * dy));
}
