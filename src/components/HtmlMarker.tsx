"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LatLng } from "@/core/types";

/**
 * Renders any React content pinned to a map position, using an OverlayView.
 * Works with or without a cloud Map ID, so the map's JSON style applies.
 */
export function HtmlMarker({ position, zIndex = 0, children }: { position: LatLng; zIndex?: number; children: React.ReactNode }) {
  const map = useMap();
  const [el] = useState(() => {
    const d = document.createElement("div");
    d.style.position = "absolute";
    return d;
  });
  const pos = useRef(position);
  const overlay = useRef<google.maps.OverlayView | null>(null);

  useEffect(() => {
    if (!map) return;
    class Overlay extends google.maps.OverlayView {
      onAdd() {
        this.getPanes()?.overlayMouseTarget.appendChild(el);
      }
      draw() {
        const p = this.getProjection()?.fromLatLngToDivPixel(new google.maps.LatLng(pos.current));
        if (p) {
          el.style.left = `${p.x}px`;
          el.style.top = `${p.y}px`;
        }
      }
      onRemove() {
        el.remove();
      }
    }
    const ov = new Overlay();
    google.maps.OverlayView.preventMapHitsAndGesturesFrom(el);
    ov.setMap(map);
    overlay.current = ov;
    return () => {
      ov.setMap(null);
      overlay.current = null;
    };
  }, [map, el]);

  useEffect(() => {
    pos.current = position;
    overlay.current?.draw();
  }, [position]);

  useEffect(() => {
    el.style.zIndex = String(zIndex);
  }, [el, zIndex]);

  return createPortal(children, el);
}
