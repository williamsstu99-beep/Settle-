"use client";

import { Map as GoogleMap, useMap } from "@vis.gl/react-google-maps";
import { memo, useEffect, useMemo, useState } from "react";
import { effectiveMode, formatPrice, legKey, type OptionSummary, type Overrides } from "@/core/compare";
import { fareLine, modeDetail, rankBadge, suburbOf } from "@/core/describe";
import { awayFrom, chooseSides, dockedBox, SIDES, type Pt, type Side, type SideItem } from "@/core/layout";
import { anchorColor, letterOf, type Swatch } from "@/core/plan";
import { decodePolyline, measure, midpoint } from "@/core/polyline";
import type { Anchor, LatLng, Leg, Mode, Option } from "@/core/types";
import { CountUp } from "./CountUp";
import { HtmlMarker } from "./HtmlMarker";
import { Icon, type IconName } from "./icons";
import { MAP_STYLE } from "./mapStyle";
import { DRAW_MS, RouteLayer, type DrawRoute } from "./RouteLayer";

const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID;

/**
 * Card geometry in px. Must match globals.css (.pm / .pcard / .am / .acard):
 * the side chooser uses these to keep cards apart.
 */
export const GEO = {
  hub: { sel: 68, unsel: 44 },
  tuck: 8, // cards tuck this far under their hub
  sel: { w: 304, hPhoto: 252, hNoPhoto: 148 },
  unsel: { w: 208, h: 80 },
  anchor: { w: 280, h: 104, hFare: 124, marker: 28 },
};

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
  legs: Map<string, Leg>;
  selected: string | null;
  /** Bumped by Compare / Replay so the selected home's routes redraw even if it's unchanged. */
  epoch: number;
  instant: boolean;
  fitKey: string;
  dropMode: boolean;
  onSelect: (id: string) => void;
  onDetail: (id: string) => void;
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
    // Room for cards beside hubs and place markers.
    map.fitBounds(b, { top: 150, bottom: 150, left: 200, right: 240 });
    // fitKey decides when we refit; points are read fresh at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);
  return null;
}

/** Zoom level, updated only when the map settles (never mid-zoom or while dragging). */
function useSettledZoom(): number | null {
  const map = useMap();
  const [zoom, setZoom] = useState<number | null>(null);
  useEffect(() => {
    if (!map) return;
    const l = map.addListener("idle", () => {
      const z = map.getZoom();
      if (z != null && map.getProjection()) setZoom(Math.round(z * 4) / 4);
    });
    return () => l.remove();
  }, [map]);
  return zoom;
}

type HomeCardProps = {
  o: Option;
  letter: string;
  row?: OptionSummary;
  selected: boolean;
  side: Side;
  growKey: string;
  onSelect: (id: string) => void;
  onDetail: (id: string) => void;
};

