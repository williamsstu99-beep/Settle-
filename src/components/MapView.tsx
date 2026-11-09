"use client";

import { Map, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useMemo } from "react";
import { formatPrice, legKey } from "@/core/compare";
import { decodePolyline, measure, midpoint } from "@/core/polyline";
import type { Anchor, LatLng, Leg, Option } from "@/core/types";
import { HtmlMarker } from "./HtmlMarker";
import { Icon, optionIcon } from "./icons";
import { MAP_STYLE } from "./mapStyle";
import { RouteLayer, type DrawRoute, type Phase } from "./RouteLayer";

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
  runKey: string | null;
  phase: Phase;
  onPhase: (runKey: string, p: Phase) => void;
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
    map.fitBounds(b, { top: 70, bottom: 60, left: 60, right: 60 });
    // fitKey decides when we refit; points are read fresh at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);
  return null;
}

export default function MapView(p: Props) {
  const { comparing, options, anchors, legs, colorOf } = p;

  // Every route for the comparison, decoded once. Order of homes = order of the list.
  const routes = useMemo(() => {
    if (!comparing) return [];
    return options.flatMap((o) =>
      anchors.flatMap((a) => {
        const leg = legs.get(legKey(o.id, a.id, a.mode));
        if (leg?.status !== "ok" || !leg.polyline) return [];
        const path = decodePolyline(leg.polyline);
        return [{ key: legKey(o.id, a.id, a.mode), optionId: o.id, anchor: a, leg, color: colorOf(o.id), m: measure(path), mid: midpoint(path) }];
      }),
    );
  }, [comparing, options, anchors, legs, colorOf]);

  const drawRoutes: DrawRoute[] = useMemo(() => routes.map(({ key, optionId, color, m }) => ({ key, optionId, color, m })), [routes]);
  const order = useMemo(() => options.filter((o) => routes.some((r) => r.optionId === o.id)).map((o) => o.id), [options, routes]);

  const fitPoints = useMemo(() => {
    const focusOpt = options.find((o) => o.id === p.focus);
    const homes = focusOpt ? [focusOpt] : options;
    return [...homes.map((o) => o.location), ...anchors.map((a) => a.location)];
  }, [options, anchors, p.focus]);

  /** Has this home finished drawing its routes? */
  const drawn = (id: string) => p.phase === "done" || (typeof p.phase === "number" && order.indexOf(id) < p.phase && order.includes(id));
  const done = p.phase === "done";
  const badgesFor = done ? (p.focus ?? (order.length === 1 ? order[0] : null)) : null;

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
      <RouteLayer routes={drawRoutes} order={order} runKey={comparing ? p.runKey : null} focus={p.focus} onPhase={p.onPhase} />

      {routes
        .filter((r) => r.optionId === badgesFor && r.mid)
        .map((r) => (
          <HtmlMarker key={`${r.key}t`} position={r.mid!} zIndex={30}>
            <div className="tb" style={{ "--c": r.color } as React.CSSProperties}>
              <Icon name={r.anchor.icon} size={13} />
              {r.leg.minutes} min
            </div>
          </HtmlMarker>
        ))}

      {options.map((o) => {
        const past = comparing && !!p.focus && p.focus !== o.id;
        const drawing = comparing && typeof p.phase === "number" && order[p.phase] === o.id;
        const showTimes = comparing && drawn(o.id) && !past;
        const label = o.price ? formatPrice(o.price) : o.title;
        const times = showTimes ? routes.filter((r) => r.optionId === o.id) : [];
        return (
          <HtmlMarker key={o.id} position={o.location} zIndex={o.id === p.focus ? 25 : drawing ? 24 : past ? 5 : 15}>
            <button
              className={`mk${past ? " past" : ""}${drawing ? " drawing" : ""}`}
              style={{ "--c": colorOf(o.id) } as React.CSSProperties}
              onClick={() => p.onOptionClick(o.id)}
              aria-label={`${o.title}${o.subtitle ? `, ${o.subtitle}` : ""}`}
            >
              <span className="mk-box">
                <Icon name={optionIcon(o.propertyType)} size={13} />
                {label}
              </span>
              <span className="mk-dot" />
              {times.length > 0 && (
                <span className="mk-times">
                  {times.map((r) => (
                    <span key={r.key} title={`${r.anchor.name}: ${r.leg.minutes} min`}>
                      <Icon name={r.anchor.icon} size={11} />
                      {r.leg.minutes}m
                    </span>
                  ))}
                </span>
              )}
            </button>
          </HtmlMarker>
        );
      })}

      {anchors.map((a) => (
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
