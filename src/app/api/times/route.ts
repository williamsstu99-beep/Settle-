import { z } from "zod";
import { nextPeakDeparture } from "@/core/time";
import type { Mode, Time } from "@/core/types";
import { RateLimiter } from "@/server/cache";
import { computeTimes } from "@/server/google-routes";
import { clientIp, explainError, keyProblem, serverKey } from "@/server/keys";

const MODES: Mode[] = ["transit", "drive", "bike", "walk"];
const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const Body = z.object({
  timeZone: z.string().max(64).default("UTC"),
  options: z.array(z.object({ id: z.string().max(80), location: point })).min(1).max(6),
  anchors: z.array(z.object({ id: z.string().max(80), location: point })).min(1).max(8),
});

const limiter = new RateLimiter(30, 60_000);

/**
 * POST: travel times for every home × place × mode (transit, drive, bike,
 * walk), durations only. One Route Matrix call per mode, cached per pair.
 */
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
  const origins = body.options.map((o) => o.location), dests = body.anchors.map((a) => a.location);
  try {
    const grids = await Promise.all(MODES.map((m) => computeTimes(origins, dests, m, departure, apiKey)));
    const times: Time[] = MODES.flatMap((mode, mi) =>
      body.options.flatMap((o, oi) =>
        body.anchors.map((a, ai): Time => {
          const t = grids[mi][oi][ai];
          return t.status === "ok"
            ? { optionId: o.id, anchorId: a.id, mode, status: "ok", minutes: t.minutes, meters: t.meters }
            : { optionId: o.id, anchorId: a.id, mode, status: "no_route" };
        }),
      ),
    );
    return Response.json({ departure: departure.toISOString(), times });
  } catch (e) {
    console.error("times error", e);
    return Response.json(explainError(e), { status: 502 });
  }
}
