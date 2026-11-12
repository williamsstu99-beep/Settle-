import type { LegView, OptionSummary } from "./compare";
import type { Anchor, Mode } from "./types";

/** Rank badge for one home → place trip, compared across every home (each in its chosen mode). */
export type Badge = { text: string; strong: boolean };

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function rankBadge(rows: OptionSummary[], anchorIndex: number, optionId: string): Badge | null {
  const known = rows.map((r) => ({ id: r.option.id, leg: r.legs[anchorIndex] })).filter((x) => typeof x.leg?.minutes === "number");
  const me = known.find((x) => x.id === optionId);
  if (!me || known.length < 2) return null;
  const mine = me.leg.minutes as number;
  const rank = 1 + known.filter((x) => (x.leg.minutes as number) < mine).length;
  if (rank === 1) return { text: "Fastest", strong: true };
  const fares = known.map((x) => ({ id: x.id, fare: x.leg.leg?.fare?.amount })).filter((x): x is { id: string; fare: number } => x.fare != null);
  if (fares.length >= 2) {
    const cheapest = Math.min(...fares.map((f) => f.fare));
    const myFare = fares.find((f) => f.id === optionId)?.fare;
    if (myFare === cheapest && fares.filter((f) => f.fare === cheapest).length === 1) return { text: "Cheapest", strong: false };
  }
  return { text: rank === 2 ? `2nd fastest of ${known.length}` : `${ordinal(rank)} of ${known.length}`, strong: false };
}

const VEHICLE: Record<string, string> = {
  BUS: "Bus", INTERCITY_BUS: "Bus", TROLLEYBUS: "Bus",
  HEAVY_RAIL: "Train", COMMUTER_TRAIN: "Train", RAIL: "Train", HIGH_SPEED_TRAIN: "Train", LONG_DISTANCE_TRAIN: "Train",
  FERRY: "Ferry", TRAM: "Tram", LIGHT_RAIL: "Tram", SUBWAY: "Metro", METRO_RAIL: "Metro",
};

/** "Bus 75", "Western Line", "Ferry Devonport". */
function lineName(line?: string, vehicle?: string): string {
  const word = vehicle ? VEHICLE[vehicle] : undefined;
  if (!line) return word ?? "Transit";
  if (!word || /line|bus|train|ferry/i.test(line)) return line;
  return `${word} ${line}`;
}

export function terrain(ascent: number): string {
  return ascent < 15 ? "Flat" : ascent < 45 ? "Some hills" : "Hilly";
}

const MODE_WORD: Record<Mode, string> = { transit: "Transit", drive: "Drive", bike: "Bike", walk: "Walk" };

/** The one-line description under a place card's time, e.g. "Bus 75 · direct · every 10 min". */
export function modeDetail(l: Pick<LegView, "mode" | "leg">): string {
  const leg = l.leg;
  if (l.mode === "transit") {
    const rides = leg?.steps?.filter((s) => s.kind === "ride") ?? [];
    if (!rides.length) return MODE_WORD.transit;
    if (rides.length === 1) {
      const r = rides[0];
      return [lineName(r.line, r.vehicle), "direct", r.headwayMin ? `every ${r.headwayMin} min` : null].filter(Boolean).join(" · ");
    }
    const names = rides.map((r) => lineName(r.line, r.vehicle)).join(" → ");
    if (rides.length === 2) return `${names} · 1 change${rides[1].from ? ` at ${rides[1].from}` : ""}`;
    return `${names} · ${rides.length - 1} changes`;
  }
  if (l.mode === "drive") {
    const p = leg?.peak;
    if (!p) return MODE_WORD.drive;
    return p[0] === p[1] ? `Drive · ${p[0]} min at peak` : `Drive · ${p[0]}–${p[1]} min at peak`;
  }
  return leg?.ascent != null ? `${MODE_WORD[l.mode]} · ${terrain(leg.ascent)}` : MODE_WORD[l.mode];
}

/** Transit fare line, only when Google returned a fare. Never estimated. */
export function fareLine(l: Pick<LegView, "mode" | "leg">, locale?: string): string | null {
  const f = l.mode === "transit" ? l.leg?.fare : undefined;
  if (!f) return null;
  const fmt = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: f.currency, currencyDisplay: "narrowSymbol" }).format(n);
  return `${fmt(f.amount)} each way · ${fmt(f.amount * 2)}/day return`;
}

/** Second address part as the suburb ("Wynyard Quarter, Auckland" → "Wynyard Quarter"). */
export function suburbOf(a: Pick<Anchor, "address">): string | undefined {
  const parts = a.address?.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts?.length) return undefined;
  return parts.length > 2 ? parts[1] : parts[0];
}
