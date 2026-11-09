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
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Routing isn't set up yet. Add GOOGLE_MAPS_SERVER_KEY to the server environment." }, { status: 503 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!limiter.allow(ip)) {
    return Response.json({ error: "Too many comparisons in a short time. Try again in a minute." }, { status: 429 });
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
    const status = e instanceof RoutesApiError ? e.status : 502;
    console.error("routes error", e);
    return Response.json(
      { error: status === 403 ? "Google refused the request. Check the Routes API is enabled for this key." : "Couldn't get travel times right now. Try again shortly." },
      { status: status >= 500 || status === 403 ? 502 : status },
    );
  }
}
