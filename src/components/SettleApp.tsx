"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compare, effectiveMode, formatPrice, legKey, pairKey, type LegView, type OptionSummary } from "@/core/compare";
import { anchorColor, decodePlan, encodePlan, EXAMPLE_PLAN, letterOf, migratePlan, MAX_ANCHORS, MAX_OPTIONS, newId, nextAnchorColor, type Plan } from "@/core/plan";
import type { Anchor, LatLng, Leg, Mode, Option, Time } from "@/core/types";
import type { AlongResult } from "@/server/places";
import { Icon, MODE_LABEL } from "./icons";
import { Wordmark } from "./Logo";
import { PlaceSearch, type PickedPlace } from "./PlaceSearch";
import { DRAW_MS, STEP_DRAW, STEP_GAP } from "./RouteLayer";

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
  const [adding, setAdding] = useState(false);
  // The new place being set up: name and icon first, then the address.
  const [draft, setDraft] = useState<{ name: string; mode: Mode }>({ name: "", mode: "drive" });
  const [error, setError] = useState<string | null>(null);
  const [legErrors, setLegErrors] = useState<Record<string, string>>({});
  // "Along the way": stops (any category) on a selected home's route to one of your places.
  const [along, setAlong] = useState<{ optionId: string; anchorId: string; query: string; loading: boolean; results: AlongResult[]; error?: string } | null>(null);
  const [alongText, setAlongText] = useState("");
  const [hoverStop, setHoverStop] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fitKey, setFitKey] = useState("init");

  const { anchors, options } = plan;
  const overrides = useMemo(() => plan.overrides ?? {}, [plan.overrides]);
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

  const cmp = useMemo(() => compare(options, anchors, legs, times, overrides), [options, anchors, legs, times, overrides]);

  // Exactly one home is always selected: the one you picked, the one the sequence is on, or the best.
  // Nothing is selected until you pick a home (or Compare finishes on the best one).
  const selected = seq ? seq.order[seq.i] : selectedState && options.some((o) => o.id === selectedState) ? selectedState : null;

  /* ---------- times for the other modes (mode buttons), selected home only ---------- */
  // Route lines already give the chosen mode's time for every home, so the matrix is only
  // asked for the selected home and only for modes that aren't known yet. Cached per pair.
  const timesWanted = useMemo(() => {
    const o = options.find((x) => x.id === selected);
    if (!o || seq || !anchors.length || !hasMapsKey) return null; // not while Compare steps through every home
    const modes = MODES.filter((m) => anchors.some((a) => !legs.has(legKey(o.id, a.id, m)) && !times.has(legKey(o.id, a.id, m))));
    return modes.length ? { o, modes } : null;
  }, [selected, seq, options, anchors, legs, times]);
  const timesInflight = useRef(false);
  useEffect(() => {
    if (!timesWanted || timesInflight.current) return;
    timesInflight.current = true;
    postJson<{ times: Time[] }>("/api/times", {
      timeZone: timeZone(),
      options: [{ id: timesWanted.o.id, location: timesWanted.o.location }],
      anchors: anchors.map((a) => ({ id: a.id, location: a.location })),
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
  }, [timesWanted, anchors]);

  /* ---------- "5–9 min at peak" for the selected home's drives only (two requests each) ---------- */
  const peakAsked = useRef(new Set<string>());
  useEffect(() => {
    const o = options.find((x) => x.id === selected);
    if (!o || seq || !hasMapsKey) return;
    const want = anchors
      .map((a) => ({ a, leg: legs.get(legKey(o.id, a.id, "drive")) }))
      .filter(({ a, leg }) => leg?.status === "ok" && !leg.peak && !peakAsked.current.has(legKey(o.id, a.id, "drive")));
    if (!want.length) return;
    for (const { a } of want) peakAsked.current.add(legKey(o.id, a.id, "drive"));
    postJson<{ peaks: { optionId: string; anchorId: string; peak: [number, number] | null }[] }>("/api/peak", {
      timeZone: timeZone(),
      pairs: want.map(({ a }) => ({ optionId: o.id, anchorId: a.id, origin: o.location, destination: a.location })),
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
  }, [selected, seq, options, anchors, legs]);

  /* ---------- route lines, only for the mode chosen per pair: the selected home, or every home for Compare ---------- */
  // Every home's routes are shown (grey for homes that aren't selected), so fetch them all; results are cached.
  const scope = options;
  const legsMissing = useMemo(
    () =>
      hasMapsKey
        ? scope.flatMap((o) =>
            anchors
              .map((a) => ({ o, a, mode: effectiveMode(overrides, o.id, a) }))
              .filter(({ o, a, mode }) => !legs.has(legKey(o.id, a.id, mode)) && !legErrors[pairKey(o.id, a.id)]),
          )
        : [],
    [scope, anchors, overrides, legs, legErrors],
  );
  const legsInflight = useRef(false);
  const previousMode = useRef<Record<string, Mode>>({});
  useEffect(() => {
    if (!legsMissing.length || legsInflight.current) return;
    legsInflight.current = true;
    const batch = legsMissing;
    postJson<{ legs: Leg[] }>("/api/routes", {
      timeZone: timeZone(),
      pairs: batch.map(({ o, a, mode }) => ({ optionId: o.id, anchorId: a.id, mode, origin: o.location, destination: a.location })),
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
        const switched = batch.filter(({ o, a }) => previousMode.current[pairKey(o.id, a.id)]);
        if (switched.length && switched.length === batch.length) {
          setPlan((p) => {
            const ov = { ...(p.overrides ?? {}) };
            for (const { o, a } of switched) {
              const prev = previousMode.current[pairKey(o.id, a.id)];
              if (prev === a.mode) delete ov[pairKey(o.id, a.id)];
              else ov[pairKey(o.id, a.id)] = prev;
            }
            return { ...p, overrides: ov };
          });
          setLegErrors((errs) => ({ ...errs, ...Object.fromEntries(switched.map(({ o, a }) => [pairKey(o.id, a.id), "Couldn't get that route. Try again."])) }));
        } else {
          setError(e.message);
        }
      })
      .finally(() => {
        for (const { o, a } of batch) delete previousMode.current[pairKey(o.id, a.id)];
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
    }, stepMs(stepped, anchors.length));
    return () => clearTimeout(t);
  }, [seq, stepped, anchors.length]);

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
  const searchAlong = async (o: Option, a: Anchor, query: string) => {
    const leg = legs.get(legKey(o.id, a.id, effectiveMode(overrides, o.id, a)));
    const q = query.trim();
    if (q.length < 2) return;
    if (leg?.status !== "ok" || !leg.polyline) {
      setAlong({ optionId: o.id, anchorId: a.id, query: q, loading: false, results: [], error: "That route is still loading. Try again in a moment." });
      return;
    }
    setAlong({ optionId: o.id, anchorId: a.id, query: q, loading: true, results: [] });
    try {
      const j = await postJson<{ results: AlongResult[] }>("/api/along", { query: q, polyline: leg.polyline, origin: o.location, mode: leg.mode, baseMinutes: leg.minutes ?? 0 });
      setAlong((cur) => (cur && cur.query === q && cur.optionId === o.id && cur.anchorId === a.id ? { ...cur, loading: false, results: j.results } : cur));
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
    update((p) => ({ ...p, options: p.options.filter((x) => x.id !== id), overrides: Object.fromEntries(Object.entries(p.overrides ?? {}).filter(([k]) => !k.startsWith(`${id}|`))) }));
    if (selectedState === id) setSelectedState(null);
  };
  const addOptionFromPlace = (pl: PickedPlace) => addOption({ id: newId(), title: pl.title, subtitle: pl.subtitle, location: pl.location, source: { kind: "manual" } });
  const addOptionFromLink = async (url: string) => {
    const r = await fetch(`/api/listing?url=${encodeURIComponent(url)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "Couldn't add that listing.");
    addOption(j.option as Option);
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
  const chooseMode = (o: Option, a: Anchor, mode: Mode) => {
    const k = pairKey(o.id, a.id);
    const current = effectiveMode(overrides, o.id, a);
    if (mode === current) return;
    previousMode.current[k] = current;
    setLegErrors((errs) => {
      const next = { ...errs };
      delete next[k];
      return next;
    });
    update((p) => {
      const ov = { ...(p.overrides ?? {}) };
      if (mode === a.mode) delete ov[k];
      else ov[k] = mode;
      return { ...p, overrides: ov };
    });
  };
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
    const loading = on && r.option.id === selected && !l.leg && !legErrors[pairKey(r.option.id, l.anchor.id)];
    const walkable = m === "walk" && l.walkable;
    return (
      <button
        key={m}
        className={`mode${on ? " on" : ""}${walkable ? " walkable" : ""}${loading ? " loading" : ""}`}
        aria-pressed={on}
        disabled={mins === null && !on}
        onClick={() => chooseMode(r.option, l.anchor, m)}
        title={mins === null ? `No ${MODE_LABEL[m].toLowerCase()} route` : walkable ? "Walkable: 15 min or less on foot" : m === l.anchor.mode ? "Default for this place" : undefined}
      >
        <span className="mode-l">{MODE_LABEL[m]}</span>
        <span className="mode-t">{mins === undefined ? "…" : mins === null ? "–" : mins}</span>
      </button>
    );
  };

  const CATEGORIES = ["Gym", "Café", "Supermarket", "School", "Childcare", "Pharmacy"];
  const alongSection = (o: Option) => {
    if (!anchors.length) return null;
    const cur = along?.optionId === o.id ? along : null;
    const to = anchors.find((a) => a.id === cur?.anchorId) ?? anchors[0];
    return (
      <div className="along">
        <div className="along-h"><b>Along the way</b><span>stops on your trip to</span></div>
        <div className="along-to" role="group" aria-label="Search along the trip to">
          {anchors.map((a) => (
            <button key={a.id} aria-pressed={a.id === to.id} style={swatchStyle(a)} onClick={() => (cur?.query ? searchAlong(o, a, cur.query) : setAlong({ optionId: o.id, anchorId: a.id, query: "", loading: false, results: [] }))}>{a.name}</button>
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

  const card = (r: OptionSummary) => {
    const o = r.option, isSel = selected === o.id, open = isSel && !collapsed;
    const listing = o.source.kind === "trademe" ? o.source.url : o.source.kind === "feed" ? o.source.url : undefined;
    return (
      <div key={o.id} id={`card-${o.id}`} className={`card${isSel ? " sel" : ""}${open ? " open" : ""}`}>
        <button className="ch" aria-expanded={open} onClick={() => selectHome(o.id, true)}>
          <span className="ch-top">
            <span className="letter">{letter(o.id)}</span>
            <span className="t">
              <b>{o.title}</b>
              <span>{[o.subtitle, o.price ? formatPrice(o.price) : null, o.bedrooms ? `${o.bedrooms} bed` : null].filter(Boolean).join(" · ")}</span>
            </span>
            <Icon name="chev" size={14} className="chev" />
          </span>
          {!open && (
            <span className="chips">
              {r.legs.map((l, ai) => (
                <span key={l.anchor.id} className={`chip${typeof l.minutes === "number" && cmp.fastest[ai] === l.minutes ? " best" : ""}`} title={`${MODE_LABEL[l.mode]}${typeof l.minutes === "number" && cmp.fastest[ai] === l.minutes ? " · fastest of your homes" : ""}`} style={swatchStyle(l.anchor)}>
                  <span className="cn">{l.anchor.name}</span>
                  {l.minutes === undefined ? (legErrors[pairKey(o.id, l.anchor.id)] || !hasMaps ? "–" : "…") : l.minutes === null ? "–" : `${l.minutes} min`}
                </span>
              ))}
            </span>
          )}
        </button>
        {open && (
          <div className="cb">
            {r.legs.map((l) => {
              const k = pairKey(o.id, l.anchor.id);
              return (
                <div key={l.anchor.id} className="leg" style={swatchStyle(l.anchor)}>
                  <div className="leg-h">
                    <b className="leg-n">{l.anchor.name}</b>
                    {l.overridden && (
                      <button className="link" onClick={() => chooseMode(o, l.anchor, l.anchor.mode)}>Reset</button>
                    )}
                    <span className="leg-t">{typeof l.minutes === "number" ? `${l.minutes} min` : l.minutes === null ? "No route" : "…"}</span>
                  </div>
                  <div className="modes" role="group" aria-label={`How you get to ${l.anchor.name}`}>{MODES.map((m) => modeButton(r, l, m))}</div>
                  {legErrors[k] && <p className="err">{legErrors[k]}</p>}
                </div>
              );
            })}
            {alongSection(o)}
            <div className="cb-foot">
              {listing ? (
                <a className="btn dark" href={listing} target="_blank" rel="noopener noreferrer">View listing</a>
              ) : null}
              <button className="btn" onClick={() => removeOption(o.id)}>Remove</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const places = (
    <>
      <div className="sec">Life anchors · usual way to get there</div>
      <div className="nav">
        {anchors.map((a) => (
          <div key={a.id}>
            <button className="prow" aria-expanded={edit === a.id} onClick={() => { setEdit(edit === a.id ? null : a.id); setAdding(false); }} style={swatchStyle(a)}>
              <span className="bar" aria-hidden="true" />
              <span className="t">
                <b>{a.name}</b>
                <span>{MODE_LABEL[a.mode]} by default</span>
              </span>
              <Icon name="chev" size={14} className="chev" />
            </button>
            {edit === a.id && (
              <div className="edit">
                <label className="flabel" htmlFor={`name-${a.id}`}>Name <span>shown on the map</span></label>
                <input id={`name-${a.id}`} className="text" value={a.name} maxLength={40} onChange={(e) => patchAnchor(a.id, { name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && setEdit(null)} />
                <label className="flabel" htmlFor={`move-${a.id}`}>Address</label>
                {a.address && <p className="hint addr">{a.address}</p>}
                {hasMaps && (
                  <PlaceSearch id={`move-${a.id}`} placeholder="Search to change the address" onPick={(pl) => update((p) => ({ ...p, anchors: p.anchors.map((x) => (x.id === a.id ? { ...x, id: newId(), location: pl.location, address: pl.address ?? [pl.title, pl.subtitle].filter(Boolean).join(", ") } : x)) }))} />
                )}
                <div className="seg" role="group" aria-label="Default way to get there">
                  {MODES.map((m) => (
                    <button key={m} aria-pressed={a.mode === m} onClick={() => patchAnchor(a.id, { mode: m })}>
                      <Icon name={m} size={14} />{MODE_LABEL[m]}
                    </button>
                  ))}
                </div>
                <div className="edit-foot">
                  <button className="link danger" onClick={() => { update((p) => ({ ...p, anchors: p.anchors.filter((x) => x.id !== a.id) })); setEdit(null); }}>Remove</button>
                  <button className="link" onClick={() => setEdit(null)}>Done</button>
                </div>
              </div>
            )}
          </div>
        ))}
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
            {hasMaps && options.length < MAX_OPTIONS && (
              <div className="addhome">
                <PlaceSearch id="add-home" placeholder="Paste a TradeMe link or type an address" onPick={addOptionFromPlace} onLink={addOptionFromLink} />
              </div>
            )}
            <div className="subhead">
              <span>One-way travel times · weekday 8am</span>
            </div>
            {running && (
              <div className="status">
                <span>{seq ? `Comparing · ${seq.i + 1} of ${seq.order.length} · best last` : "Getting routes…"}</span>
              </div>
            )}
            {error && <p className="err" style={{ margin: "0 2px 10px" }}>{error}</p>}
            {options.length ? options.map((o) => cmp.rows.find((r) => r.option.id === o.id)!).map(card) : <div className="empty"><b>Step 2 of 2 · Add the homes you’re considering</b><br />Paste a TradeMe link or type an address above. Settle works out the trip from each one to your anchors.</div>}
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
              overrides={overrides}
              rows={cmp.rows}
              legs={legs}
              selected={selected}
              epoch={epoch}
              instant={reduceMotion}
              stepped={stepped}
              onDetail={showDetail}
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
