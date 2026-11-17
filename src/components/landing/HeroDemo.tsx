"use client";

import { useEffect, useRef, useState } from "react";
import { CountUp } from "@/components/CountUp";

/**
 * The landing hero: a looping animation of Settle at work, drawn in code so it
 * stays crisp at any size and costs nothing to load. Not a recording: a short
 * story in five steps (add anchors, add homes, see the routes, compare, plan a
 * day). Decorative; the copy beside it carries the message. Pauses off-screen;
 * reduced motion shows one still frame.
 */

type P = [number, number];
const W = 600, H = 520;
const at = ([x, y]: P) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

type AnchorId = "work" | "gym" | "school";
const ANCHORS: Record<AnchorId, { name: string; at: P; c: string; route: string; side: "right" | "above" | "below" }> = {
  work: { name: "Work", at: [440, 118], c: "#4F77C2", route: "#6E93D6", side: "right" },
  gym: { name: "Gym", at: [468, 336], c: "#C2763D", route: "#DB935C", side: "below" },
  school: { name: "School", at: [108, 172], c: "#3F8A63", route: "#6FB08C", side: "above" },
};
const ORDER: AnchorId[] = ["work", "gym", "school"];

type Leg = { to: AnchorId | "home"; d: string; mins: number; walk?: boolean };
type HomeId = "a" | "b";
const HOMES: Record<HomeId, { name: string; price: string; facts: string; at: P; photo: string; legs: Leg[] }> = {
  a: {
    name: "Richmond Rd", price: "$780", facts: "Grey Lynn · 2 bed", at: [232, 296], photo: "/landing/home-a.jpg",
    legs: [
      { to: "work", d: "M232 296 L250 246 L322 232 L366 160 L440 118", mins: 15 },
      { to: "gym", d: "M232 296 L290 300 L336 318 L468 336", mins: 13 },
      { to: "school", d: "M232 296 L196 262 L150 222 L108 172", mins: 9, walk: true },
    ],
  },
  b: {
    name: "Bond St", price: "$850", facts: "Kingsland · 3 bed", at: [272, 404], photo: "/landing/home-b.jpg",
    legs: [
      { to: "work", d: "M272 404 L292 312 L346 262 L386 180 L440 118", mins: 19 },
      { to: "gym", d: "M272 404 L370 388 L430 354 L468 336", mins: 8 },
      { to: "school", d: "M272 404 L216 332 L160 266 L108 172", mins: 14 },
    ],
  },
};
/** The day, from home A: walk to school, then work, then the gym, then home. */
const DAY: Leg[] = [
  { to: "school", d: "M232 296 L196 262 L150 222 L108 172", mins: 9, walk: true },
  { to: "work", d: "M108 172 L206 160 L330 150 L440 118", mins: 16 },
  { to: "gym", d: "M440 118 L456 226 L468 336", mins: 11 },
  { to: "home", d: "M468 336 L336 318 L290 300 L232 296", mins: 13 },
];

/** Steps and how long each holds (ms). */
const STEPS = [
  { ms: 1800, n: 1, text: "Add the places that matter" },
  { ms: 1700, n: 2, text: "Add the homes you’re weighing up" },
  { ms: 3300, n: 3, text: "See the real trip from each one" },
  { ms: 3300, n: 4, text: "Compare them, home by home" },
  { ms: 2600, n: 5, text: "Plan your day: put your stops in order" },
  { ms: 3600, n: 5, text: "…and see it as one trip" },
  { ms: 1900, n: 5, text: "Saved to My days" },
  { ms: 700, n: 5, text: "Saved to My days" },
];
const LAST = STEPS.length - 1;
const GAP = 620, DRAW = 600;

const Car = () => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 10.5V8l1.6-3.4c.2-.4.5-.6.9-.6h6c.4 0 .7.2.9.6L13.5 8v2.5" /><path d="M2 8.5h12v3H2z" />
  </svg>
);
const Walk = () => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="8.5" cy="2.8" r="1.3" /><path d="M7 14l1.2-4.2L6.5 8l.8-3 2.4 1.3 1.6 1.7M9.5 14l-1.3-4.2M7.3 5 5 7" />
  </svg>
);
const House = () => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.6 7.4 8 2.8l5.4 4.6V13a.8.8 0 0 1-.8.8H3.4a.8.8 0 0 1-.8-.8z" /><path d="M6.4 13.8V9.6h3.2v4.2" />
  </svg>
);

