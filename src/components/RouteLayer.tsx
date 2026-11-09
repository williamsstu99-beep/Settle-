"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef } from "react";
import { easeInOut, partialPath, type Measured } from "@/core/polyline";

export type Phase = number | "done" | null; // index of the home being drawn, "done", or not started

export type DrawRoute = { key: string; optionId: string; color: string; m: Measured };

const GREY = "#B3B8C0";
export const DRAW_MS = 1500; // one home's routes, drawn together
export const GAP_MS = 250; // pause before the next home starts
export const FADE_MS = 600; // settle into the muted overview

export type Line = { glow: google.maps.Polyline; core: google.maps.Polyline };
export type RunState = { phase: Phase; start: number; fadeStart: number; raf: number };
export type Live = { routes: DrawRoute[]; order: string[]; focus: string | null; runKey: string | null; onPhase: (runKey: string, p: Phase) => void };

/**
 * Draws comparison routes on the Google map, imperatively, one home at a time.
 * Every home's routes animate together from the home outwards along the real
 * road path; earlier homes stay visible; at the end everything settles into a
 * muted overview where one home can be focused.
 */
export function RouteLayer({
  routes,
  order,
  runKey,
  focus,
  onPhase,
}: {
  routes: DrawRoute[];
  order: string[];
  runKey: string | null;
  focus: string | null;
  onPhase: (runKey: string, p: Phase) => void;
}) {
  const map = useMap();
  const lines = useRef(new Map<string, Line>());
  const state = useRef<RunState>({ phase: null, start: 0, fadeStart: 0, raf: 0 });
  const live = useRef<Live>({ routes, order, focus, runKey, onPhase });

  // Keep the latest props for the animation loop without restarting it.
  useEffect(() => {
    live.current = { routes, order, focus, runKey, onPhase };
  });

  /* create / remove polylines to match the routes */
  useEffect(() => {
    if (!map) return;
    const want = new Set(routes.map((r) => r.key));
    for (const [k, l] of lines.current) {
      if (!want.has(k)) {
        l.glow.setMap(null);
        l.core.setMap(null);
        lines.current.delete(k);
      }
    }
    for (const r of routes) {
      if (lines.current.has(r.key)) continue;
      const base = { map, clickable: false, geodesic: false, visible: false, strokeColor: r.color };
      lines.current.set(r.key, {
        glow: new google.maps.Polyline({ ...base, strokeOpacity: 0.16, strokeWeight: 13 }),
        core: new google.maps.Polyline({ ...base, strokeOpacity: 1, strokeWeight: 4 }),
      });
    }
    paint(lines.current, state.current, live.current, performance.now());
  }, [map, routes]);

  /* remove everything on unmount */
  useEffect(() => {
    const ls = lines.current;
    const st = state.current;
    return () => {
      cancelAnimationFrame(st.raf);
      for (const l of ls.values()) {
        l.glow.setMap(null);
        l.core.setMap(null);
      }
      ls.clear();
    };
  }, []);

  /* start a run whenever runKey changes */
  useEffect(() => {
    const st = state.current;
    cancelAnimationFrame(st.raf);
    if (!runKey) {
      st.phase = null;
      paint(lines.current, state.current, live.current, performance.now());
      return;
    }
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const now = performance.now();
    st.phase = reduce || !order.length ? "done" : 0;
    st.start = now;
    st.fadeStart = reduce ? now - FADE_MS : now;
    const key = runKey;
    const tick = (t: number) => {
      if (live.current.runKey !== key) return;
      advance(state.current, live.current, t);
      paint(lines.current, state.current, live.current, t);
      const s = state.current;
      if (s.phase !== "done" || t - s.fadeStart < FADE_MS) s.raf = requestAnimationFrame(tick);
    };
    st.raf = requestAnimationFrame((t) => {
      live.current.onPhase(key, st.phase);
      tick(t);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  /* focusing a home ends the sequence and repaints */
  useEffect(() => {
    const st = state.current;
    if (focus && typeof st.phase === "number" && runKey) {
      cancelAnimationFrame(st.raf);
      st.phase = "done";
      st.fadeStart = performance.now() - FADE_MS;
      live.current.onPhase(runKey, "done");
    }
    paint(lines.current, state.current, live.current, performance.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return null;
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

export function paint(lines: Map<string, Line>, st: RunState, live: Live, t: number) {
  const { routes, order, focus } = live;
  const fade = st.phase === "done" ? Math.min(1, (t - st.fadeStart) / FADE_MS) : 0;
  for (const r of routes) {
    const l = lines.get(r.key);
    if (!l) continue;
    const idx = order.indexOf(r.optionId);
    let visible = true, path = r.m.path, color = r.color, opacity = 1, weight = 4, glow = 0, z = 10, head = false;

    if (st.phase === null || idx < 0) {
      visible = false;
    } else if (typeof st.phase === "number") {
      if (idx > st.phase) visible = false;
      else if (idx === st.phase) {
        const p = easeInOut(Math.min(1, (t - st.start) / DRAW_MS));
        path = partialPath(r.m, p);
        glow = 0.18;
        z = 30;
        head = p < 1;
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
      weight = 4 - 1 * fade;
      z = 10 + idx;
    }

    l.core.setOptions({
      visible,
      path,
      strokeColor: color,
      strokeOpacity: opacity,
      strokeWeight: weight,
      zIndex: z + 1,
      icons: head
        ? [{ icon: { path: google.maps.SymbolPath.CIRCLE, scale: 5, fillColor: color, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 }, offset: "100%" }]
        : [],
    });
    l.glow.setOptions({ visible: visible && glow > 0, path, strokeColor: color, strokeOpacity: glow, zIndex: z });
  }
}
