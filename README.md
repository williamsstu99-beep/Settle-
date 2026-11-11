# Settle

Compare homes by how they fit your life. Add the places that matter (work, the gym, your partner's place), add the homes you're considering, and Settle shows real travel times and routes from each home to each place.

## How it works

- **Places** (`anchors` in code): where you need to get to, and how you travel there (transit, drive, bike or walk).
- **Homes** (`options` in code): added by typing an address, or by pasting a TradeMe link.
- **Times for every mode:** as soon as homes and places are set, the server asks Google's Route Matrix API for durations from every home to every place by transit, drive, bike and walk (no route lines). These fill the mode buttons, the daily totals (return trip to each place) and the Walkable hint (walk ≤ 15 min).
- **Per-route modes:** each home → place route uses the place's default mode unless you pick another on that home's card. Picking one fetches just that route and swaps it on the map.
- **Map:** every home is a card on a stem above its location dot (compact, or expanded with photo for the selected home); every place is a card in its own permanent colour showing the trip time from the selected home. Only the selected home's routes are drawn, in each place's colour, leaving the home's dot and arriving at each place's dot. Cards are placed so they don't overlap (`src/core/layout.ts`).
- **Compare:** fetches every home's routes, then selects each home in turn from most to least daily travel, so the best home is shown last and stays selected. Skip jumps to the end; Replay runs it again. "Show all routes" draws the other homes' routes faintly underneath.
- **Share:** the whole plan is encoded in the link (`#s=…`). Nothing is stored on the server.

The engine is deliberately general (anchors and options, not flats and workplaces), so other uses (buying, jobs, schools, relocation) are new screens rather than a rebuild.

## Code map

| Path | What it is |
|---|---|
| `src/core` | Pure logic: types, comparison, peak-time calculation, polyline decoding, share links, listing sources. Fully tested. |
| `src/core/sources/trademe.ts` | TradeMe link parsing and listing → option mapping. New listing sources (agency feeds, other portals) go next to it. |
| `src/server` | Google Routes client with caching, TradeMe API client, rate limiting. |
| `src/app/api/times` | `POST` durations for every home × place × mode (Route Matrix API). |
| `src/app/api/routes` | `POST` route lines for home → place pairs in a given mode (Routes API, max 48 per request). |
| `src/app/api/listing` | `GET ?url=` turns a TradeMe link into a home. |
| `src/components` | The UI: side panel (`SettleApp`), map (`MapView`), address search (`PlaceSearch`). |

## Setup

```bash
npm install
cp .env.example .env.local   # then fill it in (see below)
npm run dev                  # http://localhost:3000
```

Without keys the app still opens with an example plan, but the map, address search and travel times need Google.

### Google Maps Platform

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com) and turn on billing (Google includes a monthly free allowance per API).
2. Enable **Maps JavaScript API**, **Places API (New)** and **Routes API** (the Routes API covers both route lines and the route matrix).
3. Create two API keys:
   - **Browser key** → `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Restrict it to *Websites* (your domains, plus `localhost:3000` for development) and to the Maps JavaScript and Places APIs.
   - **Server key** → `GOOGLE_MAPS_SERVER_KEY`. Restrict it to the Routes API only.
4. Set budget alerts and quota caps in the console so a traffic spike can't surprise you.

### TradeMe (optional)

Register an application at the [TradeMe developer site](https://developer.trademe.co.nz), then set `TRADEME_CONSUMER_KEY`, `TRADEME_CONSUMER_SECRET` and `TRADEME_ENV=sandbox`. Switch to `production` once TradeMe approves your app. Without these, pasting a TradeMe link shows a friendly "type the address instead".

## Cost controls built in

- Route lines and matrix times are cached for 3 days by rounded coordinates and mode, and in the browser, so repeat comparisons and switching back to a mode are free.
- The matrix call costs one element per home × place × mode (e.g. 3 homes × 3 places × 4 modes = 36). Transit and traffic-aware driving elements are billed at a higher tier than walk and bike.
- Routes are only requested when someone presses Compare, and only for pairs not already known.
- Limits: 6 homes and 8 places per plan, 48 pairs per request, 30 comparisons a minute per client.

The cache is in memory per server instance; move it to Redis/Vercel KV when traffic grows (same interface in `src/server/cache.ts`).

## Scripts

```bash
npm test        # unit tests (Vitest)
npm run lint
npm run build
```
