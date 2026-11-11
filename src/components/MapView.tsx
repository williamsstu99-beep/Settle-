"use client";

import { Map, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useMemo } from "react";
import { effectiveMode, formatPrice, legKey, pairKey, type Overrides } from "@/core/compare";
import { decodePolyline, measure, midpoint } from "@/core/polyline";

const vehicleIcon = (v?: string): IconName => (v && /RAIL|TRAIN|SUBWAY|TRAM|METRO/.test(v) ? "train" : v === "FERRY" ? "ferry" : "transit");
import type { Anchor, LatLng, Leg, Option } from "@/core/types";
import type { IconName } from "./icons";
import { HtmlMarker } from "./HtmlMarker";
import { Icon, optionIcon } from "./icons";
import { MAP_STYLE } from "./mapStyle";
import { RouteLayer, type DrawRoute, type Phase } from "./RouteLayer";

const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID;

type Props = {
  anchors: Anchor[];
  options: Option[];
  overrides: Overrides;
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
  const { comparing, options, anchors, legs, colorOf, overrides } = p;

  // Every route for the comparison, decoded once. Order of homes = order of the list.
  const routes = useMemo(() => {
    if (!comparing) return [];
    return options.flatMap((o) =>
      anchors.flatMap((a) => {
        const mode = effectiveMode(overrides, o.id, a);
        const leg = legs.get(legKey(o.id, a.id, mode));
        if (leg?.status !== "ok" || !leg.polyline) return [];
        const path = decodePolyline(leg.polyline);
        // Transit: walking parts dashed, rides solid, each ride labelled with its line.
        const steps = leg.steps?.map((s) => ({ ...s, path: decodePolyline(s.polyline) })).filter((s) => s.path.length > 1);
        const parts = steps?.length ? steps.map((s) => ({ m: measure(s.path), dashed: s.kind === "walk" })) : [{ m: measure(path), dashed: mode === "walk" }];
        const rides = (steps ?? []).filter((s) => s.kind === "ride" && s.line).map((s) => ({ line: s.line!, vehicle: s.vehicle, at: midpoint(s.path)! }));
        return [{ key: legKey(o.id, a.id, mode), pair: pairKey(o.id, a.id), optionId: o.id, anchor: a, mode, leg, color: colorOf(o.id), parts, rides, mid: midpoint(path) }];
      }),
    );
  }, [comparing, options, anchors, legs, colorOf, overrides]);

  const drawRoutes: DrawRoute[] = useMemo(() => routes.map(({ key, pair, optionId, color, parts }) => ({ key, pair, optionId, color, parts })), [routes]);
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
              <Icon name={r.mode} size={13} />
              {r.leg.minutes} min
            </div>
          </HtmlMarker>
        ))}

      {routes
        .filter((r) => r.optionId === badgesFor)
        .flatMap((r) => r.rides.map((ride, i) => ({ r, ride, i })))
        .map(({ r, ride, i }) => (
          <HtmlMarker key={`${r.key}l${i}`} position={ride.at} zIndex={31}>
            <div className="line-tag" style={{ "--c": r.color } as React.CSSProperties}>
              <Icon name={vehicleIcon(ride.vehicle)} size={11} />
              {ride.line}
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
