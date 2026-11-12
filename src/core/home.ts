import type { Option } from "./types";

/** Most photos a home can hold; they live in the browser's storage, which is small. */
export const MAX_PHOTOS = 4;

/**
 * "Mount Eden, Auckland" from a full address: drop the country and postcodes,
 * then keep the last two parts (suburb, city).
 */
export function areaOf(address?: string): string | undefined {
  if (!address) return undefined;
  const parts = address.split(",").map((s) => s.replace(/\b\d{4,5}\b/g, "").trim()).filter(Boolean);
  if (parts.length > 1 && /^(new zealand|aotearoa|australia|nz)$/i.test(parts[parts.length - 1])) parts.pop();
  if (!parts.length) return undefined;
  return parts.slice(-2).join(", ");
}

/** Only plain web links are kept, so a pasted link can never run script. */
export function safeLink(s?: string): string | undefined {
  const t = s?.trim();
  if (!t || t.length > 500) return undefined;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** Where "View listing" goes: the link you pasted, else the listing it came from. */
export function listingUrl(o: Option): string | undefined {
  return o.link ?? (o.source.kind === "trademe" ? o.source.url : o.source.kind === "feed" ? o.source.url : undefined);
}

/** Your photos first, then the listing's own. */
export function photosOf(o: Option): string[] {
  return [...(o.photos ?? []), ...(o.photo ? [o.photo] : [])];
}

/** "$650/wk · 2 bed · 1 bath" style facts, skipping what's unknown. */
export function homeFacts(o: Option, price?: string | null): string {
  return [price, o.bedrooms ? `${o.bedrooms} bed` : null, o.bathrooms ? `${o.bathrooms} bath` : null].filter(Boolean).join(" · ");
}

/** A whole number in range from a form field, or undefined. */
export function wholeNumber(s: string, max: number): number | undefined {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n) : undefined;
}
