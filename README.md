# Settle

Compare homes by how they fit your life. Add the places that matter (work, the gym, your partner's place), add the homes you're considering, and Settle shows real travel times and routes from each home to each place.

## Pages

- **`/`**: the landing page (`src/app/page.tsx`, styles in `src/app/landing.css`). The hero shows an animated illustration until you add a real screenshot at `public/landing/hero.png` (about 1200 × 1040, a listing with photos looks best); it switches automatically on the next build.
- **`/compare`**: the app. It starts empty and asks for your life anchors first, then homes. `/compare?example=1` opens the example plan without replacing your own.

The logo is `src/components/Logo.tsx` (the route "S"); the favicon is `src/app/icon.svg`.

## How it works

- **Life anchors** (`anchors` in code): where you need to get to, and how you travel there (transit, drive, bike or walk).
- **Properties** (`options` in code): "Add a property" opens a form for a name, the address (which fills in the suburb and city on the card), rent per week, beds, baths, a listing link (any site; "Open listing" on the map card and "View listing" in the panel) and photos. Pasting a TradeMe link fills in what it can. Photos are pasted, dropped or chosen, in the form or straight onto the selected map card; they're shrunk and kept in this browser only (up to 4 per property), never in share links.
- **Times for other modes:** route lines give each home's time in the chosen mode. When you select a home, the server asks Google's Route Matrix API for that home's durations in the other modes only (no route lines). These fill the mode buttons and the Walkable hint (walk ≤ 15 min).
- **Per-route modes:** each home → place route uses the place's default mode unless you pick another on that home's card. Picking one fetches just that route and swaps it on the map.
- **Map:** each home is a charcoal hub at its exact location with a card docked beside it (no connector line); the selected home's card expands, with its photo when there is one. Each place is a marker in its own colour (5-colour palette, max 5 places) with a tabbed card showing the time from the selected home, a rank badge (Fastest / 2nd fastest of 3 / Cheapest), a mode detail line and, for transit, Google's fare when returned. Every home's routes are drawn thin grey; the selected home's are drawn in place colours from the hub to each marker. Card sides (`src/core/layout.ts`) are only recalculated when homes, places, the selection or the zoom level change, never on pan, and keep their side while it's clear.
- **Mobile mode:** on by itself on screens up to 760px wide; the phone/desktop button in the header switches view and is remembered per device (`settle.view.v1`). Homes become a small white name tab by the hub; the selected one gets a faint arrow that opens its photos (camera or library), price, rooms and listing link, and the map pans so the open card is on screen. Life anchors keep their tabbed card, shrunk to the name, the time and the mode's symbol. Logic and card sizes live in `src/core/view.ts`. No extra API calls.
- **Compare:** selects each home in turn from most to least daily travel, so the best home is shown last and stays selected. Skip during, Replay after; reduced motion skips straight to the end.
- **Along the way:** for the selected home, search any category (gym, café, school, childcare…) along its route to one of your places. Results come from the Places API (New) text search with `searchAlongRouteParameters`, with the extra minutes each stop adds; any result can be added as a place.
- **Step through routes:** selecting a home draws its routes one place at a time and lights up each place's card as its route arrives (switch on the map to turn it off). Places default to driving.
- **Share:** the whole plan is encoded in the link (`#s=…`). Nothing is stored on the server.

The engine is deliberately general (anchors and options, not flats and workplaces), so other uses (buying, jobs, schools, relocation) are new screens rather than a rebuild.

## Code map

| Path | What it is |
|---|---|
| `src/core` | Pure logic: types, comparison, peak-time calculation, polyline decoding, share links, listing sources. Fully tested. |
| `src/core/view.ts` | Mobile mode: view preference (auto / mobile / desktop) and the phone card sizes the side chooser uses. |
| `src/core/sources/trademe.ts` | TradeMe link parsing and listing → option mapping. New listing sources (agency feeds, other portals) go next to it. |
| `src/server` | Google Routes client with caching, TradeMe API client, rate limiting. |
| `src/app/api/times` | `POST` durations for homes × places in the requested modes (Route Matrix API). |
| `src/app/api/peak` | `POST` best/worst drive time at peak for the selected home's drives. |
| `src/app/api/routes` | `POST` route lines for home → place pairs in a given mode (Routes API, max 48 per request). |
| `src/app/api/along` | `POST` suggestions along a route (Places API text search along route), with detour minutes. |
| `src/app/api/listing` | `GET ?url=` turns a TradeMe link into a home. |
| `src/components` | The UI: side panel (`SettleApp`), map (`MapView`), address search (`PlaceSearch`). |

## Setup

```bash
npm install
cp .env.example .env.local   # then fill it in (see below)
npm run dev                  # http://localhost:3000
```

Without keys the landing page and app still open, but the map, address search and travel times need Google.

### Google Maps Platform

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com) and turn on billing (Google includes a monthly free allowance per API).
2. Enable **Maps JavaScript API**, **Places API (New)** and **Routes API** (the Routes API covers both route lines and the route matrix). The server key also needs **Places API (New)** allowed for Along the way suggestions. Optionally enable the **Elevation API** and allow it on the server key for "Flat / Some hills / Hilly" on bike and walk routes.
3. Create two API keys:
   - **Browser key** → `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Restrict it to *Websites* (your domains, plus `localhost:3000` for development) and to the Maps JavaScript and Places APIs.
   - **Server key** → `GOOGLE_MAPS_SERVER_KEY`. Restrict it to the Routes API only.
4. Set budget alerts and quota caps in the console so a traffic spike can't surprise you.

### TradeMe (optional)

Register an application at the [TradeMe developer site](https://developer.trademe.co.nz), then set `TRADEME_CONSUMER_KEY`, `TRADEME_CONSUMER_SECRET` and `TRADEME_ENV=sandbox`. Switch to `production` once TradeMe approves your app. Without these, pasting a TradeMe link shows a friendly "type the address instead".

## Cost controls built in

On load, Settle asks for one route per home × place in its chosen mode (e.g. 3 homes × 3 places = 9 drive routes) and nothing else. Extras only load for the home you select, and not while Compare is stepping through homes (only for the home it ends on):

- **Mode button times:** one Route Matrix element per place × mode not already known (e.g. 3 places × transit, bike, walk = 9).
- **"5–9 min at peak":** two duration-only drive requests per place (`/api/peak`).
- **Terrain:** bike and walk routes make one Elevation request if that API is enabled.

Everything is cached for 3 days on the server (by rounded coordinates and mode) and in the browser, so reselecting a home or switching back to a mode is free. Traffic-aware driving and transit are billed at a higher tier than walk and bike.

Limits: 6 homes and 5 places per plan, 48 pairs per request, per-client rate limits on every endpoint. Set budget alerts and daily quota caps in the Google Cloud console as well.

The cache is in memory per server instance; move it to Redis/Vercel KV when traffic grows (same interface in `src/server/cache.ts`).

## Scripts

```bash
npm test        # unit tests (Vitest)
npm run lint
npm run build
```
