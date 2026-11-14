"use client";

import { Map as GoogleMap, useMap } from "@vis.gl/react-google-maps";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { effectiveMode, formatPrice, legKey, type OptionSummary, type Overrides } from "@/core/compare";
import { fareLine, modeDetail, rankBadge, suburbOf } from "@/core/describe";
import { awayFrom, chooseSides, dockedBox, SIDES, type Pt, type Side, type SideItem } from "@/core/layout";
import { anchorColor, letterOf, type Swatch } from "@/core/plan";
import { homeFacts, listingUrl, MAX_PHOTOS, photosOf } from "@/core/home";
import { MOBILE_GEO, mobileAnchorWidth, mobileHomeWidth } from "@/core/view";
import { decodePolyline, measure, midpoint } from "@/core/polyline";
import type { Anchor, LatLng, Leg, Mode, Option } from "@/core/types";
import { CountUp } from "./CountUp";
import { imageFiles, shrinkImage } from "./photos";
import { HtmlMarker } from "./HtmlMarker";
import { Icon, type IconName } from "./icons";
import { MAP_STYLE } from "./mapStyle";
import { DRAW_MS, RouteLayer, STEP_DRAW, STEP_GAP, type DrawRoute } from "./RouteLayer";

const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID;

/**
 * Card geometry in px. Must match globals.css (.pm / .pcard / .am / .acard):
 * the side chooser uses these to keep cards apart.
 */
export const GEO = {
  hub: { sel: 46, unsel: 28 },
  tuck: 6, // cards tuck this far under their hub
  sel: { w: 216, hPhoto: 154 },
  unsel: { h: 26 }, // width follows the text: see tabWidth
  anchor: { w: 228, h: 92, hFare: 108, hTab: 30, marker: 24 },
};

/** Width of an unselected home's "Name · $price" tab (12px Inter, measured). */
export const tabWidth = (o: Option) => Math.round(26 + 6.4 * (o.title.length + (o.price ? String(o.price.amount).length + 4 : 0)));
const tabText = (o: Option) => (o.price ? `${o.title} · ${formatPrice(o.price).replace(/\/(wk|mo)$/, "")}` : o.title);

const vehicleIcon = (v?: string): IconName => (v && /RAIL|TRAIN|SUBWAY|TRAM|METRO/.test(v) ? "train" : v === "FERRY" ? "ferry" : "transit");

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
  /** Step-through reveal: draw the selected home's routes one place at a time. */
  stepped: boolean;
  fitKey: string;
  dropMode: boolean;
  onSelect: (id: string) => void;
  onDetail: (id: string) => void;
  onPhotos: (id: string, photos: string[]) => void;
  onAnchorClick: (id: string) => void;
  onMapClick: (p: LatLng) => void;
  /** "Along the way" suggestions to pin on the map, numbered as in the panel. */
  stops: { id: string; name: string; location: LatLng }[];
  hoverStop: string | null;
  onStopHover: (id: string | null) => void;
  /** Mobile mode: phone-sized cards (see core/view.ts). */
  mobile: boolean;
};

/**
 * Frame every home, place and route in one view, with room for the cards.
 * Padding scales with the map's size so small screens never zoom out to the world.
 */
export function fitPadding(w: number, h: number) {
  return {
    top: Math.round(Math.min(110, h * 0.16)),
    bottom: Math.round(Math.min(90, h * 0.12)),
    left: Math.round(Math.min(170, w * 0.18)),
    right: Math.round(Math.min(190, w * 0.2)),
  };
}

function FitBounds({ points, fitKey }: { points: LatLng[]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !points.length) return;
    if (points.length === 1) {
      map.panTo(points[0]);
      map.setZoom(15);
      return;
    }
    const b = new google.maps.LatLngBounds();
    points.forEach((p) => b.extend(p));
    const div = map.getDiv();
    map.fitBounds(b, fitPadding(div.offsetWidth || 800, div.offsetHeight || 600));
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
  selected: boolean;
  side: Side;
  growKey: string;
  onSelect: (id: string) => void;
  onDetail: (id: string) => void;
  onPhotos: (id: string, photos: string[]) => void;
};

/**
 * Hub at the listing's exact location with its label docked beside it (no connector line).
 * Unselected: a small greyed "Name · $price" tab. Selected: a compact dark card.
 */
