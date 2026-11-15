"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clampHeight, DRAG_SLOP, nextSnap, settle, sheetHeights, type Snap } from "@/core/sheet";

type Drag = { y: number; h: number; lastY: number; lastT: number; v: number; moved: boolean };

/**
 * The phone bottom sheet's height and gestures (see core/sheet.ts).
 * - The handle and header drag the sheet; a tap on the handle steps it up.
 * - In the list, swiping up grows the sheet until it's full, and pulling down
 *   at the top of the list shrinks it, like Google Maps. Drag handles inside
 *   the list (`.grip`, `[data-no-sheet]`) are left alone.
 */
export function useSheet(enabled: boolean, initial: Snap) {
  const [viewport, setViewport] = useState(() => window.innerHeight);
  useEffect(() => {
    const on = () => setViewport(window.innerHeight);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const heights = useMemo(() => sheetHeights(viewport), [viewport]);
  const [snap, setSnap] = useState<Snap>(initial);
  const [dragH, setDragH] = useState<number | null>(null);
  const height = dragH ?? heights[snap];

  const drag = useRef<Drag | null>(null);
  const live = useRef({ height, snap, heights });
  useEffect(() => { live.current = { height, snap, heights }; });

  const begin = useCallback((y: number) => {
    drag.current = { y, h: live.current.height, lastY: y, lastT: performance.now(), v: 0, moved: false };
  }, []);
  /** Returns true once the gesture has become a drag. */
  const move = useCallback((y: number) => {
    const d = drag.current;
    if (!d) return false;
    if (!d.moved && Math.abs(d.y - y) < DRAG_SLOP) return false;
    d.moved = true;
    const t = performance.now(), dt = Math.max(1, t - d.lastT);
    d.v = 0.7 * ((d.lastY - y) / dt) + 0.3 * d.v; // px/ms, positive = growing
    d.lastY = y;
    d.lastT = t;
    setDragH(clampHeight(d.h + (d.y - y), live.current.heights));
    return true;
  }, []);
  const end = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) setSnap(settle(live.current.height, d.v, live.current.heights));
    setDragH(null);
    return !!d?.moved;
  }, []);

  /** Pointer handlers for the handle and header. Capture starts only once it's a drag, so taps on buttons still work. */
  const dragProps = (tap?: () => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (!enabled || (e.pointerType === "mouse" && e.button !== 0)) return;
      begin(e.clientY);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (!enabled || !drag.current) return;
      const was = drag.current.moved;
      if (move(e.clientY) && !was) e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerUp: () => {
      if (!enabled) return;
      if (!end()) tap?.();
    },
    onPointerCancel: () => enabled && end(),
  });

  /** The scrolling list inside the sheet: swipes resize the sheet until it's full or the list is at its top. */
  const content = useRef<HTMLElement | null>(null);
  const contentRef = useCallback((el: HTMLElement | null) => { content.current = el; }, []);
  useEffect(() => {
    const el = content.current;
    if (!enabled || !el) return;
    let start: { y: number; on: boolean; off: boolean } | null = null;
    const down = (e: TouchEvent) => {
      const t = e.target as Element | null;
      start = t?.closest(".grip, [data-no-sheet], input, textarea, select") ? null : { y: e.touches[0].clientY, on: false, off: false };
    };
    const moveT = (e: TouchEvent) => {
      if (!start || start.off) return;
      const y = e.touches[0].clientY, dy = y - start.y; // positive = finger moving down
      if (!start.on) {
        if (Math.abs(dy) < DRAG_SLOP) return;
        const { snap: s } = live.current;
        const pullDown = dy > 0 && el.scrollTop <= 0 && s !== "peek";
        const pushUp = dy < 0 && s !== "full";
        if (!pullDown && !pushUp) { start.off = true; return; }
        start.on = true;
        begin(start.y);
      }
      e.preventDefault();
      move(y);
    };
    const up = () => {
      if (start?.on) end();
      start = null;
    };
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchmove", moveT, { passive: false });
    el.addEventListener("touchend", up);
    el.addEventListener("touchcancel", up);
    return () => {
      el.removeEventListener("touchstart", down);
      el.removeEventListener("touchmove", moveT);
      el.removeEventListener("touchend", up);
      el.removeEventListener("touchcancel", up);
    };
  }, [enabled, begin, move, end]);

  return { snap, setSnap, height, dragging: dragH != null, heights, dragProps, contentRef, step: () => setSnap((s) => nextSnap(s)) };
}
