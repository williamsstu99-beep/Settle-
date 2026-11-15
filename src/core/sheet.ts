/**
 * The phone bottom sheet: the panel slides over a full-screen map and rests at
 * one of three heights, each tied to what it shows.
 * - peek: the header and the top of the list; the map is the star.
 * - half: map above, list below.
 * - full: for reading and forms; a strip of map stays visible at the top.
 */

export type Snap = "peek" | "half" | "full";
export const SNAPS: Snap[] = ["peek", "half", "full"];

/** Map left showing above the sheet at full height, so it still reads as a sheet. */
export const SHEET_TOP_GAP = 72;
/** Header plus the first line of the list. */
export const SHEET_PEEK = 148;
/** A drag past the end stretches a little, then stops. */
export const SHEET_STRETCH = 24;
/** Drags shorter than this are taps. */
export const DRAG_SLOP = 6;
/** A release faster than this (px per ms) is a flick: one step in its direction. */
export const FLICK = 0.45;

export type Heights = Record<Snap, number>;

/** Heights in px for a viewport of this height. Always peek < half < full. */
export function sheetHeights(viewport: number): Heights {
  const full = Math.max(SHEET_PEEK + 160, Math.round(viewport - SHEET_TOP_GAP));
  const peek = SHEET_PEEK;
  const half = Math.min(full - 80, Math.max(peek + 80, Math.round(viewport * 0.5)));
  return { peek, half, full };
}

/** Keep a dragged height within the stops, with a little stretch past each end. */
export function clampHeight(h: number, heights: Heights): number {
  return Math.min(heights.full + SHEET_STRETCH, Math.max(heights.peek - SHEET_STRETCH, h));
}

/**
 * Where a released drag comes to rest. A flick moves one stop in its direction
 * from where it was let go; a slow release settles on the nearest stop.
 * @param velocity px per ms, positive when the sheet is growing (dragged up)
 */
export function settle(height: number, velocity: number, heights: Heights): Snap {
  if (Math.abs(velocity) >= FLICK) {
    const up = velocity > 0;
    const ahead = SNAPS.filter((s) => (up ? heights[s] > height + 1 : heights[s] < height - 1));
    if (ahead.length) return up ? ahead[0] : ahead[ahead.length - 1];
  }
  return SNAPS.reduce((a, b) => (Math.abs(heights[b] - height) < Math.abs(heights[a] - height) ? b : a));
}

/** Tapping the handle: step up, and from the top come back to half. */
export function nextSnap(s: Snap): Snap {
  return s === "peek" ? "half" : s === "half" ? "full" : "half";
}
