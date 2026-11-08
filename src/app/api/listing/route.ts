import { parseTradeMeListingId } from "@/core/sources/trademe";
import { RateLimiter } from "@/server/cache";
import { fetchTradeMeListing } from "@/server/trademe";

const limiter = new RateLimiter(40, 60_000);

/** GET /api/listing?url=<listing link>  →  { option } */
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url") ?? "";
  const id = parseTradeMeListingId(url);
  if (!id) return Response.json({ error: "That doesn't look like a TradeMe listing link." }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!limiter.allow(ip)) return Response.json({ error: "Slow down a little and try again in a minute." }, { status: 429 });

  try {
    const option = await fetchTradeMeListing(id, url);
    if (option === "not_configured") {
      return Response.json({ error: "Adding by TradeMe link isn't switched on yet. Type the address instead." }, { status: 501 });
    }
    if (!option) return Response.json({ error: "We couldn't find that listing, or it has no map location. Type the address instead." }, { status: 404 });
    return Response.json({ option });
  } catch (e) {
    console.error("trademe error", e);
    return Response.json({ error: "TradeMe didn't answer. Type the address instead, or try again shortly." }, { status: 502 });
  }
}
