import type { Anchor, LatLng, Mode, Option } from "./types";

/**
 * A saved day: the life anchors you visit, in order, as one trip.
 * Home → first → next → … (→ back home). Anchors you take out of the day stay
 * as their own trips from home, so their times are never lost.
 * With no day chosen, every anchor is its own trip from home (Settle's default).
 */
export type Day = {
  id: string;
  name: string;
  /** Anchor ids in visiting order. Anchors added later go on the end. */
  order: string[];
  /** Anchors taken out of this day (each stays its own trip from home). */
  skip: string[];
  /** Finish the day with the trip back home. */
  home: boolean;
};

export const MAX_DAYS = 6;

/** Leg ids for trips that start at an anchor rather than a home ("@gym" → work). */
export const fromAnchor = (anchorId: string) => `@${anchorId}`;

/** The day's colour for the trip back home (ink, like the logo's home dot). */
export const HOME_COLOR = "home";

/** One trip in a home's day. Every home in a plan gets the same shape, so trips line up by index. */
export type Trip = {
  /** Origin id: the home's id, or `@anchorId` when the trip starts at an anchor. */
  from: string;
  /** Destination id: an anchor's id, or the home's id for the trip back home. */
  to: string;
  origin: LatLng;
  destination: LatLng;
  /** Where the trip ends (a stand-in "Home" anchor for the trip back). Gives the name and colour. */
  anchor: Anchor;
  /** Where the trip starts, when that's an anchor (not home). */
  prev?: Anchor;
  /** Mode used unless this trip has an override. */
  defaultMode: Mode;
  /**
   * first: home → first stop of the day; chain: stop → next stop; back: last stop → home;
   * own: a trip from home on its own (no day, or an anchor taken out of the day).
   */
  kind: "first" | "chain" | "back" | "own";
};

/** The stand-in anchor for "back home" trips: named Home, coloured ink. */
export const homeStop = (o: Option): Anchor => ({ id: o.id, name: "Home", icon: "other", location: o.location, mode: "drive", color: HOME_COLOR });

/** Split anchors into the day's stops (in order) and the ones left as their own trips. */
export function dayStops(anchors: Anchor[], day?: Day | null): { stops: Anchor[]; own: Anchor[] } {
  if (!day) return { stops: [], own: anchors };
  const byId = new Map(anchors.map((a) => [a.id, a]));
  const ordered = [...new Set(day.order)].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const rest = anchors.filter((a) => !ordered.includes(a));
  const all = [...ordered, ...rest];
  const skip = new Set(day.skip);
  return { stops: all.filter((a) => !skip.has(a.id)), own: all.filter((a) => skip.has(a.id)) };
}

/** Every trip for one home on a day: the chained stops first, then each anchor that's its own trip. */
export function tripsFor(o: Option, anchors: Anchor[], day?: Day | null): Trip[] {
  const { stops, own } = dayStops(anchors, day);
  const trips: Trip[] = stops.map((a, i) => {
    const prev = i > 0 ? stops[i - 1] : undefined;
    return prev
      ? { from: fromAnchor(prev.id), to: a.id, origin: prev.location, destination: a.location, anchor: a, prev, defaultMode: a.mode, kind: "chain" }
      : { from: o.id, to: a.id, origin: o.location, destination: a.location, anchor: a, defaultMode: a.mode, kind: "first" };
  });
  const last = stops.at(-1);
  if (day?.home && last) {
    trips.push({ from: fromAnchor(last.id), to: o.id, origin: last.location, destination: o.location, anchor: homeStop(o), prev: last, defaultMode: last.mode, kind: "back" });
  }
  for (const a of own) trips.push({ from: o.id, to: a.id, origin: o.location, destination: a.location, anchor: a, defaultMode: a.mode, kind: "own" });
  return trips;
}

/** True when a trip is the same for every home (stop → stop), so ranking homes on it means nothing. */
export const sharedTrip = (t: Pick<Trip, "kind">) => t.kind === "chain";

/** Move the dragged stops into a new order. Ids not in `order` keep their relative place after it. */
export function reorderDay(day: Day, order: string[]): Day {
  return { ...day, order: [...order, ...day.order.filter((id) => !order.includes(id))] };
}

/** Take an anchor out of the day, or put it back at the end. */
export function toggleSkip(day: Day, anchorId: string): Day {
  return day.skip.includes(anchorId)
    ? { ...day, skip: day.skip.filter((id) => id !== anchorId), order: [...day.order.filter((id) => id !== anchorId), anchorId] }
    : { ...day, skip: [...day.skip, anchorId] };
}

/** A name for a new day that isn't taken: My day, Day 2, Day 3… */
export function newDayName(days: Day[]): string {
  const taken = new Set(days.map((d) => d.name));
  if (!taken.has("My day")) return "My day";
  for (let n = 2; ; n++) if (!taken.has(`Day ${n}`)) return `Day ${n}`;
}

/** Drop missing anchors from saved days (after an anchor is removed). */
export function pruneDays(days: Day[], anchors: Anchor[]): Day[] {
  const ids = new Set(anchors.map((a) => a.id));
  return days.map((d) => ({ ...d, order: d.order.filter((id) => ids.has(id)), skip: d.skip.filter((id) => ids.has(id)) }));
}

/** Where one item lands when dragged: its new index among the others, given the pointer's position. */
export function dropIndex(mids: number[], y: number): number {
  return mids.filter((m) => m < y).length;
}

/** Move `id` to `index` (counted without it). */
export function moveTo(ids: string[], id: string, index: number): string[] {
  const rest = ids.filter((x) => x !== id);
  const i = Math.max(0, Math.min(rest.length, index));
  return [...rest.slice(0, i), id, ...rest.slice(i)];
}
