import { tradeMeToOption, type TmListing } from "@/core/sources/trademe";
import type { Option } from "@/core/types";
import { TtlCache } from "./cache";

/**
 * TradeMe API client (application-level OAuth 1.0, PLAINTEXT signature).
 * Set TRADEME_ENV=sandbox while building, production once approved.
 */

const cache = new TtlCache<Option | null>(6 * 3600 * 1000, 2000);

export function tradeMeConfig() {
  const key = process.env.TRADEME_CONSUMER_KEY, secret = process.env.TRADEME_CONSUMER_SECRET;
  if (!key || !secret) return null;
  const sandbox = (process.env.TRADEME_ENV ?? "sandbox") !== "production";
  return { key, secret, base: sandbox ? "https://api.tmsandbox.co.nz" : "https://api.trademe.co.nz" };
}

export function oauthHeader(key: string, secret: string): string {
  return `OAuth oauth_consumer_key="${encodeURIComponent(key)}", oauth_signature_method="PLAINTEXT", oauth_signature="${encodeURIComponent(secret)}%26"`;
}

export async function fetchTradeMeListing(listingId: string, url: string): Promise<Option | null | "not_configured"> {
  const cfg = tradeMeConfig();
  if (!cfg) return "not_configured";
  const hit = cache.get(listingId);
  if (hit !== undefined) return hit;

  const res = await fetch(`${cfg.base}/v1/Listings/${encodeURIComponent(listingId)}.json`, {
    headers: { Authorization: oauthHeader(cfg.key, cfg.secret), Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 404) {
    cache.set(listingId, null);
    return null;
  }
  if (!res.ok) throw new Error(`TradeMe API returned ${res.status}`);
  const option = tradeMeToOption((await res.json()) as TmListing, url);
  cache.set(listingId, option);
  return option;
}
