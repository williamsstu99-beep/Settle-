import { z } from "zod";
import { nextPeakDeparture } from "@/core/time";
import type { Leg } from "@/core/types";
import { RateLimiter } from "@/server/cache";
import { computeRoute, mapLimit } from "@/server/google-routes";
import { clientIp, explainError, keyProblem, serverKey } from "@/server/keys";

const MAX_PAIRS = 48; // e.g. 6 homes x 8 places

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

const limiter = new RateLimiter(60, 60_000); // route lines: initial draw plus individual mode switches

/** POST: route lines (and exact times) for home → place pairs, one mode each. */
export async function POST(request: Request) {
  const apiKey = serverKey();
  const problem = keyProblem(apiKey);
  if (problem) return problem;
  if (!limiter.allow(clientIp(request))) {
    return Response.json({ error: "Too many requests in a short time. Try again in a minute." }, { status: 429 });
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
        ? { optionId: p.optionId, anchorId: p.anchorId, mode: p.mode, status: "ok", minutes: r.minutes, meters: r.meters, polyline: r.polyline, steps: r.steps, fare: r.fare, peak: r.peak, ascent: r.ascent }
        : { optionId: p.optionId, anchorId: p.anchorId, mode: p.mode, status: "no_route" };
    });
    return Response.json({ departure: departure.toISOString(), legs });
  } catch (e) {
    console.error("routes error", e);
    return Response.json(explainError(e), { status: 502 });
  }
}
