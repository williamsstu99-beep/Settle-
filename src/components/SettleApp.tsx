"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compare, formatPrice, legKey, pairKey, tripMode, type LegView, type OptionSummary } from "@/core/compare";
import { dayStops, MAX_DAYS, newDayName, pruneDays, reorderDay, toggleSkip, tripsFor, type Day, type Trip } from "@/core/day";
import { activeDay, anchorColor, decodePlan, encodePlan, EXAMPLE_PLAN, letterOf, migratePlan, MAX_ANCHORS, MAX_OPTIONS, newId, nextAnchorColor, type Plan } from "@/core/plan";
import type { Anchor, LatLng, Leg, Mode, Option, Time } from "@/core/types";
import type { AlongResult } from "@/server/places";
import { Icon, MODE_LABEL } from "./icons";
import { Wordmark } from "./Logo";
import { homeFacts, listingUrl } from "@/core/home";
import { tripLabel } from "@/core/describe";
import { HomeForm, type HomeDraft } from "./HomeForm";
import { PlaceSearch } from "./PlaceSearch";
import { DRAW_MS, STEP_DRAW, STEP_GAP } from "./RouteLayer";
import { useReorder } from "./useReorder";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const PLAN_KEY = "settle.plan.v1";
const LEGS_KEY = "settle.legs.v2";
const TIMES_KEY = "settle.times.v1";
const MODES: Mode[] = ["transit", "drive", "bike", "walk"];

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const hasMapsKey = !!API_KEY;
const STEP_KEY = "settle.step.v1";
/** How long Compare stays on each home: card grows, its routes draw (all together, or one place at a time), short hold. */
const stepMs = (stepped: boolean, places: number) => 300 + (stepped ? Math.max(0, places - 1) * STEP_GAP + STEP_DRAW : DRAW_MS) + 600;

function loadPlan(): Plan {
  const m = location.hash.match(/^#s=([\w-]+)/);
  if (m) {
    const p = decodePlan(m[1]);
    if (p) return p;
  }
  // The example is only shown when asked for (the landing page's "See an example").
  if (new URLSearchParams(location.search).has("example")) return EXAMPLE_PLAN;
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    if (raw) {
      const saved = migratePlan(JSON.parse(raw) as Plan);
      if (!saved.example) return saved;
    }
  } catch {}
  return EMPTY_PLAN;
}

const EMPTY_PLAN: Plan = { anchors: [], options: [], driveDefault: true };
/** Quick names for a first life anchor. */
const ANCHOR_IDEAS = ["Work", "Gym", "Partner’s place", "School", "Family"];

function loadMap<T>(key: string): Map<string, T> {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return new Map(Object.entries(JSON.parse(raw) as Record<string, T>));
  } catch {}
  return new Map();
}

function saveMap<T>(key: string, m: Map<string, T>, max: number) {
  try {
    localStorage.setItem(key, JSON.stringify(Object.fromEntries([...m].slice(-max))));
  } catch {}
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error([j.error ?? "Couldn't get travel times right now.", j.detail ? `Google said: ${j.detail}` : ""].filter(Boolean).join(" "));
  return j as T;
}