/** One route that draws itself in (a walk is dotted, revealed through a mask). */
function Route({ id, leg, color, on, delay, light }: { id: string; leg: Leg; color: string; on: boolean; delay: number; light?: boolean }) {
  const style = { transitionDelay: on ? `${delay}ms` : "0ms" } as React.CSSProperties;
  if (leg.walk) {
    return (
      <g className={`hd-route${on ? " on" : ""}`}>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
          <path d={leg.d} pathLength={1} stroke="#fff" strokeWidth="14" fill="none" className="hd-draw" style={style} />
        </mask>
        <path d={leg.d} mask={`url(#${id})`} stroke={color} strokeWidth="5" strokeDasharray="0.5 9" strokeLinecap="round" fill="none" />
      </g>
    );
  }
  return (
    <g className={`hd-route${on ? " on" : ""}${light ? " light" : ""}`} style={{ "--rc": color } as React.CSSProperties}>
      <path d={leg.d} pathLength={1} className="hd-draw hd-case" style={style} />
      <path d={leg.d} pathLength={1} className="hd-draw hd-core" style={style} />
    </g>
  );
}

export function HeroDemo() {
  const box = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [inView, setInView] = useState(true);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => { setStill(mq.matches); if (mq.matches) setStep(2); };
    set();
    mq.addEventListener("change", set);
    const el = box.current;
    const io = el ? new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.15 }) : null;
    if (el && io) io.observe(el);
    return () => { mq.removeEventListener("change", set); io?.disconnect(); };
  }, []);

  useEffect(() => {
    if (still || !inView) return;
    const t = setTimeout(() => {
      if (step === LAST) { setStep(0); setCycle((c) => c + 1); }
      else setStep(step + 1);
    }, STEPS[step].ms);
    return () => clearTimeout(t);
  }, [step, inView, still]);

  const showHomes = step >= 1;
  const sel: HomeId | null = step === 2 ? "a" : step === 3 ? "b" : step >= 4 ? "a" : null;
  const dayOn = step >= 5;
  const panelOn = step >= 4 && step <= 6;
  const reordered = step >= 4;
  const dayIdx = (id: AnchorId) => DAY.findIndex((l) => l.to === id);
  const k = `${cycle}`;
  const phase = step === 2 ? "a" : step === 3 ? "b" : step >= 5 ? "day" : "none";

  /** What an anchor's card shows right now. */
  const view = (id: AnchorId): { mins: number; walk?: boolean; delay: number; badge?: string; n?: number } | null => {
    if (step === 2 || step === 3) {
      const legs = HOMES[sel!].legs, i = legs.findIndex((l) => l.to === id);
      const best = Math.min(HOMES.a.legs[i].mins, HOMES.b.legs[i].mins);
      return { mins: legs[i].mins, walk: legs[i].walk, delay: i * GAP + DRAW * 0.6, badge: step === 3 && legs[i].mins === best ? "Fastest" : undefined };
    }
    if (dayOn) {
      const i = dayIdx(id);
      return { mins: DAY[i].mins, walk: DAY[i].walk, delay: i * (GAP + 180) + DRAW * 0.6, n: i + 1 };
    }
    return null;
  };

  return (
    <div ref={box} className={`hd${step === LAST ? " out" : ""}${still ? " still" : ""}`} role="img" aria-label="Animation: life anchors and homes on a map, real routes drawing from each home with travel times, then the anchors put in order to plan a day as one trip.">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width={W} height={H} fill="#ECEEE9" />
        <path d="M0 455 C110 430 170 500 300 488 S520 430 600 452 V520 H0 Z" fill="#D7E4EE" />
        <path d="M510 0 C520 60 560 90 600 96 V0 Z" fill="#D7E4EE" />
        <rect x="372" y="200" width="88" height="62" rx="14" fill="#DDEBD9" />
        <rect x="24" y="300" width="74" height="70" rx="12" fill="#DDEBD9" />
        <circle cx="236" cy="96" r="34" fill="#DDEBD9" />
        <g stroke="#FFFFFF" strokeWidth="9" fill="none" strokeLinecap="round">
          <path d="M-10 128 L610 150" /><path d="M64 -10 L118 530" /><path d="M-10 300 L610 262" /><path d="M326 -10 L292 530" /><path d="M476 -10 L512 530" />
        </g>
        <g stroke="#FFFFFF" strokeWidth="4" fill="none">
          <path d="M-10 214 L610 206" /><path d="M200 -10 L188 530" /><path d="M-10 62 L610 88" /><path d="M396 -10 L404 530" /><path d="M-10 384 L610 402" />
        </g>

        {/* every home's routes, thin and grey, once the homes are in */}
        <g className={`hd-greys${showHomes && step >= 2 ? " on" : ""}${dayOn ? " dim" : ""}`}>
          {(["a", "b"] as HomeId[]).flatMap((h) => HOMES[h].legs.map((l, i) => <path key={h + i} d={l.d} />))}
        </g>
        <g key={`r${k}`}>
          {(["a", "b"] as HomeId[]).map((h) =>
            HOMES[h].legs.map((l, i) => (
              <Route key={h + i} id={`hd-m-${h}${i}-${k}`} leg={l} color={ANCHORS[l.to as AnchorId].route} on={(step === 2 && h === "a") || (step === 3 && h === "b")} delay={i * GAP} />
            )),
          )}
          {DAY.map((l, i) => (
            <Route key={`d${i}`} id={`hd-m-d${i}-${k}`} leg={l} color={l.to === "home" ? "#5B6270" : ANCHORS[l.to].route} on={dayOn} delay={i * (GAP + 180)} light={l.to === "home"} />
          ))}
        </g>
      </svg>

      {/* life anchors: marker plus a tabbed card */}
      {ORDER.map((id, i) => {
        const a = ANCHORS[id], v = view(id);
        return (
          <div key={`${id}-${k}`} className={`hd-anchor side-${a.side}`} style={{ ...at(a.at), "--c": a.c, "--i": i } as React.CSSProperties}>
            <span className="hd-amark" />
            <div className={`hd-acard${v ? " timed" : ""}`}>
              <span className="hd-atab">{v?.n ? <i>{v.n}</i> : null}{a.name}</span>
              {v && (
                <span className="hd-abody" key={`${phase}-${id}-${k}`} style={{ "--arrive": `${v.delay}ms` } as React.CSSProperties}>
                  <b><CountUp value={v.mins} ms={DRAW} delay={v.delay - DRAW * 0.6} instant={still} /><small> min</small></b>
                  <span className="hd-mode">{v.walk ? <Walk /> : <Car />}</span>
                  {v.badge && <em>{v.badge}</em>}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* homes: a charcoal card when selected, a white tab otherwise */}
      {(["a", "b"] as HomeId[]).map((h, i) => {
        const o = HOMES[h], isSel = sel === h;
        return (
          <div key={h} className={`hd-home${showHomes ? " in" : ""}${isSel ? " sel" : ""} h-${h}`} style={{ ...at(o.at), "--i": i } as React.CSSProperties}>
            <span className="hd-hub"><House /></span>
            {isSel && step >= 4 ? null : isSel ? (
              <div className="hd-hcard" key={`${h}-${step >= 4 ? "day" : step}-${k}`}>
                {/* Decorative photo; plain img keeps this component framework-free. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={o.photo} alt="" />
                <span className="hd-hrow"><b>{o.name}</b></span>
                <span className="hd-hsub"><b>{o.price}</b>/wk · {o.facts}</span>
              </div>
            ) : (
              <span className="hd-htab">{o.name} · {o.price}</span>
            )}
          </div>
        );
      })}

      {/* the day panel: anchors fall into order, then it's saved */}
      <div className={`hd-panel${panelOn ? " on" : ""}`}>
        <span className="hd-ptitle">{step >= 6 ? "My days" : "Anchors"}</span>
        <ul>
          {ORDER.map((id, i) => {
            const pos = reordered ? dayIdx(id) : i;
            return (
              <li key={id} style={{ "--c": ANCHORS[id].c, transform: `translateY(${pos * 100}%)` } as React.CSSProperties} className={reordered ? "moved" : undefined}>
                <span className="bar" /><span className="num">{pos + 1}</span>{ANCHORS[id].name}
              </li>
            );
          })}
        </ul>
        <span className={`hd-save${step >= 6 ? " done" : ""}`}>{step >= 6 ? "Saved · School run" : "Save to my days"}</span>
      </div>

      {/* step caption */}
      <div className="hd-cap" key={`c${step}-${k}`}>
        <span className="hd-capn">{STEPS[step].n}</span>
        {STEPS[step].text}
      </div>
    </div>
  );
}
