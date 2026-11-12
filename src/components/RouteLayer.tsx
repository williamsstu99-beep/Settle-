"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";
import { easeInOut, partialPath, type Measured } from "@/core/polyline";

/** One part of a route: the whole thing for most modes, walk/ride pieces for transit. */
export type RoutePart = { m: Measured; dashed: boolean };

export type DrawRoute = {
  key: string; // unique per home, place and mode
  optionId: string;
  color: string; // the place's route colour
  parts: RoutePart[];
  selected: boolean;
  /** Step-through reveal: wait this long after selection before drawing (ms). */
  delay?: number;
  /** How long this route takes to draw (ms); defaults to DRAW_MS. */
  drawMs?: number;
};

export const GREY = "#B5BBC3";
export const DRAW_MS = 1200; // coloured routes draw out of the hub
export const FADE_MS = 400; // colour fades back to grey when another home is selected
/** Step-through reveal: one place's route at a time. */
export const STEP_GAP = 650; // next route starts this long after the previous
export const STEP_DRAW = 600; // each route draws in this long

type Poly = Pick<google.maps.Polyline, "setOptions" | "setMap">;
type Part = { grey: Poly; casing: Poly; core: Poly; m: Measured; dashed: boolean; start: number; end: number };
export type Line = {
  route: DrawRoute;
  parts: Part[];
  colourAt: number | null; // when it became selected (draws out); null = already drawn
  greyAt: number | null; // when it stopped being selected (colour fades)
  dying: number | null; // removed (e.g. mode changed): everything fades out
};

/** Split a route's length into fractions per part, so one progress value can drive all parts. */
export function layoutParts(route: Pick<DrawRoute, "parts">): { m: Measured; dashed: boolean; start: number; end: number }[] {
  const total = route.parts.reduce((s, p) => s + p.m.total, 0) || 1;
  let acc = 0;
  return route.parts.map((p) => {
    const start = acc / total;
    acc += p.m.total;
    return { ...p, start, end: acc / total };
  });
}

/**
 * Match lines to routes. A route that becomes selected draws its colour out of
 * the hub; one that stops being selected fades its colour back to grey; a
 * removed route fades out completely.
 */
export function syncLines(lines: Map<string, Line>, routes: DrawRoute[], now: number, create: () => Poly, instant = false) {
  const want = new Set(routes.map((r) => r.key));
  for (const [k, l] of lines) {
    if (want.has(k)) continue;
    if (instant) {
      retire(l);
      lines.delete(k);
    } else if (l.dying == null) l.dying = now;
  }
  for (const r of routes) {
    const l = lines.get(r.key);
    if (!l) {
      lines.set(r.key, {
        route: r,
        parts: layoutParts(r).map((p) => ({ ...p, grey: create(), casing: create(), core: create() })),
        colourAt: r.selected && !instant ? now + (r.delay ?? 0) : null,
        greyAt: null,
        dying: null,
      });
      continue;
    }
    l.dying = null;
    if (r.selected && !l.route.selected) {
      l.colourAt = instant ? null : now + (r.delay ?? 0);
      l.greyAt = null;
    } else if (!r.selected && l.route.selected) {
      l.greyAt = instant ? now - FADE_MS : now;
      l.colourAt = null;
    }
    l.route = r;
  }
}

function retire(l: Line) {
  for (const p of l.parts) {
    p.grey.setMap(null);
    p.casing.setMap(null);
    p.core.setMap(null);
  }
}

/**
 * Every home's routes on the Google map: thin grey for all homes, and the
 * selected home's routes in each place's colour on a white casing, drawn out
 * of its hub (one place at a time when stepping), then marked with faint
 * direction chevrons pointing from the home to each place.
 */
