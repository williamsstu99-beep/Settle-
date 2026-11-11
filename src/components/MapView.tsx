"use client";

import { Map as GoogleMap, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useMemo } from "react";
import { effectiveMode, formatPrice, legKey, type OptionSummary, type Overrides } from "@/core/compare";
import { anchorColor } from "@/core/plan";
import { decodePolyline, measure, midpoint } from "@/core/polyline";
import type { Anchor, LatLng, Leg, Option } from "@/core/types";
import { CardLayer, CountUp, type MapCard } from "./CardLayer";
import { HtmlMarker } from "./HtmlMarker";
import { Icon, MODE_LABEL, type IconName } from "./icons";
import { MAP_STYLE } from "./mapStyle";
import { DRAW_MS, RouteLayer, type DrawRoute } from "./RouteLayer";

const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID;

/** Card sizes in px. Must match .pc / .pc.big / .ac in globals.css (placement uses them). */
export const SIZES = { compact: { w: 176, h: 46 }, expanded: { w: 248, h: 188 }, anchor: { w: 214, h: 56 } };

const vehicleIcon = (v?: string): IconName => (v && /RAIL|TRAIN|SUBWAY|TRAM|METRO/.test(v) ? "train" : v === "FERRY" ? "ferry" : "transit");

function hm(min: number): string {
  if (min < 60) return `${min} m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} m` : `${h} h`;
}

type Props = {
  anchors: Anchor[];
  options: Option[];
  rows: OptionSummary[];
  overrides: Overrides;
  colorOf: (id: string) => string;
  legs: Map<string, Leg>;
  selected: string | null;
  /** Bumped by Compare / Replay so every route redraws even if the selection is unchanged. */
  epoch: number;
  showAll: boolean;
  instant: boolean;
  fitKey: string;
  dropMode: boolean;
  onSelect: (id: string) => void;
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
    // Room for the cards: home cards sit above their dots, place cards beside theirs.
    map.fitBounds(b, { top: 210, bottom: 80, left: 130, right: 130 });
    // fitKey decides when we refit; points are read fresh at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);
  return null;
}

