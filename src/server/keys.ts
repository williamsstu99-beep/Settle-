import { RoutesApiError } from "./google-routes";

/** Read the server key. Keys pasted into hosting dashboards often pick up spaces or quotes. */
export function serverKey(): string {
  return cleanKey(process.env.GOOGLE_MAPS_SERVER_KEY) || cleanKey(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
}

/** A response explaining a missing or malformed key, or null if the key looks usable. */
export function keyProblem(apiKey: string): Response | null {
  if (!apiKey) {
    return Response.json({ error: "Routing isn't set up yet. Add GOOGLE_MAPS_SERVER_KEY to the server environment." }, { status: 503 });
  }
  if (!/^[\x21-\x7e]+$/.test(apiKey)) {
    return Response.json(
      { error: "GOOGLE_MAPS_SERVER_KEY isn't a real key: it contains dots or other symbols, usually from copying a hidden key. In Google Cloud click Show key, copy it (it starts with AIza), paste it into your hosting settings and redeploy." },
      { status: 503 },
    );
  }
  return null;
}

export const clientIp = (request: Request) => request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

/** Turn a Google failure into something the person setting this up can act on. Google's messages never contain the key. */
export function explainError(e: unknown): { error: string; detail?: string } {
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
export function cleanKey(v?: string): string {
  return (v ?? "").trim().replace(/^["']|["']$/g, "").trim();
}
