"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";
import { easeInOut, partialPath, type Measured } from "@/core/polyline";

export type Phase = number | "done" | null; // index of the home being drawn, "done", or not started

/** One part of a route: the whole thing for most modes, walk/ride pieces for transit. */
export type RoutePart = { m: Measured; dashed: boolean };

export type DrawRoute = {
  key: string; // unique per home, place and mode
  pair: string; // home + place, so a mode change can replace the old line
  optionId: string;
  color: string;
  parts: RoutePart[];
};

const GREY = "#B3B8C0";
export const DRAW_MS = 1500; // one home's routes, drawn together
export const GAP_MS = 250; // pause before the next home starts
export const FADE_MS = 600; // settle into the muted overview
export const SWAP_MS = 1100; // a single route redrawn after a mode change
export const FADE_OUT_MS = 350; // the old line when a mode changes

type Poly = Pick<google.maps.Polyline, "setOptions" | "setMap">;
type Part = { glow: Poly; core: Poly; m: Measured; dashed: boolean; start: number; end: number };
export type Line = { route: DrawRoute; parts: Part[]; born: number | null; dying: number | null };
export type RunState = { phase: Phase; start: number; fadeStart: number; raf: number };
export type Live = { order: string[]; focus: string | null; runKey: string | null; onPhase: (runKey: string, p: Phase) => void };

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
  return { route, born, dying: null, parts: layoutParts(route).map((p) => ({ ...p, glow: create(), core: create() })) };
}

/**
 * Draws comparison routes on the Google map, imperatively, one home at a time.
 * Every home's routes animate together from the home outwards along the real
 * road path; earlier homes stay visible; at the end everything settles into a
 * muted overview where one home can be focused. After that, changing one
 * route's mode fades the old line and draws the new one in its place.
 */
