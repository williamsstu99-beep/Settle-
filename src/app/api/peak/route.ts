import { z } from "zod";
import { nextPeakDeparture } from "@/core/time";
import { RateLimiter } from "@/server/cache";
import { mapLimit, peakRange } from "@/server/google-routes";
import { clientIp, explainError, keyProblem, serverKey } from "@/server/keys";

const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const Body = z.object({
  timeZone: z.string().max(64).default("UTC"),
  pairs: z.array(z.object({ optionId: z.string().max(80), anchorId: z.string().max(80), origin: point, destination: point })).min(1).max(8),
});

const limiter = new RateLimiter(30, 60_000);

/**
 * POST: best/worst drive time at peak ("5–9 min at peak") for the selected
 * home's drives only. Two requests per pair, so it's asked for on demand.
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
  try {
    const peaks = await mapLimit(body.pairs, 4, async (p) => ({ optionId: p.optionId, anchorId: p.anchorId, peak: (await peakRange(p.origin, p.destination, departure, apiKey)) ?? null }));
    return Response.json({ peaks });
  } catch (e) {
    console.error("peak error", e);
    return Response.json(explainError(e), { status: 502 });
  }
}