export default function SettleApp() {
  const [plan, setPlan] = useState<Plan>(loadPlan);
  const [legs, setLegs] = useState<Map<string, Leg>>(() => loadMap<Leg>(LEGS_KEY));
  const [times, setTimes] = useState<Map<string, Time>>(() => loadMap<Time>(TIMES_KEY));
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [seq, setSeq] = useState<{ order: string[]; i: number } | null>(null);
  const [pending, setPending] = useState<string[] | null>(null); // compare order, waiting for routes
  const [hasRun, setHasRun] = useState(false);
  const [epoch, setEpoch] = useState(0); // new value = redraw every route (Compare / Replay)
  const [reduceMotion] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  // Step-through reveal (one place's route at a time). On by default; your choice is remembered.
  const [stepped, setStepped] = useState(() => {
    try { return localStorage.getItem(STEP_KEY) !== "off"; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(STEP_KEY, stepped ? "on" : "off"); } catch {}
  }, [stepped]);
  const [edit, setEdit] = useState<string | null>(null);
  /** The property form: "new", a home's id while editing it, or "closed" once dismissed. */
  const [homeForm, setHomeForm] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // The new place being set up: name and icon first, then the address.
  const [draft, setDraft] = useState<{ name: string; mode: Mode }>({ name: "", mode: "drive" });
  const [error, setError] = useState<string | null>(null);
  const [legErrors, setLegErrors] = useState<Record<string, string>>({});
  // "Along the way": stops (any category) on a selected home's route to one of your places.
  const [along, setAlong] = useState<{ optionId: string; trip: string; query: string; loading: boolean; results: AlongResult[]; error?: string } | null>(null);
  const [alongText, setAlongText] = useState("");
  const [hoverStop, setHoverStop] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fitKey, setFitKey] = useState("init");

  const { anchors, options } = plan;
  const overrides = useMemo(() => plan.overrides ?? {}, [plan.overrides]);
  const days = useMemo(() => plan.days ?? [], [plan.days]);
  const day = useMemo(() => activeDay({ days, dayId: plan.dayId }), [days, plan.dayId]);
  const letter = useCallback((id: string) => letterOf(Math.max(0, options.findIndex((o) => o.id === id))), [options]);
  const swatch = (a: Anchor) => anchorColor(a, anchors.indexOf(a));
  const swatchStyle = (a: Anchor) => ({ "--a": swatch(a).marker, "--ar": swatch(a).route, "--at": swatch(a).tab } as React.CSSProperties);

  // Persist locally (never the untouched example, so it can't replace your own plan); drop a share hash once loaded.
  useEffect(() => {
    if (!plan.example) try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); } catch {}
    if (location.hash.startsWith("#s=")) history.replaceState(null, "", location.pathname + location.search);
  }, [plan]);
  useEffect(() => saveMap(LEGS_KEY, legs, 300), [legs]);
  useEffect(() => saveMap(TIMES_KEY, times, 1200), [times]);

  const update = (fn: (p: Plan) => Plan) => setPlan((p) => ({ ...fn(p), example: false }));

  const cmp = useMemo(() => compare(options, anchors, legs, times, overrides, day), [options, anchors, legs, times, overrides, day]);
  /** Trips per home for the day shown (stops in order, then anchors on their own). */
  const trips = useMemo(() => new Map(options.map((o) => [o.id, tripsFor(o, anchors, day)])), [options, anchors, day]);
  const tripCount = trips.values().next().value?.length ?? anchors.length;

  // Exactly one home is always selected: the one you picked, the one the sequence is on, or the best.
  // Nothing is selected until you pick a home (or Compare finishes on the best one).
  const selected = seq ? seq.order[seq.i] : selectedState && options.some((o) => o.id === selectedState) ? selectedState : null;

  /* ---------- times for the other modes (mode buttons), selected home only ---------- */
  // Route lines already give the chosen mode's time for every home, so the matrix is only
  // asked for the selected home and only for modes that aren't known yet. Cached per pair.
  // Trips from the same origin go in one matrix request (home → its trips, or a stop → the next).
  const timesWanted = useMemo(() => {
    const ts = selected ? trips.get(selected) : undefined;
    if (!ts?.length || seq || !hasMapsKey) return null; // not while Compare steps through every home
    const groups = new Map<string, { origin: Trip["origin"]; dests: Trip[] }>();
    for (const t of ts) {
      const g = groups.get(t.from) ?? { origin: t.origin, dests: [] };
      g.dests.push(t);
      groups.set(t.from, g);
    }
    // Only modes and trips still unknown; a trip's own mode comes with its route line.
    const missing = (t: Trip, m: Mode) => m !== tripMode(overrides, t) && !legs.has(legKey(t.from, t.to, m)) && !times.has(legKey(t.from, t.to, m));
    for (const [from, g] of groups) {
      const modes = MODES.filter((m) => g.dests.some((t) => missing(t, m)));
      const dests = g.dests.filter((t) => modes.some((m) => missing(t, m)));
      if (modes.length) return { from, origin: g.origin, dests, modes };
    }
    return null;
  }, [selected, seq, trips, overrides, legs, times]);
  const timesInflight = useRef(false);
  useEffect(() => {
    if (!timesWanted || timesInflight.current) return;
    timesInflight.current = true;
    postJson<{ times: Time[] }>("/api/times", {
      timeZone: timeZone(),
      options: [{ id: timesWanted.from, location: timesWanted.origin }],
      anchors: timesWanted.dests.map((t) => ({ id: t.to, location: t.destination })),
      modes: timesWanted.modes,
    })
      .then((j) => {
        setTimes((prev) => {
          const next = new Map(prev);
          for (const t of j.times) next.set(legKey(t.optionId, t.anchorId, t.mode), t);
          return next;
        });
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        timesInflight.current = false;
      });
  }, [timesWanted]);

  /* ---------- "5–9 min at peak" for the selected home's drives only (two requests each) ---------- */
  const peakAsked = useRef(new Set<string>());
  useEffect(() => {
    const ts = selected ? trips.get(selected) : undefined;
    if (!ts || seq || !hasMapsKey) return;
    const want = ts
      .filter((t) => tripMode(overrides, t) === "drive")
      .map((t) => ({ t, leg: legs.get(legKey(t.from, t.to, "drive")) }))
      .filter(({ t, leg }) => leg?.status === "ok" && !leg.peak && !peakAsked.current.has(legKey(t.from, t.to, "drive")))
      .slice(0, 8);
    if (!want.length) return;
    for (const { t } of want) peakAsked.current.add(legKey(t.from, t.to, "drive"));
    postJson<{ peaks: { optionId: string; anchorId: string; peak: [number, number] | null }[] }>("/api/peak", {
      timeZone: timeZone(),
      pairs: want.map(({ t }) => ({ optionId: t.from, anchorId: t.to, origin: t.origin, destination: t.destination })),
    })
      .then((j) => {
        setLegs((prev) => {
          const next = new Map(prev);
          for (const p of j.peaks) {
            const k = legKey(p.optionId, p.anchorId, "drive"), l = next.get(k);
            if (l && p.peak) next.set(k, { ...l, peak: p.peak });
          }
          return next;
        });
      })
      .catch(() => {}); // optional detail: the card just says "Drive"
  }, [selected, seq, trips, overrides, legs]);

  /* ---------- route lines, only for the mode chosen per pair: the selected home, or every home for Compare ---------- */
  // Every home's routes are shown (grey for homes that aren't selected), so fetch them all; results are cached.
  // Stop → stop trips are the same from every home, so they're asked for once.
  const legsMissing = useMemo(() => {
    if (!hasMapsKey) return [];
    const seen = new Set<string>();
    return [...trips.values()].flat().flatMap((t) => {
      const mode = tripMode(overrides, t), k = legKey(t.from, t.to, mode);
      if (seen.has(k) || legs.has(k) || legErrors[pairKey(t.from, t.to)]) return [];
      seen.add(k);
      return [{ t, mode }];
    }).slice(0, 48);
  }, [trips, overrides, legs, legErrors]);
  const legsInflight = useRef(false);
  const previousMode = useRef<Record<string, Mode>>({});
  useEffect(() => {
    if (!legsMissing.length || legsInflight.current) return;
    legsInflight.current = true;
    const batch = legsMissing;
    postJson<{ legs: Leg[] }>("/api/routes", {
      timeZone: timeZone(),
      pairs: batch.map(({ t, mode }) => ({ optionId: t.from, anchorId: t.to, mode, origin: t.origin, destination: t.destination })),
    })
      .then((j) => {
        setLegs((prev) => {
          const next = new Map(prev);
          for (const l of j.legs) next.set(legKey(l.optionId, l.anchorId, l.mode), l);
          return next;
        });
      })
      .catch((e: Error) => {
        // A single switched route that fails goes back to its previous mode; anything else is shown above the list.
        const switched = batch.filter(({ t }) => previousMode.current[pairKey(t.from, t.to)]);
        if (switched.length && switched.length === batch.length) {
          setPlan((p) => {
            const ov = { ...(p.overrides ?? {}) };
            for (const { t } of switched) {
              const prev = previousMode.current[pairKey(t.from, t.to)];
              if (prev === t.defaultMode) delete ov[pairKey(t.from, t.to)];
              else ov[pairKey(t.from, t.to)] = prev;
            }
            return { ...p, overrides: ov };
          });
          setLegErrors((errs) => ({ ...errs, ...Object.fromEntries(switched.map(({ t }) => [pairKey(t.from, t.to), "Couldn't get that route. Try again."])) }));
        } else {
          setError(e.message);
        }
      })
      .finally(() => {
        for (const { t } of batch) delete previousMode.current[pairKey(t.from, t.to)];
        legsInflight.current = false;
      });
  }, [legsMissing]);

  /* ---------- Compare: each home in turn, most travel first, ending on the best ---------- */
  // Start once every home's routes are in, so the animation never waits on the network.
  const allReady = !legsMissing.length;
  useEffect(() => {
    if (!pending || !allReady) return;
    const raf = requestAnimationFrame(() => {
      setPending(null);
      setSeq({ order: pending, i: 0 });
      setEpoch((e) => e + 1);
    });
    return () => cancelAnimationFrame(raf);
  }, [pending, allReady]);
  useEffect(() => {
    if (!seq) return;
    const t = setTimeout(() => {
      if (seq.i + 1 < seq.order.length) setSeq({ ...seq, i: seq.i + 1 });
      else {
        setSelectedState(seq.order[seq.i]);
        setSeq(null);
      }
    }, stepMs(stepped, tripCount));
    return () => clearTimeout(t);
  }, [seq, stepped, tripCount]);

  /* ---------- actions ---------- */
  /** Create the place from the draft. Its name is what you typed (or the icon's label), never the address. */
  const addAnchorAt = (location: LatLng, address?: string) => {
    if (anchors.length >= MAX_ANCHORS) return;
    const name = draft.name.trim() || `Place ${anchors.length + 1}`;
    const a: Anchor = { id: newId(), name: name.slice(0, 40), icon: "other", location, address, mode: draft.mode, color: nextAnchorColor(anchors) };
    update((p) => ({ ...p, anchors: [...p.anchors, a] }));
    setAdding(false);
    setDraft({ name: "", mode: "drive" });
    setFitKey(newId());
  };
  const patchAnchor = (id: string, patch: Partial<Anchor>) => update((p) => ({ ...p, anchors: p.anchors.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const addOption = (o: Option) => {
    if (options.length >= MAX_OPTIONS) return setError(`You can compare up to ${MAX_OPTIONS} homes at once.`);
    if (options.some((x) => x.id === o.id)) return setError("That home is already on your list.");
    setError(null);
    update((p) => ({ ...p, options: [...p.options, o] }));
    setFitKey(newId());
  };
  const searchAlong = async (o: Option, t: Trip, query: string) => {
    const trip = pairKey(t.from, t.to);
    const leg = legs.get(legKey(t.from, t.to, tripMode(overrides, t)));
    const q = query.trim();
    if (q.length < 2) return;
    if (leg?.status !== "ok" || !leg.polyline) {
      setAlong({ optionId: o.id, trip, query: q, loading: false, results: [], error: "That route is still loading. Try again in a moment." });
      return;
    }
    setAlong({ optionId: o.id, trip, query: q, loading: true, results: [] });
    try {
      const j = await postJson<{ results: AlongResult[] }>("/api/along", { query: q, polyline: leg.polyline, origin: t.origin, mode: leg.mode, baseMinutes: leg.minutes ?? 0 });
      setAlong((cur) => (cur && cur.query === q && cur.optionId === o.id && cur.trip === trip ? { ...cur, loading: false, results: j.results } : cur));
    } catch (e) {
      setAlong((cur) => (cur && cur.query === q ? { ...cur, loading: false, error: (e as Error).message } : cur));
    }
  };
  /** Turn a suggestion into one of your places, named after the place itself. */
  const addStop = (r: AlongResult) => {
    if (anchors.length >= MAX_ANCHORS) return setError(`You can have up to ${MAX_ANCHORS} places.`);
    const a: Anchor = { id: newId(), name: r.name.slice(0, 40), icon: "other", location: r.location, address: r.address, mode: "drive", color: nextAnchorColor(anchors) };
    update((p) => ({ ...p, anchors: [...p.anchors, a] }));
    setAlong(null);
  };
  const removeOption = (id: string) => {
    update((p) => ({ ...p, options: p.options.filter((x) => x.id !== id), overrides: Object.fromEntries(Object.entries(p.overrides ?? {}).filter(([k]) => !k.startsWith(`${id}|`) && !k.endsWith(`|${id}`))) }));
    if (selectedState === id) setSelectedState(null);
  };
  const fetchListing = async (url: string): Promise<Option> => {
    const r = await fetch(`/api/listing?url=${encodeURIComponent(url)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "Couldn't get that listing. Type the address instead.");
    return j.option as Option;
  };
  /** Save the property form: a new home, or changes to one (a new address clears its old routes). */
  const saveHome = (id: string | null, d: HomeDraft) => {
    if (!id) {
      addOption({ id: newId(), ...d });
      setHomeForm("closed");
      return;
    }
    const before = options.find((o) => o.id === id);
    const moved = before && (before.location.lat !== d.location.lat || before.location.lng !== d.location.lng);
    update((p) => ({ ...p, options: p.options.map((o) => (o.id === id ? { ...d, id } : o)) }));
    if (moved) {
      // Trips from this home (`id|…`) and back to it (`@stop|id|mode`).
      const mine = (k: string) => k.startsWith(`${id}|`) || k.split("|")[1] === id;
      const keep = <T,>(m: Map<string, T>) => new Map([...m].filter(([k]) => !mine(k)));
      setLegs(keep);
      setTimes(keep);
      peakAsked.current = new Set([...peakAsked.current].filter((k) => !mine(k)));
      setFitKey(newId());
    }
    setHomeForm("closed");
  };
  /** Photos live in browser storage; if they won't fit, say so rather than lose them on reload. */
  const setPhotos = (id: string, photos: string[]) => {
    const next = { ...plan, example: false, options: plan.options.map((o) => (o.id === id ? { ...o, photos: photos.length ? photos : undefined } : o)) };
    try {
      localStorage.setItem(PLAN_KEY, JSON.stringify(next));
    } catch {
      return setError("There's no room left on this device for more photos. Remove a few and try again.");
    }
    setError(null);
    setPlan(next);
  };
  const startCompare = () => {
    const order = [...cmp.rows].reverse().map((r) => r.option.id); // most travel first, best last
    setEdit(null);
    setAdding(false);
    setError(null);
    setCollapsed(false);
    setHasRun(true);
    setFitKey(newId());
    if (reduceMotion || order.length < 1) {
      setSelectedState(order[order.length - 1] ?? null);
      setEpoch((e) => e + 1);
      return;
    }
    setSeq(null);
    setPending(order);
  };
  const skip = () => {
    const order = seq?.order ?? pending;
    setPending(null);
    setSeq(null);
    if (order?.length) setSelectedState(order[order.length - 1]);
  };
  const selectHome = (id: string, fromPanel = false) => {
    if (seq || pending) {
      setSeq(null);
      setPending(null);
    }
    if (id === selected && fromPanel) setCollapsed((c) => !c);
    else {
      setSelectedState(id);
      setCollapsed(false);
    }
  };
  const chooseMode = (t: Trip, mode: Mode) => {
    const k = pairKey(t.from, t.to);
    const current = tripMode(overrides, t);
    if (mode === current) return;
    previousMode.current[k] = current;
    setLegErrors((errs) => {
      const next = { ...errs };
      delete next[k];
      return next;
    });
    update((p) => {
      const ov = { ...(p.overrides ?? {}) };
      if (mode === t.defaultMode) delete ov[k];
      else ov[k] = mode;
      return { ...p, overrides: ov };
    });
  };

  /* ---------- your day: anchors in order, as one trip ---------- */
  const setDay = (fn: (d: Day) => Day) => update((p) => ({ ...p, days: (p.days ?? []).map((d) => (d.id === p.dayId ? fn(d) : d)) }));
  /** Start a new day from the anchors in the given order (all of them in it, back home at the end). */
  const newDay = (order: string[] = anchors.map((a) => a.id)) => {
    if (days.length >= MAX_DAYS) return setError(`You can save up to ${MAX_DAYS} days.`);
    const d: Day = { id: newId(), name: newDayName(days), order, skip: [], home: true };
    update((p) => ({ ...p, days: [...(p.days ?? []), d], dayId: d.id }));
  };
  const chooseDay = (id: string | null) => {
    update((p) => ({ ...p, dayId: id }));
    setAlong(null);
    setEpoch((e) => e + 1);
  };
  const deleteDay = (id: string) => update((p) => ({ ...p, days: (p.days ?? []).filter((d) => d.id !== id), dayId: p.dayId === id ? null : p.dayId }));
  /** Dropping anchors in a new order is what plans the day: with no day yet, it starts one. */
  const reorder = useReorder((_scope, order) => {
    if (day) setDay((d) => reorderDay(d, order));
    else if (days.length < MAX_DAYS) newDay(order);
    setEpoch((e) => e + 1);
  });

  const share = async () => {
    const url = `${location.origin}${location.pathname}#s=${encodePlan(plan)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copy this link", url);
    }
  };
  const deselect = () => {
    setSeq(null);
    setPending(null);
    setSelectedState(null);
  };
  // Clicking empty map deselects (cards and markers stop their clicks reaching the map).
  const onMapClick = (p: LatLng) => {
    if (adding) addAnchorAt(p);
    else deselect();
  };
  const onAnchorClick = (id: string) => setEdit((e) => (e === id ? null : id));
  /** The selected card's chevron: open its listing, or bring its panel card into view. */
  const showDetail = (id: string) => {
    const o = options.find((x) => x.id === id);
    const url = o?.source.kind === "trademe" ? o.source.url : o?.source.kind === "feed" ? o.source.url : undefined;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setCollapsed(false);
    requestAnimationFrame(() => document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };
  const running = !!(seq || pending);

  // Escape backs out one step: cancel adding, close an editor, then deselect.
  const escape = useRef(() => {});
  useEffect(() => {
    escape.current = () => {
      if (adding) setAdding(false);
      else if (edit) setEdit(null);
      else deselect();
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target as HTMLElement)?.closest?.(".search")) return;
      escape.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hasMaps = hasMapsKey;

  /* ---------- pieces ---------- */
  const modeButton = (r: OptionSummary, l: LegView, m: Mode) => {
    const mins = l.byMode[m];
    const on = l.mode === m;
    const loading = on && r.option.id === selected && !l.leg && !legErrors[pairKey(l.from, l.to)];
    const walkable = m === "walk" && l.walkable;
    return (
      <button
        key={m}
        className={`mode${on ? " on" : ""}${walkable ? " walkable" : ""}${loading ? " loading" : ""}`}
        aria-pressed={on}
        disabled={mins === null && !on}
        onClick={() => chooseMode(l, m)}
        title={mins === null ? `No ${MODE_LABEL[m].toLowerCase()} route` : walkable ? "Walkable: 15 min or less on foot" : m === l.defaultMode ? "Usual way for this trip" : undefined}
      >
        <span className="mode-l">{MODE_LABEL[m]}</span>
        <span className="mode-t">{mins === undefined ? "…" : mins === null ? "–" : mins}</span>
      </button>
    );
  };

  const CATEGORIES = ["Gym", "Café", "Supermarket", "School", "Childcare", "Pharmacy"];
  const alongSection = (r: OptionSummary) => {
    const o = r.option;
    if (!r.legs.length) return null;
    const cur = along?.optionId === o.id ? along : null;
    const to = r.legs.find((l) => pairKey(l.from, l.to) === cur?.trip) ?? r.legs[0];
    const pick = (l: LegView) => (cur?.query ? searchAlong(o, l, cur.query) : setAlong({ optionId: o.id, trip: pairKey(l.from, l.to), query: "", loading: false, results: [] }));
    return (
      <div className="along">
        <div className="along-h"><b>Along the way</b><span>stops on your trip to</span></div>
        <div className="along-to" role="group" aria-label="Search along the trip to">
          {r.legs.map((l) => (
            <button key={pairKey(l.from, l.to)} aria-pressed={l === to} style={swatchStyle(l.anchor)} title={tripLabel(l)} onClick={() => pick(l)}>{l.anchor.name}</button>
          ))}
        </div>
        <div className="along-cats">
          {CATEGORIES.map((c) => (
            <button key={c} aria-pressed={cur?.query === c} onClick={() => searchAlong(o, to, c)}>{c}</button>
          ))}
          <form onSubmit={(e) => { e.preventDefault(); searchAlong(o, to, alongText); }}>
            <input className="text sm" value={alongText} onChange={(e) => setAlongText(e.target.value)} placeholder="Something else…" aria-label="Search for something else along the way" maxLength={60} />
          </form>
        </div>
        {cur?.loading && <p className="hint">Looking along your route…</p>}
        {cur?.error && <p className="err">{cur.error}</p>}
        {cur && !cur.loading && !cur.error && cur.query && !cur.results.length && <p className="hint">Nothing found for “{cur.query}” along this trip.</p>}
        {!!cur?.results.length && (
          <ol className="stops">
            {cur.results.map((r, i) => (
              <li key={r.id} className={hoverStop === r.id ? "hov" : ""} onMouseEnter={() => setHoverStop(r.id)} onMouseLeave={() => setHoverStop(null)}>
                <span className="stop-n">{i + 1}</span>
                <span className="stop-t">
                  <b>{r.name}</b>
                  <span>{[r.rating ? `★ ${r.rating.toFixed(1)}${r.ratings ? ` (${r.ratings})` : ""}` : null, r.detour == null ? null : r.detour <= 1 ? "On the way" : `+${r.detour} min`].filter(Boolean).join(" · ")}</span>
                </span>
                <button className="link" onClick={() => addStop(r)} disabled={anchors.length >= MAX_ANCHORS || anchors.some((a) => a.name === r.name.slice(0, 40))}>Add</button>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  };

  /** Anchors you can drag: the day's stops, or (with no day yet) every anchor, since dragging starts a day. */
  const stops = dayStops(anchors, day);
  const draggableIds = (day ? stops.stops : anchors).map((a) => a.id);
  const canDrag = anchors.length > 1 && (!!day || days.length < MAX_DAYS);
  const grip = (scope: string, a: Anchor) =>
    canDrag && draggableIds.includes(a.id) ? (
      <button className="grip" {...reorder.handle(scope, a.id, draggableIds, a.name)}><Icon name="grip" size={14} /></button>
    ) : canDrag && scope === "places" ? <span className="grip-space" aria-hidden="true" /> : null;
  /** Put an anchor in or out of the day (out = its own trip from home). */
  const skipButton = (a: Anchor) =>
    day ? (
      <button className="link daylink" onClick={() => { setDay((d) => toggleSkip(d, a.id)); setEpoch((e) => e + 1); }}>
        {day.skip.includes(a.id) ? "Add to day" : "Leave out"}
      </button>
    ) : null;

  const legRow = (r: OptionSummary, l: LegView, scope: string | null) => {
    const k = pairKey(l.from, l.to);
    const dragId = scope && l.kind !== "back" ? l.anchor.id : undefined;
    return (
      <div key={k} className={`leg${reorder.dragging === `${scope}:${dragId}` ? " dragging" : ""}`} style={swatchStyle(l.anchor)} data-reorder-id={dragId}>
        <div className="leg-h">
          {scope && l.kind !== "back" && grip(scope, l.anchor)}
          <b className="leg-n">{day ? tripLabel(l) : l.anchor.name}</b>
          {l.overridden && <button className="link" onClick={() => chooseMode(l, l.defaultMode)}>Reset</button>}
          <span className="leg-t">{typeof l.minutes === "number" ? `${l.minutes} min` : l.minutes === null ? "No route" : "…"}</span>
        </div>
        <div className="modes" role="group" aria-label={`How you get ${day ? `from ${l.prev?.name ?? "home"} ` : ""}to ${l.anchor.name}`}>{MODES.map((m) => modeButton(r, l, m))}</div>
        {legErrors[k] && <p className="err">{legErrors[k]}</p>}
      </div>
    );
  };

  /** A home's trips: the day's stops in order (draggable), the trip back, then anchors on their own. */
  const tripList = (r: OptionSummary) => {
    const scope = `card:${r.option.id}`;
    const byAnchor = new Map(r.legs.filter((l) => l.kind !== "back").map((l) => [l.anchor.id, l]));
    const ordered = reorder.order(scope, draggableIds).flatMap((id) => (byAnchor.has(id) ? [byAnchor.get(id)!] : []));
    const back = r.legs.filter((l) => l.kind === "back");
    const rest = r.legs.filter((l) => l.kind !== "back" && !draggableIds.includes(l.anchor.id));
    return (
      <>
        {day && <div className="daynote">{day.name} · in this order{canDrag ? ", drag to change it" : ""}</div>}
        <div data-reorder>{ordered.map((l) => legRow(r, l, canDrag ? scope : null))}</div>
        {back.map((l) => legRow(r, l, null))}
        {day && rest.length > 0 && <div className="daynote">On their own, from home</div>}
        {rest.map((l) => legRow(r, l, null))}
      </>
    );
  };

  const newHomeOpen = homeForm === "new" || (homeForm === null && !options.length);
  const card = (r: OptionSummary) => {
    const o = r.option, isSel = selected === o.id, open = isSel && !collapsed;
    const listing = listingUrl(o);
    if (homeForm === o.id) {
      return (
        <div key={o.id} id={`card-${o.id}`} className="card sel open">
          <div className="ch ch-static">
            <span className="ch-top">
              <span className="letter">{letter(o.id)}</span>
              <span className="t"><b>Edit property</b></span>
            </span>
          </div>
          <HomeForm initial={o} fetchListing={fetchListing} onSave={(d) => saveHome(o.id, d)} onCancel={() => setHomeForm("closed")} onRemove={() => { removeOption(o.id); setHomeForm("closed"); }} />
        </div>
      );
    }
    return (
      <div key={o.id} id={`card-${o.id}`} className={`card${isSel ? " sel" : ""}${open ? " open" : ""}`}>
        <button className="ch" aria-expanded={open} onClick={() => selectHome(o.id, true)}>
          <span className="ch-top">
            <span className="letter">{letter(o.id)}</span>
            <span className="t">
              <b>{o.title}</b>
              <span>{[o.subtitle, homeFacts(o, o.price ? formatPrice(o.price) : null)].filter(Boolean).join(" · ")}</span>
            </span>
            <Icon name="chev" size={14} className="chev" />
          </span>
          {!open && (
            <span className="chips">
              {r.legs.map((l, i) => {
                const best = typeof l.minutes === "number" && cmp.fastest[i] === l.minutes;
                return (
                  <span key={pairKey(l.from, l.to)} className={`chip${best ? " best" : ""}`} title={`${day ? `${tripLabel(l)} · ` : ""}${MODE_LABEL[l.mode]}${best ? " · fastest of your homes" : ""}`} style={swatchStyle(l.anchor)}>
                    <span className="cn">{l.anchor.name}</span>
                    {l.minutes === undefined ? (legErrors[pairKey(l.from, l.to)] || !hasMaps ? "–" : "…") : l.minutes === null ? "–" : `${l.minutes} min`}
                  </span>
                );
              })}
            </span>
          )}
        </button>
        {open && (
          <div className="cb">
            {tripList(r)}
            {alongSection(r)}
            <div className="cb-foot">
              {listing ? (
                <a className="btn dark" href={listing} target="_blank" rel="noopener noreferrer">View listing</a>
              ) : null}
              <button className="btn" onClick={() => setHomeForm(o.id)}>Edit details</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const anchorRow = (a: Anchor, n: number | null) => (
    <div key={a.id} data-reorder-id={draggableIds.includes(a.id) ? a.id : undefined} className={reorder.dragging === `places:${a.id}` ? "dragging" : undefined}>
      <div className="arow-wrap">
        {grip("places", a)}
        <button className="prow" aria-expanded={edit === a.id} onClick={() => { setEdit(edit === a.id ? null : a.id); setAdding(false); }} style={swatchStyle(a)}>
          <span className="bar" aria-hidden="true" />
          <span className="t">
            <b>{n != null && <span className="stopn">{n}</span>}{a.name}</b>
            <span>{day && day.skip.includes(a.id) ? `Own trip from home · ${MODE_LABEL[a.mode].toLowerCase()}` : `${MODE_LABEL[a.mode]} by default`}</span>
          </span>
          <Icon name="chev" size={14} className="chev" />
        </button>
        {skipButton(a)}
      </div>
      {edit === a.id && (
        <div className="edit">
          <label className="flabel" htmlFor={`name-${a.id}`}>Name <span>shown on the map</span></label>
          <input id={`name-${a.id}`} className="text" value={a.name} maxLength={40} onChange={(e) => patchAnchor(a.id, { name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && setEdit(null)} />
          <label className="flabel" htmlFor={`move-${a.id}`}>Address</label>
          {a.address && <p className="hint addr">{a.address}</p>}
          {hasMaps && (
            <PlaceSearch id={`move-${a.id}`} placeholder="Search to change the address" onPick={(pl) => update((p) => { const nid = newId(); const swap = (id: string) => (id === a.id ? nid : id); return { ...p, anchors: p.anchors.map((x) => (x.id === a.id ? { ...x, id: nid, location: pl.location, address: pl.address ?? [pl.title, pl.subtitle].filter(Boolean).join(", ") } : x)), days: (p.days ?? []).map((d) => ({ ...d, order: d.order.map(swap), skip: d.skip.map(swap) })) }; })} />
          )}
          <div className="seg" role="group" aria-label="Default way to get there">
            {MODES.map((m) => (
              <button key={m} aria-pressed={a.mode === m} onClick={() => patchAnchor(a.id, { mode: m })}>
                <Icon name={m} size={14} />{MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <div className="edit-foot">
            <button className="link danger" onClick={() => { update((p) => { const anchors = p.anchors.filter((x) => x.id !== a.id); return { ...p, anchors, days: pruneDays(p.days ?? [], anchors) }; }); setEdit(null); }}>Remove</button>
            <button className="link" onClick={() => setEdit(null)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );

  /** Separate trips (the default) or one of your saved days. */
  const dayBar = anchors.length > 1 && (
    <div className="daybar">
      <div className="days" role="group" aria-label="How your trips are planned">
        <button aria-pressed={!day} onClick={() => chooseDay(null)} title="Every life anchor is its own trip from home">Separate trips</button>
        {days.map((d) => (
          <button key={d.id} aria-pressed={d.id === day?.id} onClick={() => chooseDay(d.id)}>{d.name}</button>
        ))}
        {days.length < MAX_DAYS && <button className="newday" onClick={() => newDay()}><Icon name="plus" size={12} />New day</button>}
      </div>
      {day ? (
        <div className="dayedit">
          <input className="text sm" value={day.name} maxLength={30} aria-label="Name of this day" onChange={(e) => setDay((d) => ({ ...d, name: e.target.value }))} onBlur={(e) => !e.target.value.trim() && setDay((d) => ({ ...d, name: newDayName(days.filter((x) => x.id !== d.id)) }))} />
          <button className="link danger" onClick={() => deleteDay(day.id)}>Delete day</button>
        </div>
      ) : (
        <p className="hint dayhint">Drag your anchors into the order you visit them to plan a day: home, then each stop in turn.</p>
      )}
    </div>
  );

  const placeOrder = reorder.order("places", draggableIds);
  const homeRow = day && stops.stops.length > 0 && (
    <div className="arow-wrap">
      <span className="grip-space" aria-hidden="true" />
      <div className="prow static" style={swatchStyle({ color: "home" } as Anchor)}>
        <span className="bar" aria-hidden="true" />
        <span className="t">
          <b>{day.home && <span className="stopn">{stops.stops.length + 1}</span>}Back home</b>
          <span>{day.home ? "The trip home at the end of the day" : "Not in this day"}</span>
        </span>
      </div>
      <button className="link daylink" onClick={() => setDay((d) => ({ ...d, home: !d.home }))}>{day.home ? "Leave out" : "Add to day"}</button>
    </div>
  );

  const places = (
    <>
      <div className="sec">{day ? "Life anchors · your day, in order" : "Life anchors · usual way to get there"}</div>
      {dayBar}
      <div className="nav">
        <div data-reorder>
          {placeOrder.map((id) => anchors.find((a) => a.id === id)).filter((a): a is Anchor => !!a).map((a, i) => anchorRow(a, day ? i + 1 : null))}
        </div>
        {homeRow}
        {day && stops.own.length > 0 && <div className="daynote">Left out · their own trips from home</div>}
        {day && stops.own.map((a) => anchorRow(a, null))}
        {anchors.length < MAX_ANCHORS && (
          <button className="prow add" onClick={() => { setAdding(!adding); setEdit(null); }} aria-expanded={adding}>
            <span className="badge lg"><Icon name="plus" size={15} /></span>
            <span className="t"><b>Add a life anchor</b></span>
          </button>
        )}
        {adding && (
          <div className="edit">
            <label className="flabel" htmlFor="new-name">Name <span>e.g. Work, Gym, Mum’s place</span></label>
            <input id="new-name" className="text" autoFocus value={draft.name} maxLength={40} placeholder="Place" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <div className="seg" role="group" aria-label="Usual way to get there">
              {MODES.map((m) => (
                <button key={m} aria-pressed={draft.mode === m} onClick={() => setDraft({ ...draft, mode: m })}>
                  <Icon name={m} size={14} />{MODE_LABEL[m]}
                </button>
              ))}
            </div>
            <label className="flabel" htmlFor="add-place">Address</label>
            {hasMaps && <PlaceSearch id="add-place" placeholder="Search the address" onPick={(pl) => addAnchorAt(pl.location, pl.address ?? [pl.title, pl.subtitle].filter(Boolean).join(", "))} />}
            <p className="hint">{hasMaps ? "Or click the map to drop a pin." : "Click the map to drop a pin."}</p>
            <div className="edit-foot"><span /><button className="link" onClick={() => setAdding(false)}>Cancel</button></div>
          </div>
        )}
      </div>
    </>
  );

  const body = (
    <div className="app">
      <aside className="side">
        <div className="head">
          <h1 className="brand"><Link href="/" aria-label="Settle home"><Wordmark size={22} mark={28} /></Link></h1>
          <div className="head-actions">
            <button className={`btn${running ? "" : " dark"}`} onClick={running ? skip : startCompare} disabled={!options.length || !anchors.length}>
              {running ? "Skip" : hasRun ? "Replay" : "Compare"}
            </button>
            <button className="btn" onClick={share} disabled={!options.length && !anchors.length}>{copied ? "Copied" : "Share"}</button>
          </div>
        </div>
        <div className="side-scroll">
          {plan.example && (
            <div className="banner">
              <span><b>This is an example.</b> Have a look around, then start your own.</span>
              <a href="/compare">Start your own</a>
            </div>
          )}
          {!anchors.length ? (
            <>
              <div className="onboard">
                <span className="ob-step">Step 1 of 2</span>
                <h2>Start with your life anchors</h2>
                <p>The places that actually matter: work, the gym, your partner’s place, the kids’ school. Every home you add is measured against them.</p>
                <div className="ob-ideas">
                  {ANCHOR_IDEAS.map((n) => (
                    <button key={n} onClick={() => { setDraft({ name: n, mode: "drive" }); setAdding(true); setEdit(null); }}>{n}</button>
                  ))}
                </div>
              </div>
              {places}
            </>
          ) : (
            <>
            <div className="sec">Your properties · one-way, weekday 8am</div>
            {running && (
              <div className="status">
                <span>{seq ? `Comparing · ${seq.i + 1} of ${seq.order.length} · best last` : "Getting routes…"}</span>
              </div>
            )}
            {error && <p className="err" style={{ margin: "0 2px 10px" }}>{error}</p>}
            {options.map((o) => cmp.rows.find((r) => r.option.id === o.id)!).map(card)}
            {hasMaps && options.length < MAX_OPTIONS && (
              newHomeOpen ? (
                <div className="newhome">
                  {!options.length && <p className="nh-step"><b>Step 2 of 2 · Add your properties here</b> Give it a name, then the address or a TradeMe link. Settle works out the trip from it to each of your anchors.</p>}
                  <HomeForm fetchListing={fetchListing} onSave={(d) => saveHome(null, d)} onCancel={() => setHomeForm("closed")} />
                </div>
              ) : (
                <button className="prow add addprop" onClick={() => { setHomeForm("new"); setAdding(false); setEdit(null); }}>
                  <span className="badge lg"><Icon name="plus" size={15} /></span>
                  <span className="t"><b>Add a property</b>{!options.length && <span>Name it, then the address or a listing link</span>}</span>
                </button>
              )
            )}
            {!hasMaps && <p className="hint">Adding homes and places needs the Google Maps key (see README).</p>}
              <div className="hr" />
              {places}
            </>
          )}
        </div>
      </aside>
      <main className="mapwrap">
        {hasMaps ? (
          <>
            <MapView
              anchors={anchors}
              options={options}
              rows={cmp.rows}
              selected={selected}
              epoch={epoch}
              instant={reduceMotion}
              stepped={stepped}
              onDetail={showDetail}
              onPhotos={setPhotos}
              stops={along && along.optionId === selected ? along.results : []}
              hoverStop={hoverStop}
              onStopHover={setHoverStop}
              fitKey={fitKey}
              dropMode={adding}
              onSelect={(id) => selectHome(id)}
              onAnchorClick={onAnchorClick}
              onMapClick={onMapClick}
            />
            {adding && <div className="droptip">Click the map to drop a pin · or search on the left</div>}
            <label className="steptoggle" title="Draw a home's routes one place at a time">
              <input type="checkbox" checked={stepped} onChange={(e) => setStepped(e.target.checked)} />
              <span aria-hidden="true" />
              Step through routes
            </label>
            <button className="fitbtn" onClick={() => setFitKey(newId())} aria-label="Show every home, place and route">
              <Icon name="expand" size={15} />Show all
            </button>
          </>
        ) : (
          <div className="nomap">
            <div>
              <b>The map needs a Google Maps key</b>
              Add <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> (browser) and <code>GOOGLE_MAPS_SERVER_KEY</code> (server) to <code>.env.local</code>, then restart. The README has the steps.
            </div>
          </div>
        )}
      </main>
    </div>
  );

  return hasMaps ? <APIProvider apiKey={API_KEY} language={typeof navigator !== "undefined" ? navigator.language : undefined}>{body}</APIProvider> : body;
}
