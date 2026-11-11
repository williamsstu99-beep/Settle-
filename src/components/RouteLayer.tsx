"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";
import { easeInOut, partialPath, type Measured } from "@/core/polyline";

/** One part of a route: the whole thing for most modes, walk/ride pieces for transit. */
export type RoutePart = { m: Measured; dashed: boolean };

export type DrawRoute = {
  key: string; // unique per home, place and mode
  optionId: string;
  color: string; // the place's colour
  parts: RoutePart[];
  /** Background route of a home that isn't selected ("Show all routes"). */
  faint?: boolean;
};

const GREY = "#AEB4BD";
export const DRAW_MS = 1200; // routes leave the home and reach each place
export const FEED_MS = 850; // then a light travels back along the route into the home
export const FADE_OUT_MS = 380; // routes of the previously selected home

type Poly = Pick<google.maps.Polyline, "setOptions" | "setMap">;
type Part = { casing: Poly; core: Poly; m: Measured; dashed: boolean; start: number; end: number };
export type Line = { route: DrawRoute; parts: Part[]; born: number | null; dying: number | null };

/** Split a route's length into fractions per part, so one progress value can drive all parts. */
export function layoutParts(route: DrawRoute): { m: Measured; dashed: boolean; start: number; end: number }[] {
  const total = route.parts.reduce((s, p) => s + p.m.total, 0) || 1;
  let acc = 0;
  return route.parts.map((p) => {
    const start = acc / total;
    acc += p.m.total;
    return { ...p, start, end: acc / total };
  });
}

export function makeLine(route: DrawRoute, create: () => Poly, born: number | null): Line {
  return { route, born, dying: null, parts: layoutParts(route).map((p) => ({ ...p, casing: create(), core: create() })) };
}

/**
 * Match lines to routes: new routes draw themselves in (unless `instant`),
 * removed routes fade out and are then taken off the map.
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
    const existing = lines.get(r.key);
    if (existing) {
      existing.dying = null;
      existing.route = r;
    } else lines.set(r.key, makeLine(r, create, instant ? null : now));
  }
}

function retire(l: Line) {
  for (const p of l.parts) {
    p.casing.setMap(null);
    p.core.setMap(null);
  }
}

/**
 * Draws the given routes on the Google map. Changing the set of routes (a
 * different home selected, or one route's mode changed) fades the old lines
 * and draws the new ones from the home outwards, then sends a light back
 * along each into the home.
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
    const tick = (t: number) => {
      raf.current = paint(ls, t) ? requestAnimationFrame(tick) : 0;
    };
    cancelAnimationFrame(raf.current);
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

const dash = (color: string, opacity: number, weight: number): google.maps.IconSequence => ({
  icon: { path: "M 0,-1 0,1", strokeColor: color, strokeOpacity: opacity, strokeWeight: weight, scale: 1.6 },
  offset: "0",
  repeat: `${Math.round(weight * 3)}px`,
});
const dot = (color: string, offset: string, fill = color, scale = 5): google.maps.IconSequence => ({
  icon: { path: google.maps.SymbolPath.CIRCLE, scale, fillColor: fill, fillOpacity: 1, strokeColor: fill === "#ffffff" ? color : "#ffffff", strokeWeight: fill === "#ffffff" ? 3 : 2 },
  offset,
});

/** Style every line for time `t`. Returns true while anything is still moving. */
export function paint(lines: Map<string, Line>, t: number): boolean {
  let moving = false;
  for (const [key, l] of lines) {
    const r = l.route;
    const color = r.faint ? GREY : r.color;
    let opacity = r.faint ? 0.5 : 1;
    const weight = r.faint ? 2.5 : 4;
    let casing = r.faint ? 0 : 0.95;
    let progress = 1;
    let head = false;
    let feed: number | null = null; // 1 → 0: position of the light travelling home

    if (l.born != null) {
      const age = t - l.born;
      const p = Math.min(1, Math.max(0, age / DRAW_MS));
      progress = easeInOut(p);
      head = p < 1;
      if (p >= 1 && !r.faint && age < DRAW_MS + FEED_MS) feed = 1 - easeInOut((age - DRAW_MS) / FEED_MS);
      if (age >= DRAW_MS + (r.faint ? 0 : FEED_MS)) l.born = null;
      else moving = true;
    }
    if (l.dying != null) {
      const f = 1 - (t - l.dying) / FADE_OUT_MS;
      if (f <= 0) {
        retire(l);
        lines.delete(key);
        continue;
      }
      opacity *= f;
      casing *= f;
      head = false;
      feed = null;
      moving = true;
    }

    const lastLive = l.parts.findLastIndex((p) => progress > p.start);
    const z = r.faint ? 1 : l.dying != null ? 5 : 10;
    l.parts.forEach((p, i) => {
      const local = p.end > p.start ? (progress - p.start) / (p.end - p.start) : 1;
      const show = local > 0;
      const path = show ? partialPath(p.m, Math.min(1, local)) : p.m.path;
      const icons: google.maps.IconSequence[] = [];
      if (p.dashed) icons.push(dash(color, opacity, weight));
      if (head && i === lastLive) icons.push(dot(color, "100%"));
      if (feed != null && feed >= p.start && feed <= p.end) {
        const at = p.end > p.start ? (feed - p.start) / (p.end - p.start) : 0;
        icons.push(dot(color, `${(at * 100).toFixed(1)}%`, "#ffffff", 4.5));
      }
      p.core.setOptions({ visible: show, path, strokeColor: color, strokeOpacity: p.dashed ? 0 : opacity, strokeWeight: weight, zIndex: z + 1, icons });
      p.casing.setOptions({ visible: show && casing > 0, path, strokeColor: "#ffffff", strokeOpacity: casing, strokeWeight: weight + 4, zIndex: z });
    });
  }
  return moving;
}