const HomeMarker = memo(function HomeMarker({ o, letter, selected, side, growKey, onSelect, onDetail, onPhotos }: HomeCardProps) {
  const price = o.price ? formatPrice(o.price).replace(/\/(wk|mo)$/, "") : null;
  const per = o.price?.period === "month" ? "/mo" : o.price?.period === "week" ? "/wk" : "";
  const sub = [letter, o.subtitle?.split(",")[0], o.bedrooms ? `${o.bedrooms} bed` : null, o.bathrooms ? `${o.bathrooms} bath` : null].filter(Boolean).join(" · ");
  const pics = photosOf(o), link = listingUrl(o);
  return (
    <div className={`pm side-${side}${selected ? " sel" : ""}`}>
      {selected ? (
        <div key={`${side}${growKey}`} className="pcard sel" role="group" aria-label={`${letter}: ${o.title}, selected`}>
          <CardPhotos key={o.id} pics={pics} own={o.photos ?? []} onChange={(p) => onPhotos(o.id, p)} />
          <div className="pc-body">
            <div className="pc-row">
              <b className="pc-name">{o.title}</b>
              {price && <b className="pc-price">{price}<small>{per}</small></b>}
            </div>
            <div className="pc-row">
              <span className="pc-sub">{sub}</span>
              <span className="pc-acts">
                {link && (
                  <a className="pc-more" href={link} target="_blank" rel="noopener noreferrer" aria-label={`Open the listing for ${o.title}`} title="Open listing" onClick={(e) => e.stopPropagation()}>
                    <Icon name="external" size={12} />
                  </a>
                )}
                <button className="pc-more" aria-label={`Details for ${o.title}`} title="Details" onClick={(e) => { e.stopPropagation(); onDetail(o.id); }}>
                  <Icon name="arrow" size={12} />
                </button>
              </span>
            </div>
          </div>
        </div>
      ) : (
        <button key={side} className="ptab" onClick={() => onSelect(o.id)} aria-label={`Select ${letter}: ${o.title}`}>
          {tabText(o)}
        </button>
      )}
      <button className={`hub${selected ? " sel" : ""}`} onClick={() => onSelect(o.id)} aria-label={`Select ${o.title}`}>
        <Icon name="house2" size={selected ? 26 : 16} />
      </button>
    </div>
  );
});

type MobileHomeProps = {
  o: Option;
  letter: string;
  selected: boolean;
  open: boolean;
  side: Side;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onDetail: (id: string) => void;
  onPhotos: (id: string, photos: string[]) => void;
};

/**
 * Mobile home: the hub with a small white tab holding just the home's name.
 * Once selected, a faint arrow under the name opens the rest: photos (add from
 * the phone's camera or library), price, rooms and the listing.
 */
