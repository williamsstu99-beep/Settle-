/**
 * Mobile mode: smaller map cards that stay readable on a phone. It switches on
 * by itself on narrow screens, and a toggle can force either view. The choice
 * is remembered per device as "auto", "mobile" or "desktop".
 */

export type ViewPref = "auto" | "mobile" | "desktop";
export type View = "mobile" | "desktop";

/** Screens at or below this width count as narrow (matches the stacked layout in globals.css). */
export const NARROW_PX = 760;

export function readPref(raw: string | null | undefined): ViewPref {
  return raw === "mobile" || raw === "desktop" ? raw : "auto";
}

export function resolveView(pref: ViewPref, narrow: boolean): View {
  return pref === "auto" ? (narrow ? "mobile" : "desktop") : pref;
}

/**
 * The preference after pressing the toggle: the other view. If that's what the
 * screen would pick anyway, go back to "auto" so it keeps following the screen.
 */
export function togglePref(pref: ViewPref, narrow: boolean): ViewPref {
  const next: View = resolveView(pref, narrow) === "mobile" ? "desktop" : "mobile";
  return resolveView("auto", narrow) === next ? "auto" : next;
}

/**
 * Mobile card geometry in px. Must match the `.app.mobile` rules in globals.css:
 * the side chooser uses these to keep cards apart.
 */
export const MOBILE_GEO = {
  hub: { sel: 34, unsel: 24 },
  tuck: 5,
  home: { h: 24, hSel: 36, open: { w: 200, h: 250 } },
  anchor: { h: 22, hTime: 52, marker: 20, max: 150 },
};

/** Width of a home's tab: house name only, 12px bold (about 6.6px a character). */
export const mobileHomeWidth = (title: string, selected = false) => Math.min(170, Math.round((selected ? 30 : 24) + 6.6 * title.length));

/** Width of an anchor card: its name tab, or the "18 min" row with a mode icon if that's wider. */
export const mobileAnchorWidth = (name: string, timed: boolean) => Math.min(MOBILE_GEO.anchor.max, Math.max(timed ? 84 : 0, Math.round(26 + 6.9 * name.length)));
