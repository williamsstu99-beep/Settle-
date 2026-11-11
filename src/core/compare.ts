import type { Anchor, Leg, Mode, Option, Time } from "./types";

export const legKey = (optionId: string, anchorId: string, mode: string) => `${optionId}|${anchorId}|${mode}`;

export const pairKey = (optionId: string, anchorId: string) => `${optionId}|${anchorId}`;

/** Per home → place mode choices that differ from the place's default. */
export type Overrides = Record<string, Mode>;

export const effectiveMode = (overrides: Overrides, optionId: string, a: Anchor): Mode => overrides[pairKey(optionId, a.id)] ?? a.mode;

export const WALKABLE_MIN = 15;

export type LegView = {
  anchor: Anchor;
  mode: Mode;
  overridden: boolean;
  /** Minutes for every mode we know about (route time preferred over the batch estimate). */
  byMode: Partial<Record<Mode, number | null>>; // null = no route in that mode
  minutes: number | null | undefined; // selected mode; undefined = not known yet
  meters?: number;
  leg?: Leg; // route line for the selected mode, if fetched
  walkable: boolean;
};

export type OptionSummary = {
  option: Option;
  legs: LegView[]; // in anchor order
  /** Return trip to every place once, in minutes. Null until every selected mode has a time. */
  dailyMinutes: number | null;
  leastTravel: boolean;
};

export type Comparison = {
  /** Sorted by least daily travel; homes without a total keep their list order at the end. */
  rows: OptionSummary[];
  /** Fastest selected-mode minutes per place across homes (null when there's nothing to compare). */
  fastest: (number | null)[];
};

const MODES: Mode[] = ["transit", "drive", "bike", "walk"];

function known(times: Map<string, Time>, legs: Map<string, Leg>, optionId: string, anchorId: string, mode: Mode): { minutes: number | null; meters?: number } | undefined {
  const l = legs.get(legKey(optionId, anchorId, mode));
  if (l) return l.status === "ok" ? { minutes: l.minutes ?? null, meters: l.meters } : { minutes: null };
  const t = times.get(legKey(optionId, anchorId, mode));
  if (t) return t.status === "ok" ? { minutes: t.minutes ?? null, meters: t.meters } : { minutes: null };
  return undefined;
}

/**
 * Pure comparison: each home against each place, in the mode chosen for that
 * pair. Times come from the route when we have it, otherwise the batch estimate.
 */
export function compare(options: Option[], anchors: Anchor[], legs: Map<string, Leg>, times: Map<string, Time> = new Map(), overrides: Overrides = {}): Comparison {
  const rows: OptionSummary[] = options.map((option) => {
    const ls = anchors.map((a): LegView => {
      const mode = effectiveMode(overrides, option.id, a);
      const byMode: LegView["byMode"] = {};
      for (const m of MODES) {
        const k = known(times, legs, option.id, a.id, m);
        if (k) byMode[m] = k.minutes;
      }
      const sel = known(times, legs, option.id, a.id, mode);
      const walk = byMode.walk;
      return {
        anchor: a,
        mode,
        overridden: mode !== a.mode,
        byMode,
        minutes: sel ? sel.minutes : undefined,
        meters: sel?.meters,
        leg: legs.get(legKey(option.id, a.id, mode)),
        walkable: mode !== "walk" && walk != null && walk <= WALKABLE_MIN,
      };
    });
    const complete = ls.length > 0 && ls.every((l) => typeof l.minutes === "number");
    return { option, legs: ls, dailyMinutes: complete ? ls.reduce((s, l) => s + 2 * (l.minutes as number), 0) : null, leastTravel: false };
  });

  const fastest = anchors.map((_, i) => {
    const mins = rows.map((r) => r.legs[i].minutes).filter((m): m is number => typeof m === "number");
    return rows.length > 1 && mins.length ? Math.min(...mins) : null;
  });

  const totals = rows.map((r) => r.dailyMinutes).filter((t): t is number => t != null);
  if (rows.length > 1 && totals.length > 1) {
    const best = Math.min(...totals);
    if (totals.filter((t) => t === best).length === 1) rows.find((r) => r.dailyMinutes === best)!.leastTravel = true;
  }

  const order = new Map(options.map((o, i) => [o.id, i]));
  rows.sort((a, b) => {
    if (a.dailyMinutes == null || b.dailyMinutes == null) {
      if (a.dailyMinutes == null && b.dailyMinutes == null) return order.get(a.option.id)! - order.get(b.option.id)!;
      return a.dailyMinutes == null ? 1 : -1;
    }
    return a.dailyMinutes - b.dailyMinutes || order.get(a.option.id)! - order.get(b.option.id)!;
  });
  return { rows, fastest };
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatDistance(meters: number, units: "metric" | "imperial" = "metric"): string {
  if (units === "imperial") {
    const mi = meters / 1609.344;
    return mi < 0.2 ? `${Math.round(meters * 3.28084)} ft` : `${mi.toFixed(1)} mi`;
  }
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function formatPrice(p: { amount: number; period: string; currency: string }, locale?: string): string {
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: p.currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(p.amount);
  return p.period === "once" ? money : `${money}/${p.period === "week" ? "wk" : "mo"}`;
}
