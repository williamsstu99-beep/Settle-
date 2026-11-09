"use client";

import { APIProvider } from "@vis.gl/react-google-maps";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compare, formatDistance, formatMinutes, formatPrice, legKey } from "@/core/compare";
import { decodePlan, encodePlan, EXAMPLE_PLAN, MAX_ANCHORS, MAX_OPTIONS, newId, OPTION_COLORS, type Plan } from "@/core/plan";
import type { Anchor, LatLng, Leg, Mode, Option } from "@/core/types";
import { ANCHOR_ICONS, Icon, MODE_LABEL } from "./icons";
import { PlaceSearch, type PickedPlace } from "./PlaceSearch";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const PLAN_KEY = "settle.plan.v1";
const LEGS_KEY = "settle.legs.v1";
const MODES: Mode[] = ["transit", "drive", "bike", "walk"];

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

function loadLegs(): Map<string, Leg> {
  try {
    const raw = localStorage.getItem(LEGS_KEY);
    if (raw) return new Map(Object.entries(JSON.parse(raw) as Record<string, Leg>));
  } catch {}
  return new Map();
}

export default function SettleApp() {
  const [plan, setPlan] = useState<Plan>(loadPlan);
  const [legs, setLegs] = useState<Map<string, Leg>>(loadLegs);
  const [comparing, setComparing] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fitKey, setFitKey] = useState("init");

  const { anchors, options } = plan;
  const colorOf = useCallback((id: string) => OPTION_COLORS[Math.max(0, options.findIndex((o) => o.id === id)) % OPTION_COLORS.length], [options]);

  // persist plan locally; drop a share hash once the plan has been loaded from it
  useEffect(() => {
    try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); } catch {}
    if (location.hash.startsWith("#s=")) history.replaceState(null, "", location.pathname + location.search);
  }, [plan]);
  useEffect(() => {
    try { localStorage.setItem(LEGS_KEY, JSON.stringify(Object.fromEntries([...legs].slice(-400)))); } catch {}
  }, [legs]);

  const update = (fn: (p: Plan) => Plan) => setPlan((p) => ({ ...fn(p), example: false }));

  /* ---------- routing ---------- */
  const missing = useMemo(
    () => (comparing ? options.flatMap((o) => anchors.filter((a) => !legs.has(legKey(o.id, a.id, a.mode))).map((a) => ({ o, a }))) : []),
    [comparing, options, anchors, legs],
  );
  const inflight = useRef(false);
  useEffect(() => {
    if (!missing.length || inflight.current) return;
    inflight.current = true;
    setLoading(true);
    setError(null);
    fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        pairs: missing.map(({ o, a }) => ({ optionId: o.id, anchorId: a.id, mode: a.mode, origin: o.location, destination: a.location })),
      }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error([j.error ?? "Couldn't get travel times right now.", j.detail ? `Google said: ${j.detail}` : ""].filter(Boolean).join(" "));
        setLegs((prev) => {
          const next = new Map(prev);
          for (const l of j.legs as Leg[]) next.set(legKey(l.optionId, l.anchorId, l.mode), l);
          return next;
        });
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        inflight.current = false;
        setLoading(false);
      });
  }, [missing]);

  const cmp = useMemo(() => compare(options, anchors, legs), [options, anchors, legs]);

  /* ---------- actions ---------- */
  const addAnchorAt = (location: LatLng, name: string, address?: string) => {
    if (anchors.length >= MAX_ANCHORS) return;
    const a: Anchor = { id: newId(), name: name.slice(0, 40), icon: "other", location, address, mode: "transit" };
    update((p) => ({ ...p, anchors: [...p.anchors, a] }));
    setAdding(false);
    setEdit(a.id);
  };
  const patchAnchor = (id: string, patch: Partial<Anchor>) =>
    update((p) => ({ ...p, anchors: p.anchors.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const addOption = (o: Option) => {
    if (options.length >= MAX_OPTIONS) return setError(`You can compare up to ${MAX_OPTIONS} homes at once.`);
    if (options.some((x) => x.id === o.id)) return setError("That home is already on your list.");
    setError(null);
    update((p) => ({ ...p, options: [...p.options, o] }));
    setFitKey(newId());
  };
  const addOptionFromPlace = (pl: PickedPlace) => addOption({ id: newId(), title: pl.title, subtitle: pl.subtitle, location: pl.location, source: { kind: "manual" } });
  const addOptionFromLink = async (url: string) => {
    const r = await fetch(`/api/listing?url=${encodeURIComponent(url)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "Couldn't add that listing.");
    addOption(j.option as Option);
  };
  const startCompare = () => {
    setComparing(true);
    setFocus(options.length === 1 ? options[0].id : null);
    setEdit(null);
    setAdding(false);
    setFitKey(newId());
  };
  const toggleFocus = (id: string) => {
    setFocus((f) => (f === id ? null : id));
    setFitKey(newId());
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
  const onOptionClick = (id: string) => (comparing ? toggleFocus(id) : undefined);
  const onAnchorClick = (id: string) => {
    if (comparing) setComparing(false);
    setEdit((e) => (e === id ? null : id));
  };

  const hasMaps = !!API_KEY;
  const units = typeof navigator !== "undefined" && navigator.language === "en-US" ? "imperial" : "metric";

  /* ---------- views ---------- */
  const places = (
    <>
      <div className="sec">Your places</div>
      <div className="nav">
        {anchors.map((a) => (
          <div key={a.id}>
            <button className="nrow" aria-expanded={edit === a.id} onClick={() => { setEdit(edit === a.id ? null : a.id); setAdding(false); }}>
              <span className="badge"><Icon name={a.icon} size={14} /></span>
              <span className="t">{a.name}</span>
              <span className="m"><Icon name={a.mode} size={14} />{MODE_LABEL[a.mode]}</span>
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
                <div className="seg" role="group" aria-label="How you get there">
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
          <button className="nrow add" onClick={() => { setAdding(!adding); setEdit(null); }} aria-expanded={adding}>
            <span className="badge"><Icon name="plus" size={14} /></span>
            <span className="t">Add a place</span>
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

  const planView = (
    <>
      {plan.example && (
        <div className="banner">
          <span><b>This is an example.</b> Add your own places and homes, or start with a clean slate.</span>
          <button onClick={() => { setPlan({ anchors: [], options: [] }); setEdit(null); }}>Start fresh</button>
        </div>
      )}
      {places}
      <div className="hr" />
      <div className="sec">Homes to compare{options.length ? ` · ${options.length} of ${MAX_OPTIONS}` : ""}</div>
      {hasMaps ? (
        <PlaceSearch id="add-home" placeholder="Paste a TradeMe link or type an address" onPick={addOptionFromPlace} onLink={addOptionFromLink} />
      ) : (
        <p className="hint">Adding homes needs the Google Maps key (see README).</p>
      )}
      {options.length ? (
        <div className="nav" style={{ marginTop: 8 }}>
          {options.map((o) => (
            <div key={o.id} className="prow" style={{ "--c": colorOf(o.id) } as React.CSSProperties}>
              <span className="dot" />
              <span className="t">
                <b>{o.title}</b>
                <span>{[o.subtitle, o.bedrooms ? `${o.bedrooms} bed` : null, o.propertyType].filter(Boolean).join(" · ")}</span>
              </span>
              {o.price && <span className="r">{formatPrice(o.price)}</span>}
              <button className="x" aria-label={`Remove ${o.title}`} onClick={() => update((p) => ({ ...p, options: p.options.filter((x) => x.id !== o.id) }))}>
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">Add the homes you&apos;re considering. Settle works out the trip from each one to your places.</div>
      )}
      {error && <p className="err">{error}</p>}
      <button className="cta" disabled={!options.length || !anchors.length} onClick={startCompare}>
        Compare travel times <Icon name="arrow" size={15} />
      </button>
      {!anchors.length && options.length > 0 && <p className="hint" style={{ marginTop: 8, textAlign: "center" }}>Add at least one place first.</p>}
    </>
  );

  const compareView = (
    <>
      <button className="back" onClick={() => { setComparing(false); setFocus(null); }}>
        <Icon name="back" size={14} />Back to your list
      </button>
      <div className="sec">Travel times · weekday 8am</div>
      {cmp.rows.map((r) => {
        const open = focus === r.option.id;
        const col = colorOf(r.option.id);
        return (
          <div key={r.option.id} className={`card${open ? " open" : focus ? " dim" : ""}`} style={{ "--c": col } as React.CSSProperties}>
            <button className="ch" aria-expanded={open} onClick={() => toggleFocus(r.option.id)}>
              <span className="dot" />
              <span className="t">
                <b>{r.option.title}</b>
                <span>{[r.option.subtitle, r.option.price ? formatPrice(r.option.price) : null, r.option.bedrooms ? `${r.option.bedrooms} bed` : null].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="tot">
                <b>{r.totalMinutes != null ? formatMinutes(r.totalMinutes) : "–"}</b>
                {r.leastTravel ? <span className="tag">Least travel</span> : "total"}
              </span>
              <Icon name="chev" size={14} className="chev" />
            </button>
            {open && (
              <>
                <div className="tl">
                  <div className="step start">
                    <span className="when">Home</span>
                    <span className="rail"><span className="pt" /></span>
                    <div className="body"><small>Starting point</small><b>{r.option.title}{r.option.subtitle ? `, ${r.option.subtitle}` : ""}</b></div>
                  </div>
                  {anchors.map((a, i) => {
                    const l = r.legs[i];
                    const best = l?.status === "ok" && cmp.fastest[i] != null && l.minutes === cmp.fastest[i];
                    return (
                      <div key={a.id} className="step">
                        <span className="when"><Icon name="clock" size={12} />{l?.status === "ok" ? `${l.minutes}m` : "–"}</span>
                        <span className="rail"><span className="pt" /></span>
                        <div className="body">
                          <small>{MODE_LABEL[a.mode]}</small>
                          <b><Icon name={a.icon} size={14} />{a.name}</b>
                          <div className="meta">
                            {!l ? <span>Working it out…</span> : l.status === "no_route" ? <span className="none">No {MODE_LABEL[a.mode].toLowerCase()} route found</span> : (
                              <>
                                <span className={best ? "best" : ""}>{formatMinutes(l.minutes!)}{best ? " · fastest" : ""}</span>
                                {l.meters ? <span>{formatDistance(l.meters, units)}</span> : null}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="sum">
                  <div>Rent<b>{r.option.price ? formatPrice(r.option.price) : "–"}</b></div>
                  <div>Total travel<b>{r.totalMinutes != null ? formatMinutes(r.totalMinutes) : "–"}</b></div>
                  <div>Bedrooms<b>{r.option.bedrooms ?? "–"}{r.option.bathrooms ? ` · ${r.option.bathrooms} bath` : ""}</b></div>
                </div>
              </>
            )}
          </div>
        );
      })}
      {loading && <p className="loading">Getting real travel times…</p>}
      {error && <p className="err">{error}</p>}
      <div className="hr" />
      {places}
    </>
  );

  const body = (
    <div className="app">
      <aside className="side">
        <div className="head">
          <h1 className="brand"><span className="logo"><Icon name="logo" size={15} /></span>Settle</h1>
          <button className="ghost" onClick={share} disabled={!options.length && !anchors.length}>
            <Icon name="share" size={13} />{copied ? "Link copied" : "Share"}
          </button>
        </div>
        <div className="side-scroll">{comparing ? compareView : planView}</div>
      </aside>
      <main className="mapwrap">
        {hasMaps ? (
          <>
            <MapView
              anchors={anchors}
              options={options}
              colorOf={colorOf}
              legs={legs}
              comparing={comparing}
              focus={focus}
              fitKey={fitKey}
              dropMode={adding}
              onOptionClick={onOptionClick}
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