export default function MapView(p: Props) {
  const { options, anchors, legs, overrides, selected, colorOf, rows, showAll } = p;
  const sel = options.find((o) => o.id === selected);

  // The selected home's routes in each place's colour; other homes faintly if asked.
  const routes = useMemo(() => {
    const homes = showAll ? options : sel ? [sel] : [];
    return homes.flatMap((o) =>
      anchors.flatMap((a, ai) => {
        const mode = effectiveMode(overrides, o.id, a);
        const leg = legs.get(legKey(o.id, a.id, mode));
        if (leg?.status !== "ok" || !leg.polyline) return [];
        const path = decodePolyline(leg.polyline);
        const steps = leg.steps?.map((s) => ({ ...s, path: decodePolyline(s.polyline) })).filter((s) => s.path.length > 1);
        const parts = steps?.length ? steps.map((s) => ({ m: measure(s.path), dashed: s.kind === "walk" })) : [{ m: measure(path), dashed: mode === "walk" }];
        const rides = (steps ?? []).filter((s) => s.kind === "ride" && s.line).map((s) => ({ line: s.line!, vehicle: s.vehicle, at: midpoint(s.path)! }));
        return [{ key: `${p.epoch}:${legKey(o.id, a.id, mode)}`, optionId: o.id, anchor: a, color: anchorColor(a, ai), parts, rides, faint: o.id !== selected }];
      }),
    );
  }, [options, anchors, legs, overrides, selected, sel, showAll, p.epoch]);

  const drawRoutes: DrawRoute[] = useMemo(() => routes.map(({ key, optionId, color, parts, faint }) => ({ key, optionId, color, parts, faint })), [routes]);

  const selectKey = `${selected}:${p.epoch}`;
  const fitPoints = useMemo(() => [...options.map((o) => o.location), ...anchors.map((a) => a.location)], [options, anchors]);

  const cards: MapCard[] = useMemo(() => {
    const out: MapCard[] = [];
    const summary = new Map(rows.map((r) => [r.option.id, r]));
    for (const o of options) {
      const big = o.id === selected;
      const r = summary.get(o.id);
      const daily = r?.dailyMinutes != null ? `${hm(r.dailyMinutes)}/day travel` : "…";
      const size = big ? SIZES.expanded : SIZES.compact;
      out.push({
        id: `o:${o.id}`,
        kind: "property",
        at: o.location,
        ...size,
        priority: big ? 0 : 2,
        leader: big ? "#1A1D23" : "#C9CDD3",
        z: big ? 30 : 10,
        dot: <span key={big ? selectKey : "c"} className={`odot${big ? " big" : ""}`} style={{ "--c": colorOf(o.id) } as React.CSSProperties} />,
        card: big ? (
          <button key={selectKey} className="pc big" onClick={() => p.onSelect(o.id)} aria-label={`${o.title}, selected`}>
            <span className="pc-photo">
              {/* Small external TradeMe thumbnail; next/image would need remote-host config for little gain. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {o.photo ? <img src={o.photo} alt="" loading="lazy" /> : <span className="pc-nophoto"><Icon name="house" size={20} />No photo</span>}
            </span>
            <span className="pc-body">
              <span className="pc-row"><b>{o.title}</b>{o.price && <b>{formatPrice(o.price)}</b>}</span>
              <span className="pc-sub">{[o.subtitle, o.bedrooms ? `${o.bedrooms} bed` : null].filter(Boolean).join(" · ")}</span>
              <span className="pc-row"><span className="pc-travel">{daily}</span>{r?.leastTravel && <span className="tag">Least travel</span>}</span>
            </span>
          </button>
        ) : (
          <button className="pc" onClick={() => p.onSelect(o.id)} style={{ "--c": colorOf(o.id) } as React.CSSProperties} aria-label={`Select ${o.title}`}>
            <span className="dot" />
            <span className="pc-c">
              <b>{o.title}</b>
              <span>{[o.price ? formatPrice(o.price) : null, r?.dailyMinutes != null ? `${hm(r.dailyMinutes)}/day` : null].filter(Boolean).join(" · ")}</span>
            </span>
          </button>
        ),
      });
    }
    const selRow = selected ? summary.get(selected) : undefined;
    anchors.forEach((a, ai) => {
      const color = anchorColor(a, ai);
      const leg = selRow?.legs.find((l) => l.anchor.id === a.id);
      const where = a.address?.split(",").map((s) => s.trim()).filter(Boolean);
      const suburb = where && where.length > 1 ? where[where.length > 2 ? 1 : 0] : where?.[0];
      out.push({
        id: `a:${a.id}`,
        kind: "anchor",
        at: a.location,
        ...SIZES.anchor,
        priority: 1,
        from: sel?.location,
        leader: color,
        z: 20,
        dot: <span className="adot" style={{ "--a": color } as React.CSSProperties} />,
        card: (
          <button className="ac" style={{ "--a": color } as React.CSSProperties} onClick={() => p.onAnchorClick(a.id)} aria-label={`Edit ${a.name}`}>
            <span className="ac-l">
              <b>{a.name}</b>
              <span>{suburb ?? " "}</span>
            </span>
            <span className="ac-r">
              <b>
                {typeof leg?.minutes === "number" ? (
                  <><CountUp key={`${selectKey}${leg.mode}${leg.minutes}`} value={leg.minutes} ms={DRAW_MS} instant={p.instant} /> min</>
                ) : leg?.minutes === null ? "–" : "…"}
              </b>
              <span>{leg ? MODE_LABEL[leg.mode] : MODE_LABEL[a.mode]}</span>
            </span>
          </button>
        ),
      });
    });
    return out;
  }, [options, anchors, rows, selected, sel, colorOf, selectKey, p]);

  return (
    <GoogleMap
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
      <RouteLayer routes={drawRoutes} instant={p.instant} />
      <CardLayer cards={cards} />

      {routes
        .filter((r) => !r.faint)
        .flatMap((r) => r.rides.map((ride, i) => ({ r, ride, i })))
        .map(({ r, ride, i }) => (
          <HtmlMarker key={`${r.key}l${i}`} position={ride.at} zIndex={5}>
            <div className="line-tag" style={{ "--c": r.color } as React.CSSProperties}>
              <Icon name={vehicleIcon(ride.vehicle)} size={11} />
              {ride.line}
            </div>
          </HtmlMarker>
        ))}
    </GoogleMap>
  );
}
