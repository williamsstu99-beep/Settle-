import { z } from "zod";
import { RateLimiter } from "@/server/cache";
import { clientIp, explainError, keyProblem, serverKey } from "@/server/keys";
import { searchAlong } from "@/server/places";

const Body = z.object({
  query: z.string().trim().min(2).max(60),
  polyline: z.string().min(4).max(30000),
  origin: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  mode: z.enum(["drive", "transit", "bike", "walk"]),
  baseMinutes: z.number().min(0).max(1000),
});

const limiter = new RateLimiter(20, 60_000);
const TRAVEL = { drive: "DRIVE", transit: "DRIVE", bike: "BICYCLE", walk: "WALK" } as const;

/** POST: places matching a search (gym, café, school…) along a home → place route, with detour minutes. */
export async function POST(request: Request) {
  const apiKey = serverKey();
  const problem = keyProblem(apiKey);
  if (problem) return problem;
  if (!limiter.allow(clientIp(request))) return Response.json({ error: "Too many searches in a short time. Try again in a minute." }, { status: 429 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return Response.json({ error: "Type at least two letters to search." }, { status: 400 });
  }
  try {
    const results = await searchAlong(body.query, body.polyline, body.origin, TRAVEL[body.mode], body.baseMinutes, apiKey);
    return Response.json({ results });
  } catch (e) {
    console.error("along error", e);
    const out = explainError(e);
    if (/places|SERVICE_DISABLED|not been used/i.test(out.detail ?? "")) {
      return Response.json({ error: "Suggestions need the Places API (New) enabled and allowed on the server key.", detail: out.detail }, { status: 502 });
    }
    return Response.json(out, { status: 502 });
  }
}
