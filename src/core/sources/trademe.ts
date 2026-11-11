import type { Option, Price } from "../types";

/**
 * TradeMe adapter. Turns a listing link into a listing ID, and a TradeMe API
 * listing response into a Settle option. The API response is parsed
 * defensively: only fields we can trust are used.
 */

export function parseTradeMeListingId(input: string): string | null {
  const s = input.trim();
  let url: URL;
  try {
    url = new URL(s.startsWith("http") ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (!/(^|\.)trademe\.co\.nz$|(^|\.)tmsandbox\.co\.nz$/.test(url.hostname)) return null;
  const path = url.pathname;
  const m =
    path.match(/\/listing\/(\d{6,})/) ||
    path.match(/auction-(\d{6,})\.htm/) ||
    path.match(/\/(\d{8,})(?:\/|$)/);
  if (m) return m[1];
  const q = url.searchParams.get("id");
  return q && /^\d{6,}$/.test(q) ? q : null;
}

type TmAttribute = { Name?: string; DisplayName?: string; Value?: string };
export type TmListing = {
  ListingId?: number;
  Title?: string;
  PriceDisplay?: string;
  Suburb?: string;
  Region?: string;
  GeographicLocation?: { Latitude?: number; Longitude?: number };
  Attributes?: TmAttribute[];
  CanonicalPath?: string;
  PictureHref?: string;
  Photos?: { Value?: { Large?: string; Medium?: string; FullSize?: string } }[];
};

function attr(l: TmListing, ...names: string[]): string | undefined {
  const want = names.map((n) => n.toLowerCase());
  return l.Attributes?.find((a) => want.includes((a.Name ?? "").toLowerCase()))?.Value;
}

export function parsePriceDisplay(s?: string): Price | undefined {
  if (!s) return undefined;
  const m = s.replace(/,/g, "").match(/\$\s?(\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  const period = /week/i.test(s) ? "week" : /month/i.test(s) ? "month" : /\b(per|\/)\b/i.test(s) ? "week" : "once";
  return { amount: Math.round(+m[1]), period, currency: "NZD" };
}

/** Only https image URLs from TradeMe's own image hosts are used as photos. */
export function safePhoto(u?: string): string | undefined {
  if (!u) return undefined;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && /(^|\.)(trademe\.co\.nz|tmcdn\.co\.nz|tmsandbox\.co\.nz)$/.test(url.hostname) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function tradeMeToOption(l: TmListing, url: string): Option | null {
  const lat = l.GeographicLocation?.Latitude, lng = l.GeographicLocation?.Longitude;
  if (l.ListingId == null || lat == null || lng == null) return null;
  const address = attr(l, "Location", "Address") ?? l.Title ?? `Listing ${l.ListingId}`;
  const beds = Number(attr(l, "Bedrooms"));
  const baths = Number(attr(l, "Bathrooms"));
  return {
    id: `tm-${l.ListingId}`,
    title: address.split(",")[0].trim(),
    subtitle: [l.Suburb, l.Region].filter(Boolean).join(", ") || undefined,
    location: { lat, lng },
    source: { kind: "trademe", listingId: String(l.ListingId), url },
    price: parsePriceDisplay(attr(l, "RentPerWeek", "rent_per_week") ? `$${attr(l, "RentPerWeek", "rent_per_week")} per week` : l.PriceDisplay),
    bedrooms: Number.isFinite(beds) && beds > 0 ? beds : undefined,
    bathrooms: Number.isFinite(baths) && baths > 0 ? baths : undefined,
    propertyType: attr(l, "PropertyType"),
    photo: safePhoto(l.Photos?.[0]?.Value?.Large ?? l.Photos?.[0]?.Value?.Medium ?? l.PictureHref),
  };
}
