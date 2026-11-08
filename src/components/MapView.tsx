"use client";

import { Map, Polyline, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useMemo } from "react";
import { legKey } from "@/core/compare";
import { decodePolyline, midpoint } from "@/core/polyline";
import type { Anchor, LatLng, Leg, Option } from "@/core/types";
import { formatPrice } from "@/core/compare";
import { HtmlMarker } from "./HtmlMarker";
import { Icon, optionIcon } from "./icons";
import { MAP_STYLE } from "./mapStyle";

const GREY = "#B3B8C0";
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID;

type Props = {
  anchors: Anchor[];
  options: Option[];
  colorOf: (id: string) => string;
  legs: Map<string, Leg>;
  comparing: boolean;
  focus: string | null;
  fitKey: string;
  dropMode: boolean;
  onOptionClick: (id: string) => void;
  onAnchorClick: (id: string) => void;
  onMapClick: (p: LatLng) => void;
};

function FitBounds({ points, fitKey }: { points: LatLng[]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !points.length) return;
    if (points.length === 1) {
      map.panTo(points[0]);
      map.setZoom(14);
      return;
    }
    const b = new google.maps.LatLngBounds();
    points.forEach((p) => b.extend(p));
    map.fitBounds(b, { top: 70, bottom: 50, left: 60, right: 60 });
    // fitKey decides when we refit; points are read fresh at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);
  return null;
}

export default function MapView(p: Props) {
  const routes = useMemo(() => {
    if (!p.comparing) return [];
    const order = [...p.options].sort((a, b) => Number(a.id === p.focus) - Number(b.id === p.focus));
    return order.flatMap((o) =>
      p.anchors.flatMap((a) => {
        const leg = p.legs.get(legKey(o.id, a.id, a.mode));
        if (leg?.status !== "ok" || !leg.polyline) return [];
        const path = decodePolyline(leg.polyline);
        return [{ o, a, leg, path, mid: midpoint(path) }];
      }),
    );
  }, [p.comparing, p.options, p.anchors, p.legs, p.focus]);

  const fitPoints = useMemo(() => {
    const focusOpt = p.options.find((o) => o.id === p.focus);
    const homes = focusOpt ? [focusOpt] : p.options;
    return [...homes.map((o) => o.location), ...p.anchors.map((a) => a.location)];
  }, [p.options, p.anchors, p.focus]);

  const showTimesFor = p.focus ?? (p.options.length === 1 ? p.options[0]?.id : null);

  return (
    <Map
      defaultCenter={fitPoints[0] ?? { lat: -36.8485, lng: 174.7633 }}
      defaultZoom={12}
      gestureHandling="greedy"
      disableDefaultUI
      zoomControl
      clickableIcons={false}
      mapId={MAP_ID}
      styles={MAP_ID ? undefined : MAP_STYLE}
      draggableCursor={p.dropMode ? "crosshair" : undefined}
      onClick={(e) => {
        const ll = e.detail.latLng;
        if (ll) p.onMapClick(ll);
      }}
      style={{ position: "absolute", inset: 0 }}
    >
      <FitBounds points={fitPoints} fitKey={p.fitKey} />

      {routes.map(({ o, a, path }) => {
        const isF = p.focus === o.id, grey = !!p.focus && !isF;
        const col = grey ? GREY : p.colorOf(o.id);
        const w = grey ? 2.5 : isF ? 4 : 3.2;
        const z = grey ? 1 : isF ? 20 : 10;
        return [
          !grey && <Polyline key={`${o.id}${a.id}g`} path={path} strokeColor={col} strokeOpacity={0.16} strokeWeight={w + 9} zIndex={z} clickable={false} />,
          <Polyline key={`${o.id}${a.id}c`} path={path} strokeColor={col} strokeOpacity={grey ? 0.85 : 1} strokeWeight={w} zIndex={z + 1} clickable={false} />,
        ];
      })}

      {routes
        .filter((r) => r.o.id === showTimesFor && r.mid)
        .map(({ o, a, leg, mid }) => (
          <HtmlMarker key={`${o.id}${a.id}t`} position={mid!} zIndex={30}>
            <div className="tb" style={{ "--c": p.colorOf(o.id) } as React.CSSProperties}>
              <Icon name={a.mode} size={13} />
              {leg.minutes} min
            </div>
          </HtmlMarker>
        ))}

      {p.options.map((o) => {
        const past = p.comparing && !!p.focus && p.focus !== o.id;
        const label = o.price ? formatPrice(o.price) : o.title;
        return (
          <HtmlMarker key={o.id} position={o.location} zIndex={o.id === p.focus ? 25 : past ? 5 : 15}>
            <button
              className={`mk${past ? " past" : ""}`}
              style={{ "--c": p.colorOf(o.id) } as React.CSSProperties}
              onClick={() => p.onOptionClick(o.id)}
              aria-label={`${o.title}${o.subtitle ? `, ${o.subtitle}` : ""}`}
            >
              <span className="mk-box">
                <Icon name={optionIcon(o.propertyType)} size={13} />
                {label}
              </span>
              <span className="mk-dot" />
            </button>
          </HtmlMarker>
        );
      })}

      {p.anchors.map((a) => (
        <HtmlMarker key={a.id} position={a.location} zIndex={28}>
          <button className="ak" onClick={() => p.onAnchorClick(a.id)} aria-label={`Edit ${a.name}`}>
            <span className="ak-pin">
              <Icon name={a.icon} size={15} />
            </span>
            <span className="ak-lbl">{a.name}</span>
          </button>
        </HtmlMarker>
      ))}
    </Map>
  );
}
