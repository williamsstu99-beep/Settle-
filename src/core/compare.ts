import type { Anchor, Leg, Option } from "./types";

export const legKey = (optionId: string, anchorId: string, mode: string) => `${optionId}|${anchorId}|${mode}`;

export type OptionSummary = {
  option: Option;
  legs: (Leg | undefined)[]; // in anchor order
  totalMinutes: number | null; // null if any leg is missing or unroutable
  leastTravel: boolean;
};

export type Comparison = {
  rows: OptionSummary[];
  /** Fastest minutes per anchor across options (null if nobody can get there). */
  fastest: (number | null)[];
};

/**
 * Pure comparison of options against anchors, given whatever legs are known.
 * Highlights only appear when there is something to compare against.
 */
export function compare(options: Option[], anchors: Anchor[], legs: Map<string, Leg>): Comparison {
  const rows: OptionSummary[] = options.map((option) => {
    const ls = anchors.map((a) => legs.get(legKey(option.id, a.id, a.mode)));
    const complete = ls.length > 0 && ls.every((l) => l?.status === "ok" && l.minutes != null);
    return {
      option,
      legs: ls,
      totalMinutes: complete ? ls.reduce((s, l) => s + (l!.minutes ?? 0), 0) : null,
      leastTravel: false,
    };
  });

  const fastest = anchors.map((_, i) => {
    const mins = rows.map((r) => r.legs[i]).filter((l) => l?.status === "ok" && l.minutes != null).map((l) => l!.minutes!);
    return mins.length ? Math.min(...mins) : null;
  });

  const totals = rows.map((r) => r.totalMinutes).filter((t): t is number => t != null);
  if (rows.length > 1 && totals.length > 1) {
    const best = Math.min(...totals);
    if (totals.filter((t) => t === best).length === 1) {
      rows.find((r) => r.totalMinutes === best)!.leastTravel = true;
    }
  }
  return { rows, fastest: rows.length > 1 ? fastest : anchors.map(() => null) };
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
