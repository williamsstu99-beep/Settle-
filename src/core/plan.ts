import type { Anchor, Mode, Option } from "./types";

/** What a user is working on: their places and the homes they're weighing up. */
export type Plan = {
  anchors: Anchor[];
  options: Option[];
  /** Mode choices for individual home → place routes, keyed `${optionId}|${anchorId}`. */
  overrides?: Record<string, Mode>;
  example?: boolean;
};

export const MAX_OPTIONS = 6;
export const MAX_ANCHORS = 8;

/** Muted, distinguishable colours, one per option in order. */
export const OPTION_COLORS = ["#4E8B6A", "#4F6FA3", "#C27D55", "#7E6AA6", "#3E8790", "#B06A80"];

export const newId = () => Math.random().toString(36).slice(2, 10);

export const EXAMPLE_PLAN: Plan = {
  example: true,
  anchors: [
    { id: "ex-work", name: "Work", icon: "work", location: { lat: -36.841, lng: 174.756 }, address: "Wynyard Quarter, Auckland", mode: "transit" },
    { id: "ex-gym", name: "Gym", icon: "gym", location: { lat: -36.869, lng: 174.778 }, address: "Newmarket, Auckland", mode: "bike" },
    { id: "ex-partner", name: "Girlfriend’s place", icon: "partner", location: { lat: -36.887, lng: 174.761 }, address: "Mount Eden, Auckland", mode: "drive" },
  ],
  options: [
    { id: "ex-1", title: "Beach Road", subtitle: "Auckland CBD", location: { lat: -36.849, lng: 174.77 }, source: { kind: "manual" }, price: { amount: 560, period: "week", currency: "NZD" }, bedrooms: 1, propertyType: "Apartment" },
    { id: "ex-2", title: "Valley Road", subtitle: "Mount Eden", location: { lat: -36.877, lng: 174.752 }, source: { kind: "manual" }, price: { amount: 890, period: "week", currency: "NZD" }, bedrooms: 3, propertyType: "House" },
    { id: "ex-3", title: "Dominion Road", subtitle: "Mount Roskill", location: { lat: -36.907, lng: 174.737 }, source: { kind: "manual" }, price: { amount: 580, period: "week", currency: "NZD" }, bedrooms: 2, propertyType: "Unit" },
  ],
};

/* ---------- share links: the whole plan in the URL hash, nothing stored server-side ---------- */

const toB64Url = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function encodePlan(plan: Plan): string {
  const slim = {
    a: plan.anchors.map((a) => [a.name, a.icon, r5(a.location.lat), r5(a.location.lng), a.mode, a.address ?? ""]),
    m: Object.entries(plan.overrides ?? {}).flatMap(([k, mode]) => {
      const [oid, aid] = k.split("|");
      const oi = plan.options.findIndex((o) => o.id === oid), ai = plan.anchors.findIndex((a) => a.id === aid);
      return oi >= 0 && ai >= 0 ? [[oi, ai, mode]] : [];
    }),
    o: plan.options.map((o) => [o.title, o.subtitle ?? "", r5(o.location.lat), r5(o.location.lng), o.price ? [o.price.amount, o.price.period, o.price.currency] : 0, o.bedrooms ?? 0, o.propertyType ?? "", o.source.kind === "trademe" ? o.source.listingId : ""]),
  };
  return toB64Url(JSON.stringify(slim));
}

const ICONS = new Set(["work", "gym", "partner", "family", "study", "cafe", "other"]);
const MODES = new Set(["drive", "transit", "bike", "walk"]);
const num = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const str = (v: unknown, max = 120) => (typeof v === "string" ? v.slice(0, max) : "");

/** Decode a share link. Anything malformed is dropped rather than trusted. */
export function decodePlan(s: string): Plan | null {
  try {
    const raw = JSON.parse(fromB64Url(s)) as { a?: unknown[][]; o?: unknown[][]; m?: unknown[][] };
    const anchors = (raw.a ?? []).slice(0, MAX_ANCHORS).flatMap((a): Plan["anchors"] => {
      if (!Array.isArray(a) || !num(a[2], -90, 90) || !num(a[3], -180, 180)) return [];
      return [{ id: newId(), name: str(a[0], 40) || "Place", icon: (ICONS.has(a[1] as string) ? a[1] : "other") as Plan["anchors"][number]["icon"], location: { lat: a[2] as number, lng: a[3] as number }, mode: (MODES.has(a[4] as string) ? a[4] : "transit") as Plan["anchors"][number]["mode"], address: str(a[5]) || undefined }];
    });
    const options = (raw.o ?? []).slice(0, MAX_OPTIONS).flatMap((o): Plan["options"] => {
      if (!Array.isArray(o) || !num(o[2], -90, 90) || !num(o[3], -180, 180)) return [];
      const p = Array.isArray(o[4]) && num(o[4][0], 0, 1e9) ? { amount: o[4][0] as number, period: (["week", "month", "once"].includes(o[4][1] as string) ? o[4][1] : "week") as "week", currency: /^[A-Z]{3}$/.test(String(o[4][2])) ? String(o[4][2]) : "NZD" } : undefined;
      const tm = str(o[7], 20);
      return [{ id: newId(), title: str(o[0], 80) || "Home", subtitle: str(o[1], 80) || undefined, location: { lat: o[2] as number, lng: o[3] as number }, price: p, bedrooms: num(o[5], 1, 50) ? (o[5] as number) : undefined, propertyType: str(o[6], 30) || undefined, source: /^\d{6,}$/.test(tm) ? { kind: "trademe", listingId: tm, url: `https://www.trademe.co.nz/a/listing/${tm}` } : { kind: "manual" } }];
    });
    const overrides: Record<string, Mode> = {};
    for (const m of raw.m ?? []) {
      if (!Array.isArray(m) || !MODES.has(m[2] as string)) continue;
      const o = options[m[0] as number], a = anchors[m[1] as number];
      if (o && a && a.mode !== m[2]) overrides[`${o.id}|${a.id}`] = m[2] as Mode;
    }
    return { anchors, options, overrides };
  } catch {
    return null;
  }
}