/** Hub at the listing's exact location, with its card docked beside it. No connector line. */
const HomeMarker = memo(function HomeMarker({ o, letter, row, selected, side, growKey, onSelect, onDetail }: HomeCardProps) {
  const sub = [letter, o.subtitle?.split(",")[0], o.bedrooms ? `${o.bedrooms} bed` : null].filter(Boolean).join(" · ");
  const travel = row?.dailyMinutes != null ? `${hm(row.dailyMinutes)}/day travel` : "Working out travel…";
  const price = o.price ? formatPrice(o.price).replace(/\/(wk|mo)$/, "") : null;
  const per = o.price?.period === "month" ? "/mo" : o.price?.period === "week" ? "/wk" : "";
  return (
    <div className={`pm side-${side}${selected ? " sel" : ""}`}>
      <div key={`${side}${selected ? growKey : ""}`} className={`pcard${selected ? " sel" : ""}${selected && o.photo ? " photo" : ""}`} onClick={() => onSelect(o.id)} role="button" tabIndex={0} aria-label={`${letter}: ${o.title}${selected ? ", selected" : ""}`} onKeyDown={(e) => e.key === "Enter" && onSelect(o.id)}>
        {selected && o.photo && (
          <div className="pc-photo">
            {/* Small external TradeMe photo; next/image would need remote-host config for little gain. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={o.photo} alt="" />
            <span className="chip-sel">Selected</span>
          </div>
        )}
        <div className="pc-body">
          {selected && !o.photo && <span className="chip-sel inline">Selected</span>}
          <div className="pc-row">
            <b className="pc-name">{o.title}</b>
            {price && <b className="pc-price">{price}{selected && <small>{per}</small>}</b>}
          </div>
          <div className="pc-sub">{sub}</div>
          <div className="pc-row last">
            <span className="pc-travel">{travel}</span>
            {selected ? (
              <button className="pc-more" aria-label={`Details for ${o.title}`} onClick={(e) => { e.stopPropagation(); onDetail(o.id); }}>
                <Icon name="arrow" size={14} />
              </button>
            ) : (
              <Icon name="chev" size={14} className="pc-chev" />
            )}
          </div>
        </div>
      </div>
      <button className={`hub${selected ? " sel" : ""}`} onClick={() => onSelect(o.id)} aria-label={`Select ${o.title}`}>
        <Icon name="house2" size={selected ? 38 : 24} />
      </button>
    </div>
  );
});

type PlaceProps = {
  a: Anchor;
  sw: Swatch;
  side: Side;
  view?: { minutes: number | null | undefined; mode: Mode; leg?: Leg };
  badge: { text: string; strong: boolean } | null;
  countKey: string;
  instant: boolean;
  onClick: (id: string) => void;
};

/** Place marker at the exact location, with a tabbed card whose edge it sits on. */
const PlaceMarker = memo(function PlaceMarker({ a, sw, side, view, badge, countKey, instant, onClick }: PlaceProps) {
  const fare = view ? fareLine({ mode: view.mode, leg: view.leg }) : null;
  const style = { "--tab": sw.tab, "--text": sw.text, "--route": sw.route, "--marker": sw.marker } as React.CSSProperties;
  return (
    <div className={`am side-${side}`} style={style}>
      <div key={side} className={`acard${fare ? " fare" : ""}`} onClick={() => onClick(a.id)} role="button" tabIndex={0} aria-label={`Edit ${a.name}`} onKeyDown={(e) => e.key === "Enter" && onClick(a.id)}>
        <div className="atab"><b>{a.name}</b>{suburbOf(a) && <span>{suburbOf(a)}</span>}</div>
        <div className="abody">
          <div className="arow">
            <span className="atime">
              {typeof view?.minutes === "number" ? <CountUp key={countKey} value={view.minutes} ms={DRAW_MS} instant={instant} /> : view?.minutes === null ? "–" : "…"}
              <small>min</small>
            </span>
            {badge && <span className={`rank${badge.strong ? " strong" : ""}`}>{badge.text}</span>}
          </div>
          <div className="amode"><Icon name={view?.mode ?? a.mode} size={14} />{modeDetail({ mode: view?.mode ?? a.mode, leg: view?.leg })}</div>
          {fare && <div className="afare">{fare}</div>}
        </div>
      </div>
      <span className="amark"><Icon name="anchor" size={15} /></span>
    </div>
  );
});

export default function MapView(p: Props) {
  const map = useMap();
  const { options, anchors, legs, overrides, selected, rows } = p;
  const sel = options.find((o) => o.id === selected);
  const zoom = useSettledZoom();

  // Every home's routes (grey) and the selected home's in place colours. Each route
  // starts exactly at its home's location (the hub) and ends at the place's marker.
  const routes = useMemo(
    () =>
      options.flatMap((o) =>
        anchors.flatMap((a, ai) => {
          const mode = effectiveMode(overrides, o.id, a);
          const leg = legs.get(legKey(o.id, a.id, mode));
          if (leg?.status !== "ok" || !leg.polyline) return [];
          const steps = leg.steps?.map((s) => ({ ...s, path: decodePolyline(s.polyline) })).filter((s) => s.path.length > 1);
          const pieces = steps?.length ? steps.map((s) => ({ path: s.path, dashed: s.kind === "walk" })) : [{ path: decodePolyline(leg.polyline), dashed: mode === "walk" }];
          pieces[0] = { ...pieces[0], path: [o.location, ...pieces[0].path] };
          const last = pieces.length - 1;
          pieces[last] = { ...pieces[last], path: [...pieces[last].path, a.location] };
          const isSel = o.id === selected;
          const rides = isSel ? (steps ?? []).filter((s) => s.kind === "ride" && s.line).map((s) => ({ line: s.line!, vehicle: s.vehicle, at: midpoint(s.path)! })) : [];
          return [{
            key: `${isSel ? p.epoch : 0}:${legKey(o.id, a.id, mode)}`,
            optionId: o.id,
            color: anchorColor(a, ai).route,
            parts: pieces.map((x) => ({ m: measure(x.path), dashed: x.dashed })),
            selected: isSel,
            rides,
            pts: isSel ? pieces.flatMap((x) => x.path.filter((_, i) => i % 3 === 0)) : [],
          }];
        }),
      ),
    [options, anchors, legs, overrides, selected, p.epoch],
  );
  const drawRoutes: DrawRoute[] = useMemo(() => routes.map(({ key, optionId, color, parts, selected: s }) => ({ key, optionId, color, parts, selected: s })), [routes]);

  /* ---------- card sides: recomputed only when homes/places, selection, selected routes or zoom change ---------- */
  const [sides, setSides] = useState<Record<string, Side>>({});
  const idsKey = `${options.map((o) => `${o.id}${o.photo ? "p" : ""}`).join(",")}|${anchors.map((a) => a.id).join(",")}|${selected}`;
  const routeKey = routes.filter((r) => r.selected).map((r) => r.key).join(",");
  useEffect(() => {
    if (!map || zoom == null) return;
    const proj = map.getProjection();
    if (!proj) return;
    const scale = 2 ** zoom;
    const px = (ll: LatLng): Pt => {
      const w = proj.fromLatLngToPoint(new google.maps.LatLng(ll));
      return w ? { x: w.x * scale, y: w.y * scale } : { x: 0, y: 0 };
    };
    const selAt = sel ? px(sel.location) : undefined;
    const items: SideItem[] = [];
    const markers: { id: string; at: Pt; r: number }[] = [];
    for (const o of options) {
      const at = px(o.location), isSel = o.id === selected;
      const hub = isSel ? GEO.hub.sel : GEO.hub.unsel;
      const w = isSel ? GEO.sel.w : GEO.unsel.w, h = isSel ? (o.photo ? GEO.sel.hPhoto : GEO.sel.hNoPhoto) : GEO.unsel.h;
      const reach = hub / 2 - GEO.tuck;
      items.push({ id: `o:${o.id}`, at, priority: isSel ? 0 : 2, prefer: ["right", "left", "below", "above"], boxes: Object.fromEntries(SIDES.map((s) => [s, dockedBox(at, w, h, s, reach)])) as SideItem["boxes"] });
      markers.push({ id: `o:${o.id}`, at, r: hub / 2 + 4 });
    }
    for (const a of anchors) {
      const at = px(a.location);
      items.push({ id: `a:${a.id}`, at, priority: 1, prefer: awayFrom(at, selAt), boxes: Object.fromEntries(SIDES.map((s) => [s, dockedBox(at, GEO.anchor.w, GEO.anchor.hFare, s, 0)])) as SideItem["boxes"] });
      markers.push({ id: `a:${a.id}`, at, r: GEO.anchor.marker / 2 + 4 });
    }
    const routePts = routes.filter((r) => r.selected).flatMap((r) => r.pts.map(px));
    const raf = requestAnimationFrame(() => setSides((prev) => chooseSides(items, markers, routePts, prev)));
    return () => cancelAnimationFrame(raf);
    // Deliberately not on every render or pan: only these inputs move cards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, zoom, idsKey, routeKey]);

  const fitPoints = useMemo(() => [...options.map((o) => o.location), ...anchors.map((a) => a.location)], [options, anchors]);
  const summary = useMemo(() => new Map(rows.map((r) => [r.option.id, r])), [rows]);
  const selRow = selected ? summary.get(selected) : undefined;
  const growKey = `${selected}:${p.epoch}`;

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

      {routes
        .flatMap((r) => r.rides.map((ride, i) => ({ r, ride, i })))
        .map(({ r, ride, i }) => (
          <HtmlMarker key={`${r.key}l${i}`} position={ride.at} zIndex={5}>
            <div className="line-tag" style={{ "--c": r.color } as React.CSSProperties}>
              <Icon name={vehicleIcon(ride.vehicle)} size={11} />
              {ride.line}
            </div>
          </HtmlMarker>
        ))}

      {anchors.map((a, ai) => {
        const l = selRow?.legs[ai];
        return (
          <HtmlMarker key={a.id} position={a.location} zIndex={20}>
            <PlaceMarker
              a={a}
              sw={anchorColor(a, ai)}
              side={sides[`a:${a.id}`] ?? "right"}
              view={l ? { minutes: l.minutes, mode: l.mode, leg: l.leg } : undefined}
              badge={selected ? rankBadge(rows, ai, selected) : null}
              countKey={`${growKey}:${l?.mode}:${l?.minutes}`}
              instant={p.instant}
              onClick={p.onAnchorClick}
            />
          </HtmlMarker>
        );
      })}

      {options.map((o, i) => (
        <HtmlMarker key={o.id} position={o.location} zIndex={o.id === selected ? 40 : 30}>
          <HomeMarker
            o={o}
            letter={letterOf(i)}
            row={summary.get(o.id)}
            selected={o.id === selected}
            side={sides[`o:${o.id}`] ?? "right"}
            growKey={growKey}
            onSelect={p.onSelect}
            onDetail={p.onDetail}
          />
        </HtmlMarker>
      ))}
    </GoogleMap>
  );
}