const MobileHomeMarker = memo(function MobileHomeMarker({ o, letter, selected, open, side, onSelect, onToggle, onDetail, onPhotos }: MobileHomeProps) {
  const price = o.price ? formatPrice(o.price).replace(/\/(wk|mo)$/, "") : null;
  const per = o.price?.period === "month" ? "/mo" : o.price?.period === "week" ? "/wk" : "";
  const facts = homeFacts(o);
  const area = o.subtitle?.split(",")[0];
  const link = listingUrl(o);
  const map = useMap();
  const card = useRef<HTMLDivElement>(null);
  // Opening the card: nudge the map so the whole card is on screen (clear of the map buttons).
  useEffect(() => {
    if (!open || !map) return;
    const raf = requestAnimationFrame(() => {
      const c = card.current?.getBoundingClientRect(), m = map.getDiv().getBoundingClientRect();
      if (!c) return;
      const pad = 10, top = 52;
      const dx = c.left < m.left + pad ? c.left - m.left - pad : c.right > m.right - pad ? c.right - m.right + pad : 0;
      const dy = c.top < m.top + top ? c.top - m.top - top : c.bottom > m.bottom - pad ? c.bottom - m.bottom + pad : 0;
      if (dx || dy) map.panBy(dx, dy);
    });
    return () => cancelAnimationFrame(raf);
  }, [open, map, side]);
  return (
    <div className={`pm m side-${side}${selected ? " sel" : ""}${open ? " open" : ""}`}>
      <div key={side} ref={card} className="mtab">
        <button
          className="mtab-name"
          onClick={() => (selected ? onToggle(o.id) : onSelect(o.id))}
          aria-expanded={selected ? open : undefined}
          aria-label={selected ? `${o.title}: ${open ? "hide" : "show"} details` : `Select ${letter}: ${o.title}`}
        >
          <span>{o.title}</span>
          {selected && <Icon name="chev" size={14} className="mchev" />}
        </button>
        {open && (
          <div className="mopen">
            <CardPhotos key={o.id} pics={photosOf(o)} own={o.photos ?? []} onChange={(p) => onPhotos(o.id, p)} hint="Camera or library" />
            <div className="mo-body">
              {(price || facts) && (
                <div className="mo-row">
                  {price && <b className="mo-price">{price}<small>{per}</small></b>}
                  {facts && <span className="mo-facts">{facts}</span>}
                </div>
              )}
              <span className="mo-sub">{[letter, area].filter(Boolean).join(" · ")}</span>
              <div className="mo-acts">
                {link && (
                  <a href={link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                    <Icon name="external" size={12} />Listing
                  </a>
                )}
                <button onClick={(e) => { e.stopPropagation(); onDetail(o.id); }}>
                  Details<Icon name="arrow" size={12} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <button className={`hub${selected ? " sel" : ""}`} onClick={() => onSelect(o.id)} aria-label={`Select ${o.title}`}>
        <Icon name="house2" size={selected ? 18 : 13} />
      </button>
    </div>
  );
});

/** Top of the selected card: your photos (tap to flick through) with a "+", or a spot to paste, drop or choose some. */
function CardPhotos({ pics, own, onChange, hint = "Paste, drop or choose" }: { pics: string[]; own: string[]; onChange: (p: string[]) => void; hint?: string }) {
  const [i, setI] = useState(0);
  const [over, setOver] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const add = async (files: File[]) => {
    const room = MAX_PHOTOS - own.length;
    if (!files.length) return;
    if (room <= 0) return setMsg(`Up to ${MAX_PHOTOS} photos`);
    try {
      const shrunk = await Promise.all(files.slice(0, room).map((f) => shrinkImage(f)));
      onChange([...own, ...shrunk]);
      setI(own.length);
      setMsg(null);
    } catch {
      setMsg("Couldn't read that image");
    }
  };
  const shown = pics.length ? pics[Math.min(i, pics.length - 1)] : null;
  return (
    <div
      className={`pc-photo${shown ? "" : " empty"}${over ? " over" : ""}`}
      tabIndex={-1}
      onPaste={(e) => { const f = imageFiles(e.clipboardData?.items); if (f.length) { e.preventDefault(); void add(f); } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void add(imageFiles(e.dataTransfer?.files)); }}
    >
      {shown ? (
        <>
          <button className="pc-pic" onClick={(e) => { e.stopPropagation(); setI((i + 1) % pics.length); }} aria-label={pics.length > 1 ? "Next photo" : "Photo"}>
            {/* Local or TradeMe photo; next/image would need remote-host config for little gain. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown} alt="" />
          </button>
          {pics.length > 1 && <span className="pc-count">{Math.min(i, pics.length - 1) + 1}/{pics.length}</span>}
          {own.length < MAX_PHOTOS && (
            <button className="pc-add" onClick={(e) => { e.stopPropagation(); input.current?.click(); }} aria-label="Add photos" title="Add photos (or paste / drop)"><Icon name="plus" size={14} /></button>
          )}
        </>
      ) : (
        <button className="pc-drop" onClick={(e) => { e.stopPropagation(); input.current?.click(); }}>
          <Icon name="plus" size={16} />
          <span><b>Add photos</b>{msg ?? hint}</span>
        </button>
      )}
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { void add(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
    </div>
  );
}

type PlaceProps = {
  a: Anchor;
  sw: Swatch;
  side: Side;
  view?: { minutes: number | null | undefined; mode: Mode; leg?: Leg };
  badge: { text: string; strong: boolean } | null;
  countKey: string;
  instant: boolean;
  /** When this place's route starts and how long it takes (step-through reveal). */
  delay: number;
  drawMs: number;
  /** Mobile: the name tab, then just the time and the mode's symbol. */
  mobile: boolean;
  onClick: (id: string) => void;
};

/** Place marker at the exact location, with a tabbed card whose edge it sits on. */
const PlaceMarker = memo(function PlaceMarker({ a, sw, side, view, badge, countKey, instant, delay, drawMs, mobile, onClick }: PlaceProps) {
  const fare = view && !mobile ? fareLine({ mode: view.mode, leg: view.leg }) : null;
  // Step-through: until its route arrives the card waits faded, then lights up.
  const stepIn = !instant && drawMs < DRAW_MS;
  const style = { "--tab": sw.tab, "--text": sw.text, "--route": sw.route, "--marker": sw.marker, "--arrive": `${delay + drawMs * 0.85}ms` } as React.CSSProperties;
  return (
    <div className={`am${mobile ? " m" : ""} side-${side}`} style={style}>
      <div key={`${side}${view ? countKey.split(":").slice(0, 2).join(":") : ""}`} className={`acard${fare ? " fare" : ""}${view ? (stepIn ? " arrive" : "") : " bare"}`} onClick={() => onClick(a.id)} role="button" tabIndex={0} aria-label={`Edit ${a.name}`} onKeyDown={(e) => e.key === "Enter" && onClick(a.id)}>
        <div className="atab"><b>{a.name}</b>{!mobile && suburbOf(a) && <span>{suburbOf(a)}</span>}</div>
        {view && mobile && <div className="abody">
          <span className="atime">
            {typeof view.minutes === "number" ? <CountUp key={countKey} value={view.minutes} ms={drawMs} delay={delay} instant={instant} /> : view.minutes === null ? "–" : "…"}
            <small>min</small>
          </span>
          <Icon name={view.mode} size={15} className="amode-i" />
        </div>}
        {view && !mobile && <div className="abody">
          <div className="arow">
            <span className="atime">
              {typeof view?.minutes === "number" ? <CountUp key={countKey} value={view.minutes} ms={drawMs} delay={delay} instant={instant} /> : view?.minutes === null ? "–" : "…"}
              <small>min</small>
            </span>
            {badge && <span className={`rank${badge.strong ? " strong" : ""}`}>{badge.text}</span>}
          </div>
          <div className="amode"><Icon name={view?.mode ?? a.mode} size={14} />{modeDetail({ mode: view?.mode ?? a.mode, leg: view?.leg })}</div>
          {fare && <div className="afare">{fare}</div>}
        </div>}
      </div>
      <span className="amark"><Icon name="anchor" size={mobile ? 11 : 13} /></span>
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
          const stepIn = isSel && p.stepped && !p.instant;
          const rides = isSel ? (steps ?? []).filter((s) => s.kind === "ride" && s.line).map((s) => ({ line: s.line!, vehicle: s.vehicle, at: midpoint(s.path)! })) : [];
          return [{
            key: `${isSel ? p.epoch : 0}:${legKey(o.id, a.id, mode)}`,
            pair: `${o.id}|${a.id}`,
            optionId: o.id,
            color: anchorColor(a, ai).route,
            parts: pieces.map((x) => ({ m: measure(x.path), dashed: x.dashed })),
            selected: isSel,
            delay: stepIn ? ai * STEP_GAP : 0,
            drawMs: stepIn ? STEP_DRAW : DRAW_MS,
            rides,
            pts: isSel ? pieces.flatMap((x) => x.path.filter((_, i) => i % 2 === 0)) : [],
          }];
        }),
      ),
    [options, anchors, legs, overrides, selected, p.epoch, p.stepped, p.instant],
  );
  const drawRoutes: DrawRoute[] = useMemo(() => routes.map(({ key, optionId, color, parts, selected: s, delay, drawMs }) => ({ key, optionId, color, parts, selected: s, delay, drawMs })), [routes]);

  /* ---------- card sides: recomputed only when homes/places, selection, selected routes or zoom change ---------- */
  const [sides, setSides] = useState<Record<string, Side>>({});
  // Mobile: which selected home has its card opened (closes when the selection moves on).
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = p.mobile && openId != null && openId === selected ? openId : null;
  const idsKey = `${options.map((o) => `${o.id}${o.photo ? "p" : ""}`).join(",")}|${anchors.map((a) => a.id).join(",")}|${selected}|${p.mobile}|${opened}`;
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
    const M = MOBILE_GEO;
    for (const o of options) {
      const at = px(o.location), isSel = o.id === selected, isOpen = o.id === opened;
      const hub = p.mobile ? (isSel ? M.hub.sel : M.hub.unsel) : isSel ? GEO.hub.sel : GEO.hub.unsel;
      const w = p.mobile ? (isOpen ? M.home.open.w : mobileHomeWidth(o.title, isSel)) : isSel ? GEO.sel.w : tabWidth(o);
      const h = p.mobile ? (isOpen ? M.home.open.h : isSel ? M.home.hSel : M.home.h) : isSel ? GEO.sel.hPhoto : GEO.unsel.h;
      const reach = hub / 2 - (p.mobile ? M.tuck : GEO.tuck);
      items.push({ id: `o:${o.id}`, at, priority: isSel ? 0 : 2, prefer: ["right", "left", "below", "above"], boxes: Object.fromEntries(SIDES.map((s) => [s, dockedBox(at, w, h, s, reach)])) as SideItem["boxes"] });
      markers.push({ id: `o:${o.id}`, at, r: hub / 2 + 4 });
    }
    for (const a of anchors) {
      const at = px(a.location);
      const ah = p.mobile ? (sel ? M.anchor.hTime : M.anchor.h) : sel ? GEO.anchor.hFare : GEO.anchor.hTab;
      const aw = p.mobile ? mobileAnchorWidth(a.name, !!sel) : sel ? GEO.anchor.w : Math.min(GEO.anchor.w, 40 + 7.5 * (a.name.length + (suburbOf(a)?.length ?? 0)));
      items.push({ id: `a:${a.id}`, at, priority: 1, prefer: awayFrom(at, selAt), boxes: Object.fromEntries(SIDES.map((s) => [s, dockedBox(at, aw, ah, s, 0)])) as SideItem["boxes"] });
      markers.push({ id: `a:${a.id}`, at, r: (p.mobile ? M.anchor.marker : GEO.anchor.marker) / 2 + 4 });
    }
    const routePts = routes.filter((r) => r.selected).flatMap((r) => r.pts.map(px));
    const raf = requestAnimationFrame(() => setSides((prev) => chooseSides(items, markers, routePts, prev)));
    return () => cancelAnimationFrame(raf);
    // Deliberately not on every render or pan: only these inputs move cards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, zoom, idsKey, routeKey]);

  // Frame the routes themselves (they can bulge beyond the dots), not just homes and places.
  const fitPoints = useMemo(
    () => [...options.map((o) => o.location), ...anchors.map((a) => a.location), ...routes.flatMap((r) => r.parts.flatMap((x) => x.m.path.filter((_, i) => i % 4 === 0)))],
    [options, anchors, routes],
  );
  // Refit when routes for a new home or place arrive (not on selection or a single mode change).
  const routePairs = useMemo(() => [...new Set(routes.map((r) => r.pair))].sort().join(","), [routes]);
  const summary = useMemo(() => new Map(rows.map((r) => [r.option.id, r])), [rows]);
  const selRow = selected ? summary.get(selected) : undefined;
  const growKey = `${selected}:${p.epoch}`;
  const toggleOpen = useCallback((id: string) => setOpenId((cur) => (cur === id ? null : id)), []);

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
      <FitBounds points={fitPoints} fitKey={`${p.fitKey}|${routePairs}`} />
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

      {p.stops.map((st, i) => (
        <HtmlMarker key={`stop-${st.id}`} position={st.location} zIndex={p.hoverStop === st.id ? 45 : 15}>
          <button className={`stop${p.hoverStop === st.id ? " hov" : ""}`} onMouseEnter={() => p.onStopHover(st.id)} onMouseLeave={() => p.onStopHover(null)} aria-label={`${i + 1}: ${st.name}`}>
            {i + 1}
            {p.hoverStop === st.id && <span className="stop-name">{st.name}</span>}
          </button>
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
              delay={p.stepped && !p.instant ? ai * STEP_GAP : 0}
              drawMs={p.stepped && !p.instant ? STEP_DRAW : DRAW_MS}
              mobile={p.mobile}
              onClick={p.onAnchorClick}
            />
          </HtmlMarker>
        );
      })}

      {options.map((o, i) => (
        <HtmlMarker key={o.id} position={o.location} zIndex={o.id === selected ? 40 : 30}>
          {p.mobile ? (
            <MobileHomeMarker
              o={o}
              letter={letterOf(i)}
              selected={o.id === selected}
              open={o.id === opened}
              side={sides[`o:${o.id}`] ?? "right"}
              onSelect={p.onSelect}
              onToggle={toggleOpen}
              onDetail={p.onDetail}
              onPhotos={p.onPhotos}
            />
          ) : (
          <HomeMarker
            o={o}
            letter={letterOf(i)}
            selected={o.id === selected}
            side={sides[`o:${o.id}`] ?? "right"}
            growKey={growKey}
            onSelect={p.onSelect}
            onDetail={p.onDetail}
            onPhotos={p.onPhotos}
          />
          )}
        </HtmlMarker>
      ))}
    </GoogleMap>
  );
}
