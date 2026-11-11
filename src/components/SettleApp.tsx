"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compare, effectiveMode, formatPrice, legKey, pairKey, type LegView, type OptionSummary } from "@/core/compare";
import { decodePlan, encodePlan, EXAMPLE_PLAN, MAX_ANCHORS, MAX_OPTIONS, newId, OPTION_COLORS, type Plan } from "@/core/plan";
import type { Anchor, LatLng, Leg, Mode, Option, Time } from "@/core/types";
import { ANCHOR_ICONS, Icon, MODE_LABEL } from "./icons";
import { PlaceSearch, type PickedPlace } from "./PlaceSearch";
import type { Phase } from "./RouteLayer";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const PLAN_KEY = "settle.plan.v1";
const LEGS_KEY = "settle.legs.v2";
const TIMES_KEY = "settle.times.v1";
const MODES: Mode[] = ["transit", "drive", "bike", "walk"];

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function loadPlan(): Plan {
  const m = location.hash.match(/^#s=([\w-]+)/);
  if (m) {
    const p = decodePlan(m[1]);
    if (p) return p;
  }
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    if (raw) return JSON.parse(raw) as Plan;
  } catch {}
  return EXAMPLE_PLAN;
}

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

/** "1 h 32 m" / "48 m" for compact totals. */
function hm(min: number): string {
  if (min < 60) return `${min} m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} m` : `${h} h`;
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
  const [comparing, setComparing] = useState(false);
  const [run, setRun] = useState<{ id: string; started: boolean } | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legErrors, setLegErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [fitKey, setFitKey] = useState("init");
  const [phaseState, setPhaseState] = useState<{ key: string; p: Phase }>({ key: "", p: null });

  const { anchors, options } = plan;
  const overrides = useMemo(() => plan.overrides ?? {}, [plan.overrides]);
  const colorOf = useCallback((id: string) => OPTION_COLORS[Math.max(0, options.findIndex((o) => o.id === id)) % OPTION_COLORS.length], [options]);

  // Persist locally; drop a share hash once the plan has been loaded from it.
  useEffect(() => {
    try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); } catch {}
    if (location.hash.startsWith("#s=")) history.replaceState(null, "", location.pathname + location.search);
  }, [plan]);
  useEffect(() => saveMap(LEGS_KEY, legs, 300), [legs]);
  useEffect(() => saveMap(TIMES_KEY, times, 1200), [times]);

  const update = (fn: (p: Plan) => Plan) => setPlan((p) => ({ ...fn(p), example: false }));

  /* ---------- times for every mode (batch, no route lines) ---------- */
  const timesMissing = useMemo(
    () => options.some((o) => anchors.some((a) => MODES.some((m) => !times.has(legKey(o.id, a.id, m))))),
    [options, anchors, times],
  );
  const timesInflight = useRef(false);
  const [timesLoading, setTimesLoading] = useState(false);
  useEffect(() => {
    if (!timesMissing || timesInflight.current || !options.length || !anchors.length) return;
    timesInflight.current = true;
    setTimesLoading(true);
    postJson<{ times: Time[] }>("/api/times", {
      timeZone: timeZone(),
      options: options.map((o) => ({ id: o.id, location: o.location })),
      anchors: anchors.map((a) => ({ id: a.id, location: a.location })),
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
        setTimesLoading(false);
      });
  }, [timesMissing, options, anchors]);

  /* ---------- route lines, only for the mode chosen per pair, only while comparing ---------- */
  const legsMissing = useMemo(
    () =>
      comparing
        ? options.flatMap((o) =>
            anchors
              .map((a) => ({ o, a, mode: effectiveMode(overrides, o.id, a) }))
              .filter(({ o, a, mode }) => !legs.has(legKey(o.id, a.id, mode)) && !legErrors[pairKey(o.id, a.id)]),
          )
        : [],
    [comparing, options, anchors, overrides, legs, legErrors],
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
        setRun((r) => (r && !r.started ? { ...r, started: true } : r));
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
          setRun((r) => (r && !r.started ? { ...r, started: true } : r));
        }
      })
      .finally(() => {
        for (const { o, a } of batch) delete previousMode.current[pairKey(o.id, a.id)];
        legsInflight.current = false;
      });
  }, [legsMissing]);

  const cmp = useMemo(() => compare(options, anchors, legs, times, overrides), [options, anchors, legs, times, overrides]);

  // The draw sequence starts once the first batch of route lines is in, so it never waits on the network.
  const runKey = comparing && run?.started ? run.id : null;
  const phase: Phase = runKey && phaseState.key === runKey ? phaseState.p : null;
  const onPhase = useCallback((key: string, p: Phase) => setPhaseState({ key, p }), []);
  const drawOrder = useMemo(() => options.filter((o) => anchors.some((a) => legs.get(legKey(o.id, a.id, effectiveMode(overrides, o.id, a)))?.status === "ok")).map((o) => o.id), [options, anchors, legs, overrides]);
  const drawingId = typeof phase === "number" ? drawOrder[phase] : undefined;

  /* ---------- actions ---------- */
  const addAnchorAt = (location: LatLng, name: string, address?: string) => {
    if (anchors.length >= MAX_ANCHORS) return;
    const a: Anchor = { id: newId(), name: name.slice(0, 40), icon: "other", location, address, mode: "transit" };
    update((p) => ({ ...p, anchors: [...p.anchors, a] }));
    setAdding(false);
    setEdit(a.id);
  };
  const patchAnchor = (id: string, patch: Partial<Anchor>) => update((p) => ({ ...p, anchors: p.anchors.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const addOption = (o: Option) => {
    if (options.length >= MAX_OPTIONS) return setError(`You can compare up to ${MAX_OPTIONS} homes at once.`);
    if (options.some((x) => x.id === o.id)) return setError("That home is already on your list.");
    setError(null);
    update((p) => ({ ...p, options: [...p.options, o] }));
    setFitKey(newId());
  };
  const removeOption = (id: string) => {
    update((p) => ({ ...p, options: p.options.filter((x) => x.id !== id), overrides: Object.fromEntries(Object.entries(p.overrides ?? {}).filter(([k]) => !k.startsWith(`${id}|`))) }));
    if (focus === id) setFocus(null);
  };
  const addOptionFromPlace = (pl: PickedPlace) => addOption({ id: newId(), title: pl.title, subtitle: pl.subtitle, location: pl.location, source: { kind: "manual" } });
  const addOptionFromLink = async (url: string) => {
    const r = await fetch(`/api/listing?url=${encodeURIComponent(url)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "Couldn't add that listing.");
    addOption(j.option as Option);
  };
  const startCompare = () => {
    const ready = options.every((o) => anchors.every((a) => legs.has(legKey(o.id, a.id, effectiveMode(overrides, o.id, a)))));
    setComparing(true);
    setRun({ id: newId(), started: ready });
    setFocus(null);
    setEdit(null);
    setAdding(false);
    setError(null);
    setFitKey(newId());
  };
  const stopCompare = () => {
    setComparing(false);
    setRun(null);
  };
  const toggleCard = (id: string) => {
    setFocus((f) => (f === id ? null : id));
    setFitKey(newId());
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
  const onMapClick = (p: LatLng) => {
    if (adding) addAnchorAt(p, "Pinned place");
  };
  const onAnchorClick = (id: string) => setEdit((e) => (e === id ? null : id));

  const hasMaps = !!API_KEY;
  const phaseDone = phase === "done";

  /* ---------- pieces ---------- */
  const modeButton = (r: OptionSummary, l: LegView, m: Mode) => {
    const mins = l.byMode[m];
    const selected = l.mode === m;
    const loading = selected && comparing && !l.leg && !legErrors[pairKey(r.option.id, l.anchor.id)];
    const walkable = m === "walk" && l.walkable;
    return (
      <button
        key={m}
        className={`mode${selected ? " on" : ""}${walkable ? " walkable" : ""}${loading ? " loading" : ""}`}
        aria-pressed={selected}
        disabled={mins === null && !selected}
        onClick={() => chooseMode(r.option, l.anchor, m)}
        title={mins === null ? `No ${MODE_LABEL[m].toLowerCase()} route` : undefined}
      >
        <span className="mode-t">
          <Icon name={m} size={13} />
          {mins === undefined ? "…" : mins === null ? "–" : mins}
        </span>
        <span className="mode-l">{walkable ? "Walkable" : `${MODE_LABEL[m]}${m === l.anchor.mode ? " · default" : ""}`}</span>
      </button>
    );
  };

  const card = (r: OptionSummary) => {
    const o = r.option, open = focus === o.id, col = colorOf(o.id);
    const dim = !!focus && !open;
    const listing = o.source.kind === "trademe" ? o.source.url : o.source.kind === "feed" ? o.source.url : undefined;
    return (
      <div key={o.id} className={`card${open ? " open" : dim ? " dim" : drawingId === o.id ? " drawing" : ""}`} style={{ "--c": col } as React.CSSProperties}>
        <button className="ch" aria-expanded={open} onClick={() => toggleCard(o.id)}>
          <span className="ch-top">
            <span className="dot" />
            <span className="t">
              <b>{o.title}{r.leastTravel && <span className="tag">Least travel</span>}</b>
              <span>{[o.subtitle, o.price ? formatPrice(o.price) : null, o.bedrooms ? `${o.bedrooms} bed` : null].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="tot">
              <b>{r.dailyMinutes != null ? hm(r.dailyMinutes) : timesLoading ? "…" : "–"}</b>
              per day
            </span>
          </span>
          <span className="ch-chips">
            <span className="chips">
              {r.legs.map((l, ai) => (
                <span key={l.anchor.id} className={`chip${typeof l.minutes === "number" && cmp.fastest[ai] === l.minutes ? " best" : ""}`} title={`${l.anchor.name} · ${MODE_LABEL[l.mode]}`}>
                  <Icon name={l.anchor.icon} size={12} />
                  {l.minutes === undefined ? "…" : l.minutes === null ? "–" : `${l.minutes} m`}
                  {l.overridden && <i className="ov" />}
                </span>
              ))}
            </span>
            <Icon name="chev" size={14} className="chev" />
          </span>
        </button>
        {open && (
          <div className="cb">
            {r.legs.map((l) => {
              const k = pairKey(o.id, l.anchor.id);
              return (
                <div key={l.anchor.id} className="leg">
                  <div className="leg-h">
                    <span className="badge"><Icon name={l.anchor.icon} size={13} /></span>
                    <span className="t">
                      <b>{l.anchor.name}{l.overridden && <i className="ov" title="Changed from the default" />}</b>
                      <span>{typeof l.minutes === "number" ? `Return trip · ${l.minutes * 2} min/day` : l.minutes === null ? `No ${MODE_LABEL[l.mode].toLowerCase()} route` : "Working it out…"}</span>
                    </span>
                    {l.overridden && (
                      <button className="link" onClick={() => chooseMode(o, l.anchor, l.anchor.mode)}>Reset to {MODE_LABEL[l.anchor.mode].toLowerCase()}</button>
                    )}
                  </div>
                  <div className="modes" role="group" aria-label={`How you get to ${l.anchor.name}`}>{MODES.map((m) => modeButton(r, l, m))}</div>
                  {legErrors[k] && <p className="err">{legErrors[k]}</p>}
                </div>
              );
            })}
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
      <div className="sec">Your places · default way to get there</div>
      <div className="nav">
        {anchors.map((a) => (
          <div key={a.id}>
            <button className="prow" aria-expanded={edit === a.id} onClick={() => { setEdit(edit === a.id ? null : a.id); setAdding(false); }}>
              <span className="badge lg"><Icon name={a.icon} size={15} /></span>
              <span className="t">
                <b>{a.name}</b>
                <span>{MODE_LABEL[a.mode]} by default</span>
              </span>
              <Icon name="chev" size={14} className="chev" />
            </button>
            {edit === a.id && (
              <div className="edit">
                <input className="text" value={a.name} maxLength={40} aria-label="Name" onChange={(e) => patchAnchor(a.id, { name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && setEdit(null)} />
                {hasMaps ? (
                  <PlaceSearch id={`move-${a.id}`} placeholder={a.address ? `Move: ${a.address}` : "Search for the address"} onPick={(pl) => update((p) => ({ ...p, anchors: p.anchors.map((x) => (x.id === a.id ? { ...x, id: newId(), location: pl.location, address: pl.address ?? pl.title } : x)) }))} />
                ) : (
                  a.address && <p className="hint">{a.address}</p>
                )}
                <div className="icons" role="group" aria-label="Icon">
                  {ANCHOR_ICONS.map((ic) => (
                    <button key={ic.id} aria-pressed={a.icon === ic.id} title={ic.label} aria-label={ic.label} onClick={() => patchAnchor(a.id, { icon: ic.id, name: a.name === "Pinned place" || ANCHOR_ICONS.some((x) => x.label === a.name) ? ic.label : a.name })}>
                      <Icon name={ic.id} size={14} />
                    </button>
                  ))}
                </div>
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
            <span className="t"><b>Add a place</b></span>
          </button>
        )}
        {adding && (
          <div className="edit">
            {hasMaps && <PlaceSearch id="add-place" autoFocus placeholder="Search an address or place" onPick={(pl) => addAnchorAt(pl.location, pl.title, pl.address)} />}
            <p className="hint">{hasMaps ? "Or click the map to drop a pin." : "Click the map to drop a pin."}</p>
          </div>
        )}
      </div>
    </>
  );

  const body = (
    <div className="app">
      <aside className="side">
        <div className="head">
          <h1 className="brand"><span className="logo"><Icon name="logo" size={16} /></span>Settle</h1>
          <div className="head-actions">
            <button className="btn" onClick={phaseDone ? () => { setFocus(null); setRun({ id: newId(), started: true }); setFitKey(newId()); } : startCompare} disabled={!options.length || !anchors.length || (comparing && !phaseDone)}>
              {comparing ? (phaseDone ? "Replay" : "Drawing…") : "Compare"}
            </button>
            <button className="btn" onClick={share} disabled={!options.length && !anchors.length}>{copied ? "Copied" : "Share"}</button>
          </div>
        </div>
        <div className="side-scroll">
          {plan.example && (
            <div className="banner">
              <span><b>This is an example.</b> Add your own homes and places, or start fresh.</span>
              <button onClick={() => { setPlan({ anchors: [], options: [] }); setEdit(null); setFocus(null); stopCompare(); }}>Start fresh</button>
            </div>
          )}
          {hasMaps && options.length < MAX_OPTIONS && (
            <div className="addhome">
              <PlaceSearch id="add-home" placeholder="Paste a TradeMe link or type an address" onPick={addOptionFromPlace} onLink={addOptionFromLink} />
            </div>
          )}
          <div className="subhead">
            <span>Weekday 8am · return trips per day</span>
            <span>Sort: travel</span>
          </div>
          {comparing && (
            <div className="status">
              <span>{typeof phase === "number" ? `Drawing routes · ${phase + 1} of ${drawOrder.length}` : !runKey ? "Getting routes…" : focus ? "Tap the card again to see every route" : "Tap a home to highlight its routes"}</span>
              <button onClick={stopCompare}>Hide routes</button>
            </div>
          )}
          {error && <p className="err" style={{ margin: "0 2px 10px" }}>{error}</p>}
          {options.length ? cmp.rows.map(card) : <div className="empty">Add the homes you&apos;re considering. Settle works out the trip from each one to your places.</div>}
          {!hasMaps && <p className="hint">Adding homes and places needs the Google Maps key (see README).</p>}
          <div className="hr" />
          {places}
        </div>
      </aside>
      <main className="mapwrap">
        {hasMaps ? (
          <>
            <MapView
              anchors={anchors}
              options={options}
              overrides={overrides}
              colorOf={colorOf}
              legs={legs}
              comparing={comparing}
              focus={focus}
              fitKey={fitKey}
              dropMode={adding}
              runKey={runKey}
              phase={phase}
              onPhase={onPhase}
              onOptionClick={toggleCard}
              onAnchorClick={onAnchorClick}
              onMapClick={onMapClick}
            />
            {adding && <div className="droptip">Click the map to drop a pin · or search on the left</div>}
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
