"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placeCards, type Box, type CardInput, type Placed, type Pt } from "@/core/layout";
import type { LatLng } from "@/core/types";

export type MapCard = {
  id: string;
  kind: "property" | "anchor";
  at: LatLng;
  w: number;
  h: number;
  priority: number;
  /** Anchors: where their route comes from, so the card sits on the far side. */
  from?: LatLng;
  dot: React.ReactNode; // drawn exactly on the location
  card: React.ReactNode; // drawn in the placed box
  leader: string; // stem / connector colour
  z?: number;
};

const blocked = new WeakSet<HTMLElement>();
const hold = (el: HTMLElement | null) => {
  // Clicks and drags on cards shouldn't pan the map.
  if (el && !blocked.has(el)) {
    google.maps.OverlayView.preventMapHitsAndGesturesFrom(el);
    blocked.add(el);
  }
};

/**
 * Every map card in one overlay. On each redraw (pan end, zoom, data change)
 * it projects the dots to pixels, places the cards so they don't collide, and
 * draws stems from each dot to its card.
 */
export function CardLayer({ cards }: { cards: MapCard[] }) {
  const map = useMap();
  const [el] = useState(() => {
    const d = document.createElement("div");
    d.style.position = "absolute";
    d.style.zIndex = "20"; // above transit line badges
    return d;
  });
  const [pix, setPix] = useState<{ pts: Record<string, Pt>; from: Record<string, Pt>; view: Box } | null>(null);
  const latest = useRef(cards);
  const overlay = useRef<google.maps.OverlayView | null>(null);

  useEffect(() => {
    latest.current = cards;
    overlay.current?.draw();
  }, [cards]);

  useEffect(() => {
    if (!map) return;
    class Overlay extends google.maps.OverlayView {
      onAdd() {
        this.getPanes()?.overlayMouseTarget.appendChild(el);
      }
      draw() {
        const proj = this.getProjection();
        if (!proj) return;
        const px = (ll: LatLng) => {
          const p = proj.fromLatLngToDivPixel(new google.maps.LatLng(ll));
          return p ? { x: p.x, y: p.y } : { x: 0, y: 0 };
        };
        const pts: Record<string, Pt> = {}, from: Record<string, Pt> = {};
        for (const c of latest.current) {
          pts[c.id] = px(c.at);
          if (c.from) from[c.id] = px(c.from);
        }
        const div = map!.getDiv();
        const tl = proj.fromContainerPixelToLatLng(new google.maps.Point(0, 0));
        const br = proj.fromContainerPixelToLatLng(new google.maps.Point(div.offsetWidth, div.offsetHeight));
        const a = tl ? px({ lat: tl.lat(), lng: tl.lng() }) : { x: 0, y: 0 };
        const b = br ? px({ lat: br.lat(), lng: br.lng() }) : { x: div.offsetWidth, y: div.offsetHeight };
        const inset = 10;
        setPix({ pts, from, view: { x: a.x + inset, y: a.y + inset, w: b.x - a.x - inset * 2, h: b.y - a.y - inset * 2 } });
      }
      onRemove() {
        el.remove();
      }
    }
    const ov = new Overlay();
    ov.setMap(map);
    overlay.current = ov;
    const idle = map.addListener("idle", () => ov.draw());
    return () => {
      idle.remove();
      ov.setMap(null);
      overlay.current = null;
    };
  }, [map, el]);

  const placed = useMemo(() => {
    if (!pix) return new Map<string, Placed>();
    const inputs: CardInput[] = cards.filter((c) => pix.pts[c.id]).map((c) => ({ id: c.id, kind: c.kind, at: pix.pts[c.id], w: c.w, h: c.h, priority: c.priority, from: pix.from[c.id] }));
    return new Map(placeCards(inputs, pix.view).map((p) => [p.id, p]));
  }, [pix, cards]);

  return createPortal(
    <>
      <svg className="leaders" width="1" height="1" aria-hidden="true">
        {cards.map((c) => {
          const p = placed.get(c.id);
          return p ? <line key={c.id} x1={p.at.x} y1={p.at.y} x2={p.joint.x} y2={p.joint.y} stroke={c.leader} /> : null;
        })}
      </svg>
      {cards.map((c) => {
        const p = placed.get(c.id);
        if (!p) return null;
        return (
          <div key={c.id} style={{ zIndex: c.z ?? 1 }}>
            <div className="mdot" style={{ left: p.at.x, top: p.at.y }} ref={hold}>{c.dot}</div>
            <div className="mcard" style={{ left: p.box.x, top: p.box.y, width: c.w, height: c.h }} ref={hold}>{c.card}</div>
          </div>
        );
      })}
    </>,
    el,
  );
}

/** Counts a number up from 0 over `ms`, once per key change. */
export function CountUp({ value, ms, instant }: { value: number; ms: number; instant: boolean }) {
  const [shown, setShown] = useState(instant ? value : 0);
  useEffect(() => {
    if (instant) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, instant]);
  return <>{instant ? value : shown}</>;
}