export function RouteLayer({ routes, order, runKey, focus, onPhase }: { routes: DrawRoute[]; order: string[]; runKey: string | null; focus: string | null; onPhase: (runKey: string, p: Phase) => void }) {
  const map = useMap();
  const lines = useRef(new Map<string, Line>());
  const state = useRef<RunState>({ phase: null, start: 0, fadeStart: 0, raf: 0 });
  const live = useRef<Live>({ order, focus, runKey, onPhase });

  useEffect(() => {
    live.current = { order, focus, runKey, onPhase };
  });

  const loop = useRef<() => void>(() => {});
  useEffect(() => {
    loop.current = () => {
      const st = state.current;
      if (st.raf) return;
      const tick = (t: number) => {
        st.raf = 0;
        advance(st, live.current, t);
        if (paint(lines.current, st, live.current, t)) st.raf = requestAnimationFrame(tick);
      };
      st.raf = requestAnimationFrame(tick);
    };
  });

  /* create / retire lines to match the routes */
  useEffect(() => {
    if (!map) return;
    const now = performance.now();
    const create = () => new google.maps.Polyline({ map, clickable: false, geodesic: false, visible: false });
    syncLines(lines.current, routes, state.current.phase === "done", now, create);
    paint(lines.current, state.current, live.current, now);
    loop.current();
  }, [map, routes]);

  /* remove everything on unmount */
  useEffect(() => {
    const ls = lines.current;
    const st = state.current;
    return () => {
      cancelAnimationFrame(st.raf);
      st.raf = 0;
      for (const l of ls.values()) retire(l);
      ls.clear();
    };
  }, []);

  /* start a run whenever runKey changes */
  useEffect(() => {
    const st = state.current;
    cancelAnimationFrame(st.raf);
    st.raf = 0;
    if (!runKey) {
      st.phase = null;
      paint(lines.current, st, live.current, performance.now());
      return;
    }
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const now = performance.now();
    st.phase = reduce || !order.length ? "done" : 0;
    st.start = now;
    st.fadeStart = reduce ? now - FADE_MS : now;
    for (const l of lines.current.values()) l.born = null;
    const key = runKey;
    requestAnimationFrame(() => {
      if (live.current.runKey === key) live.current.onPhase(key, st.phase);
      loop.current();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  /* focusing a home ends the sequence and repaints */
  useEffect(() => {
    const st = state.current;
    if (focus && typeof st.phase === "number" && runKey) {
      st.phase = "done";
      st.fadeStart = performance.now() - FADE_MS;
      live.current.onPhase(runKey, "done");
    }
    paint(lines.current, st, live.current, performance.now());
    loop.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return null;
}

/**
 * Match lines to routes. Before the sequence has finished, lines just appear
 * and disappear (the sequence draws them). Afterwards a new route draws itself
 * in and a removed one fades out, so a mode change swaps one line smoothly.
 */
export function syncLines(lines: Map<string, Line>, routes: DrawRoute[], settled: boolean, now: number, create: () => Poly) {
  const want = new Set(routes.map((r) => r.key));
  for (const [k, l] of lines) {
    if (want.has(k)) continue;
    if (!settled) {
      retire(l);
      lines.delete(k);
    } else if (l.dying == null) l.dying = now;
  }
  for (const r of routes) {
    const existing = lines.get(r.key);
    if (existing) {
      existing.dying = null;
      existing.route = r;
    } else lines.set(r.key, makeLine(r, create, settled ? now : null));
  }
}

function retire(l: Line) {
  for (const p of l.parts) {
    p.glow.setMap(null);
    p.core.setMap(null);
  }
}

export function advance(st: RunState, live: Live, t: number) {
  if (typeof st.phase !== "number") return;
  const n = live.order.length;
  while (typeof st.phase === "number" && t - st.start >= DRAW_MS + GAP_MS) {
    st.start += DRAW_MS + GAP_MS;
    st.phase = st.phase + 1 >= n ? "done" : st.phase + 1;
    if (st.phase === "done") st.fadeStart = t;
    if (live.runKey) live.onPhase(live.runKey, st.phase);
  }
}

const dash = (color: string, opacity: number, weight: number, offset = "0"): google.maps.IconSequence => ({
  icon: { path: "M 0,-1 0,1", strokeColor: color, strokeOpacity: opacity, strokeWeight: weight, scale: 1.6 },
  offset,
  repeat: `${Math.round(weight * 3)}px`,
});
const headDot = (color: string): google.maps.IconSequence => ({
  icon: { path: google.maps.SymbolPath.CIRCLE, scale: 5, fillColor: color, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 },
  offset: "100%",
});

/** Style every line for time `t`. Returns true while anything is still moving. */
export function paint(lines: Map<string, Line>, st: RunState, live: Live, t: number): boolean {
  const { order, focus } = live;
  const fade = st.phase === "done" ? Math.min(1, (t - st.fadeStart) / FADE_MS) : 0;
  let moving = typeof st.phase === "number" || (st.phase === "done" && fade < 1);

  for (const [key, l] of lines) {
    const r = l.route;
    const idx = order.indexOf(r.optionId);
    let visible = true, progress = 1, color = r.color, opacity = 1, weight = 4, glow = 0, z = 10, head = false;

    if (st.phase === null || idx < 0) {
      visible = false;
    } else if (typeof st.phase === "number") {
      if (idx > st.phase) visible = false;
      else if (idx === st.phase) {
        progress = easeInOut(Math.min(1, Math.max(0, (t - st.start) / DRAW_MS)));
        glow = 0.18;
        z = 30;
        head = progress < 1;
      } else {
        opacity = 0.6;
        weight = 3;
        z = 10 + idx;
      }
    } else if (focus) {
      if (r.optionId === focus) {
        weight = 4.5;
        glow = 0.18;
        z = 40;
      } else {
        color = GREY;
        opacity = 0.55;
        weight = 2.5;
        z = 5;
      }
    } else {
      opacity = 1 - 0.55 * easeInOut(fade); // settle to a muted overview
      weight = 4 - fade;
      z = 10 + idx;
    }

    // a route that changed mode after the sequence: draw it in on its own
    if (visible && l.born != null) {
      const p = Math.min(1, Math.max(0, (t - l.born) / SWAP_MS));
      progress = Math.min(progress, easeInOut(p));
      head = head || p < 1;
      glow = Math.max(glow, 0.18 * (1 - p) + glow * p);
      z += 20;
      if (p >= 1) l.born = null;
      else moving = true;
    }
    // the line it replaced: fade out, then remove
    if (l.dying != null) {
      const f = 1 - (t - l.dying) / FADE_OUT_MS;
      if (f <= 0) {
        retire(l);
        lines.delete(key);
        continue;
      }
      opacity *= f;
      glow *= f;
      head = false;
      moving = true;
    }

    const lastLive = l.parts.findLastIndex((p) => progress > p.start);
    l.parts.forEach((p, i) => {
      const local = p.end > p.start ? (progress - p.start) / (p.end - p.start) : 1;
      const show = visible && local > 0;
      const path = show ? partialPath(p.m, Math.min(1, local)) : p.m.path;
      const icons: google.maps.IconSequence[] = [];
      if (p.dashed) icons.push(dash(color, opacity, weight));
      if (head && i === lastLive) icons.push(headDot(color));
      p.core.setOptions({
        visible: show,
        path,
        strokeColor: color,
        strokeOpacity: p.dashed ? 0 : opacity,
        strokeWeight: weight,
        zIndex: z + 1,
        icons,
      });
      p.glow.setOptions({ visible: show && glow > 0 && !p.dashed, path, strokeColor: color, strokeOpacity: glow, strokeWeight: weight + 9, zIndex: z });
    });
  }
  return moving;
}
