# Settle

@AGENTS.md

Settle helps people pick a home by how it fits their life. Users add **life anchors** (work, gym, a partner's place) and **properties** (an address or a TradeMe link); Settle shows real peak-hour travel times and routes from each property to each anchor on one map. Free, no accounts. NZ-first (Auckland), but nothing is hard-coded to NZ. The engine is deliberately general (anchors × options), so buying, jobs or relocation are new screens, not a rebuild.

## Stack
- Next.js 16 (App Router) + React 19 + TypeScript. **Next 16 differs from older versions; read `node_modules/next/dist/docs/` before using an API.**
- Google Maps Platform: Maps JS via `@vis.gl/react-google-maps`, Routes API (`computeRoutes`, `computeRouteMatrix`), Places API (New) for autocomplete and "Along the way", optional Elevation API.
- zod for API input, Vitest for tests, plain CSS (`src/app/globals.css` for the app, `src/app/landing.css` for the landing). Fonts: Inter (UI), Manrope (wordmark) via `next/font`.

## Layout
- `src/app/page.tsx`: landing page. `src/app/compare/`: the app. `src/app/api/{routes,times,peak,along,listing}`: server routes.
- `src/core/`: pure, tested logic (types, compare, plan + share links, layout, polyline, describe, home helpers, TradeMe parsing). No React, no fetch.
- `src/server/`: Google and TradeMe clients, `TtlCache`, `RateLimiter`, key checks and plain-English error messages.
- `src/components/`: `SettleApp` (panel + state), `MapView` (markers, card layout), `RouteLayer` (imperative polylines + animation), `HomeForm`, `PhotoStrip`, `Logo`.

## Deploy (Vercel)
- GitHub `williamsstu99-beep/Settle-` → Vercel. `main` deploys to production; every PR gets a preview URL. Hobby plan for now (non-commercial; move to Pro before charging).
- Env vars in Vercel: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (browser key, must be a plain/Config variable, not Secret, as it's inlined at build), `GOOGLE_MAPS_SERVER_KEY` (server only: Routes, Places API (New), Elevation), optional `TRADEME_CONSUMER_KEY`/`TRADEME_CONSUMER_SECRET`/`TRADEME_ENV`. See `.env.example`.
- Changing a `NEXT_PUBLIC_*` value needs a redeploy. Pasted keys that contain `•` (masked copies) are rejected by `keyProblem` with a clear message.

## Key decisions
- **Real routes, not estimates:** Routes API for lines, Route Matrix only for the other-mode buttons. Drive is `TRAFFIC_AWARE` at the next weekday 08:00 in the user's time zone.
- **Cost first** (Google bills per request; the app is free):
  - On load: one route per property × anchor in its chosen mode, nothing else.
  - Other-mode times and the "5–9 min at peak" range (`/api/peak`) load only for the selected home, never while Compare is stepping.
  - 3-day server cache plus browser cache, so reselecting is free. Per-IP rate limits on every API route.
  - Don't add calls per render, per pan or per unselected home.
- **No server state, no accounts:** plans persist in `localStorage` (`settle.plan.v1` etc.). Share links encode the plan in `#s=` (no photos). User photos are downscaled data URLs, max 4 per property, device-only.
- **Starts empty:** anchors first (step 1), then properties (step 2). The example plan only loads at `/compare?example=1` and is never saved.
- **Drive is the default mode** for new anchors (Auckland drives). Per-leg overrides are keyed `${optionId}|${anchorId}`.
- **Map:**
  - No cloud Map ID; markers are `OverlayView` via `HtmlMarker`, not AdvancedMarkers.
  - Card sides come from `chooseSides` (layout.ts), recalculated only on data, selection or zoom changes, never on pan.
  - The zoom fits all homes, anchors and routes.
- **Compare** steps from most to least travel and ends on the best home. "Step through routes" reveals one anchor at a time (toggle, default on). Reduced motion skips animation.
- **Facebook Marketplace/groups:** no API and scraping is off the table. Parked idea: "paste a listing" with AI extraction.
- **Budget:** Google spend is capped at **US$50/month** beyond the free allowances. Weigh every new API call against it.
- Next up, open decisions and parked ideas live in **`BACKLOG.md`**.

## Design rules (from the owner's feedback)
- Light, calm, professional. No neon, no dark-heavy UI, no gradient washes, no emoji.
- Palette tokens live in `ANCHOR_PALETTE` (sky, peach, rose, sage, lavender); ink `#2C3038`.
- Anchors have no icons in the panel, just a colour bar and name. Map place tabs are bold, solid colour.
- No weekly or per-day totals. Times are one-way, per anchor.
- Logo: the route "S" (blue top, peach bottom, ring start, ink home dot); see `Logo.tsx` and `app/icon.svg`.
- Talk through big design changes (offer options) before building them.

## Conventions
- Run `npm test`, `npm run lint` and `npm run build` before committing; all must pass. Put new logic in `src/core` with tests.
- Never call real Google from tests. UI checks use a Playwright rig with stubbed Google Maps and mocked `/api/*`, kept out of the repo.
- Copy is plain English and NZ spelling, with user-facing words: "life anchors", "properties", "homes". Google errors go through `explainError`.
- **Update `BACKLOG.md` in every PR:** move items to Done, add anything new that's parked or decided.
- One branch and PR per change set (`claude/<topic>`). Don't force-push; start a new branch. Use the attribution trailers in commits.
- Never put API keys in code, commits or chat. Keep the README's cost section and code map in sync with changes.