export function RouteLayer({ routes, instant }: { routes: DrawRoute[]; instant: boolean }) {
  const map = useMap();
  const lines = useRef(new Map<string, Line>());
  const raf = useRef(0);

  useEffect(() => {
    if (!map) return;
    const ls = lines.current;
    const create = () => new google.maps.Polyline({ map, clickable: false, geodesic: false, visible: false });
    syncLines(ls, routes, performance.now(), create, instant);
    cancelAnimationFrame(raf.current);
    const tick = (t: number) => {
      raf.current = paint(ls, t) ? requestAnimationFrame(tick) : 0;
    };
    raf.current = paint(ls, performance.now()) ? requestAnimationFrame(tick) : 0;
  }, [map, routes, instant]);

  useEffect(() => {
    const ls = lines.current;
    return () => {
      cancelAnimationFrame(raf.current);
      for (const l of ls.values()) retire(l);
      ls.clear();
    };
  }, []);

  return null;
}

const dashes = (color: string, opacity: number, weight: number): google.maps.IconSequence => ({
  icon: { path: "M 0,-1 0,1", strokeColor: color, strokeOpacity: opacity, strokeWeight: weight, scale: 1.6 },
  offset: "0",
  repeat: `${Math.round(weight * 3)}px`,
});
const head = (color: string): google.maps.IconSequence => ({
  icon: { path: google.maps.SymbolPath.CIRCLE, scale: 5, fillColor: color, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 },
  offset: "100%",
});
/** Faint, still chevrons pointing along the route (home → place). */
const chevrons = (): google.maps.IconSequence => ({
  icon: { path: google.maps.SymbolPath.FORWARD_OPEN_ARROW, scale: 1.5, strokeColor: "#ffffff", strokeOpacity: 0.85, strokeWeight: 1.6 },
  offset: "36px",
  repeat: "72px",
});

/** Style every line for time `t`. Returns true while anything is still moving. */
export function paint(lines: Map<string, Line>, t: number): boolean {
  let moving = false;

  for (const [key, l] of lines) {
    const r = l.route;
    let fade = 1; // whole line, when removed
    if (l.dying != null) {
      fade = 1 - (t - l.dying) / FADE_MS;
      if (fade <= 0) {
        retire(l);
        lines.delete(key);
        continue;
      }
      moving = true;
    }

    // colour layer
    let colour = r.selected ? 1 : 0;
    let progress = 1;
    let drawing = false;
    if (r.selected && l.colourAt != null) {
      const p = Math.min(1, Math.max(0, (t - l.colourAt) / (r.drawMs ?? DRAW_MS)));
      progress = easeInOut(p);
      drawing = p < 1;
      if (p >= 1) l.colourAt = null;
      else moving = true;
    }
    if (!r.selected && l.greyAt != null) {
      colour = Math.max(0, 1 - (t - l.greyAt) / FADE_MS);
      if (colour > 0) moving = true;
      else l.greyAt = null;
    }
    colour *= fade;

    const lastLive = l.parts.findLastIndex((p) => progress > p.start);
    l.parts.forEach((p, i) => {
      const local = p.end > p.start ? (progress - p.start) / (p.end - p.start) : 1;
      const showColour = colour > 0 && local > 0;
      const path = showColour ? partialPath(p.m, Math.min(1, local)) : p.m.path;
      const icons: google.maps.IconSequence[] = [];
      if (showColour && p.dashed) icons.push(dashes(r.color, colour, 5));
      if (showColour && drawing && i === lastLive) icons.push(head(r.color));
      if (showColour && r.selected && !drawing && l.dying == null && !p.dashed) icons.push(chevrons());

      p.grey.setOptions({ visible: true, path: p.m.path, strokeColor: GREY, strokeOpacity: p.dashed ? 0 : 0.95 * fade, strokeWeight: 2, zIndex: 1, icons: p.dashed ? [dashes(GREY, 0.95 * fade, 2)] : [] });
      p.casing.setOptions({ visible: showColour, path, strokeColor: "#ffffff", strokeOpacity: colour, strokeWeight: 9, zIndex: 10 });
      p.core.setOptions({ visible: showColour, path, strokeColor: r.color, strokeOpacity: p.dashed ? 0 : colour, strokeWeight: 5, zIndex: 11, icons });
    });
  }
  return moving;
}
