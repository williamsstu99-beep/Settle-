import { z } from "zod";
import { nextPeakDeparture } from "@/core/time";
import type { Leg } from "@/core/types";
import { RateLimiter } from "@/server/cache";
import { computeRoute, mapLimit, RoutesApiError } from "@/server/google-routes";

const MAX_PAIRS = 48; // e.g. 6 options x 8 anchors

const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const Body = z.object({
  timeZone: z.string().max(64).default("UTC"),
  pairs: z
    .array(
      z.object({
        optionId: z.string().max(80),
        anchorId: z.string().max(80),
        mode: z.enum(["drive", "transit", "bike", "walk"]),
        origin: point,
        destination: point,
      }),
    )
    .min(1)
    .max(MAX_PAIRS),
});

const limiter = new RateLimiter(30, 60_000); // 30 comparisons a minute per client

export async function POST(request: Request) {
  // Trim: keys pasted into hosting dashboards often pick up spaces, quotes or a newline, which breaks the request header.
  const apiKey = cleanKey(process.env.GOOGLE_MAPS_SERVER_KEY) || cleanKey(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  if (!apiKey) {
    return Response.json({ error: "Routing isn't set up yet. Add GOOGLE_MAPS_SERVER_KEY to the server environment." }, { status: 503 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!limiter.allow(ip)) {
    return Response.json({ error: "Too many comparisons in a short time. Try again in a minute." }, { status: 429 });
  }

  if (!/^[\x21-\x7e]+$/.test(apiKey)) {
    return Response.json(
      { error: "GOOGLE_MAPS_SERVER_KEY isn't a real key: it contains dots or other symbols, usually from copying a hidden key. In Google Cloud click Show key, copy it (it starts with AIza), paste it into your hosting settings and redeploy." },
      { status: 503 },
    );
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return Response.json({ error: "That request didn't look right." }, { status: 400 });
  }

  const departure = nextPeakDeparture(body.timeZone);
  try {
    const legs: Leg[] = await mapLimit(body.pairs, 6, async (p) => {
      const r = await computeRoute(p.origin, p.destination, p.mode, departure, apiKey);
      return r.status === "ok"
        ? { optionId: p.optionId, anchorId: p.anchorId, mode: p.mode, status: "ok", minutes: r.minutes, meters: r.meters, polyline: r.polyline }
        : { optionId: p.optionId, anchorId: p.anchorId, mode: p.mode, status: "no_route" };
    });
    return Response.json({ departure: departure.toISOString(), legs });
  } catch (e) {
    console.error("routes error", e);
    return Response.json(explainError(e), { status: 502 });
  }
}

/** Turn a Google failure into something the person setting this up can act on. Google's messages never contain the key. */
function explainError(e: unknown): { error: string; detail?: string } {
  if (!(e instanceof RoutesApiError)) {
    const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } };
    const detail = [err?.name, err?.message, err?.cause?.code ?? err?.cause?.message].filter(Boolean).join(": ");
    if (err?.name === "TimeoutError") return { error: "Google took too long to answer. Try again.", detail };
    if (/header/i.test(detail)) return { error: "The server key has a character Google can't accept. Re-paste GOOGLE_MAPS_SERVER_KEY in your hosting settings with no spaces or quotes, then redeploy.", detail };
    return { error: "Couldn't reach Google for travel times.", detail };
  }
  const m = e.message;
  if (/referer|referrer/i.test(m)) {
    return { error: "Google blocked the server's request because the server key is restricted to websites. Use a separate server key restricted to the Routes API only (no website restriction).", detail: m };
  }
  if (/not been used|disabled|not enabled|SERVICE_DISABLED/i.test(m)) {
    return { error: "The Routes API isn't enabled for this key's Google Cloud project. Enable it under APIs & Services → Library.", detail: m };
  }
  if (/not authorized|API_KEY_SERVICE_BLOCKED|restricted/i.test(m)) {
    return { error: "This key isn't allowed to use the Routes API. Add Routes API to the key's API restrictions.", detail: m };
  }
  if (/invalid|API_KEY_INVALID/i.test(m)) return { error: "Google says the server key is invalid. Check GOOGLE_MAPS_SERVER_KEY in your hosting settings.", detail: m };
  if (/billing/i.test(m)) return { error: "Google needs billing turned on for this project before it will return routes.", detail: m };
  if (e.status === 429) return { error: "Google's rate limit was hit. Try again in a minute.", detail: m };
  return { error: "Google couldn't return travel times.", detail: m };
}

/** Strip whitespace and wrapping quotes from a pasted key. */
function cleanKey(v?: string): string {
  return (v ?? "").trim().replace(/^["']|["']$/g, "").trim();
}
