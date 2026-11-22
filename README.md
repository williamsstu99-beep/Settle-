# Settle

Compare homes by how they fit your life. Add the places that matter (work, the gym, your partner's place), add the homes you're considering, and Settle shows real travel times and routes from each home to each place.

## Pages

- **`/`**: the landing page (`src/app/page.tsx`, styles in `src/app/landing.css`). The hero shows an animated illustration until you add a real screenshot at `public/landing/hero.png` (about 1200 × 1040, a listing with photos looks best); it switches automatically on the next build.
- **`/compare`**: the app. It starts empty with a two-step setup: add the places that matter to you ("Add anchor", as many as you like, then Next), then your properties (then Show on the map). `/compare?example=1` opens the example plan without replacing your own.

The logo is `src/components/Logo.tsx` (the route "S"); the favicon is `src/app/icon.svg`.

## How it works

- **Life anchors** (`anchors` in code): where you need to get to, and how you travel there (transit, drive, bike or walk).
- **Properties** (`options` in code): "Add a property" opens a form for a name, the address (which fills in the suburb and city on the card), rent per week, beds, baths, a listing link (any site; "Open listing" on the map card and "View listing" in the panel) and photos. Pasting a TradeMe link fills in what it can. Photos are pasted, dropped or chosen, in the form or straight onto the selected map card; they're shrunk and kept in this browser only (up to 4 per property), never in share links.
- **Times for other modes:** route lines give each home's time in the chosen mode. Each trip shows its chosen mode with a ">"; only when you open it does the server ask Google's Route Matrix API for that one trip's durations in the other modes (no route lines). These fill the mode buttons and the Walkable hint (walk ≤ 15 min).
- **Your day (saved days):** by default every life anchor is its own trip from home ("Separate trips"). Drag anchors into the order you visit them (in the life anchors list, or in an open property card) and Settle routes them as one trip: home → first stop → next stop → back home. That order is a **day**, applied to every property so you can compare them on the same day. "Leave out" takes an anchor out of that day completely: no trip, no route line and no Google call (Separate trips still shows it). "Back home" can be left out too. The trip back home draws in colour, then settles to a very light grey line (it often runs over the trip there), and the selected property's map card shows its time ("Home from Work · 10 min"). Reordering in the **Anchors** tab shows the order on the map straight away but saves nothing; **Save to my days** names it and adds it to **My days**, where you switch between Separate trips and your saved days, rename them or delete them. Reordering while a saved day is showing changes that day. Days live in the plan (`days`, `dayId`), so they're saved in this browser and included in share links. Logic: `src/core/day.ts`.
- **Per-route modes:** each home → place route uses the place's default mode unless you pick another on that home's card. Picking one fetches just that route and swaps it on the map.
- **Map:** each home is a charcoal hub at its exact location with a card docked beside it (no connector line); the selected home's card expands, with its photo when there is one. Each place is a marker in its own colour (5-colour palette, max 5 places) with a tabbed card showing the time from the selected home, a rank badge (Fastest / 2nd fastest of 3 / Cheapest), a mode detail line and, for transit, Google's fare when returned. Every home's routes are drawn thin grey; the selected home's are drawn in place colours from the hub to each marker. Card sides (`src/core/layout.ts`) are only recalculated when homes, places, the selection or the zoom level change, never on pan, and keep their side while it's clear.
- **Phone layout (bottom sheet):** on screens up to 760px the map fills the screen and the panel is a sheet over it, like Google Maps. It rests at three heights (peek: header and top of the list; half; full, with a strip of map left showing). Drag the handle or header, tap the handle to step it up, swipe the list up to grow it, or pull down at the top of the list to shrink it. It moves itself when that helps: selecting a home drops a full sheet to half, Compare lowers it to peek, a text field opens it to full, and the house button sets it to half. "Show all" and an opened mobile card keep clear of it. Logic: `src/core/sheet.ts`; gestures: `src/components/useSheet.ts`.
- **Mobile mode:** on by itself on screens up to 760px wide; the phone/desktop button in the header switches view and is remembered per device (`settle.view.v1`). Homes become a small white name tab by the hub; the selected one gets a faint arrow that opens its photos (camera or library), price, rooms and listing link, and the map pans so the open card is on screen. Life anchors keep their tabbed card, shrunk to the name, the time and the mode's symbol. Logic and card sizes live in `src/core/view.ts`. No extra API calls.
- **Compare:** selects each home in turn from most to least daily travel, so the best home is shown last and stays selected. Skip during, Replay after; reduced motion skips straight to the end.
- **Along the way:** for the selected home, search any category (gym, café, school, childcare…) along its route to one of your places. Results come from the Places API (New) text search with `searchAlongRouteParameters`, with the extra minutes each stop adds; any result can be added as a place.
- **Step through routes:** selecting a home draws its routes one place at a time and lights up each place's card as its route arrives (switch on the map to turn it off). Places default to driving.
- **Landing page:** the hero is a real recording of the app on the live site, with real Google routes (`public/landing/hero.mp4`, about 22 s and 1.1 MB, with `hero-poster.jpg`). It shows two homes with the owner's photos, compare, reordering anchors into a day, and Save to my days. Recorded at a 1120×700 window and double pixel density, so it stays sharp in the hero box. Muted and looping, it pauses off-screen and doesn't autoplay with reduced motion (`src/components/landing/HeroVideo.tsx`). Re-record it when the UI changes noticeably.
- **Panel tabs:** the panel (and the phone sheet) has three tabs: **Properties** (compact cards, "Add a property"), **Anchors** (reorder, Leave out, remove, add) and **My days**. Every property and anchor has a × to remove it, and the circular-arrow button next to the house starts fresh: it asks first, then clears everything on this device. Each removal shows an **Undo** for a few seconds.
- **Shared links:** opening someone's link shows their plan as a preview, with "Keep it" or "Back to yours". It never replaces the plan on your device unless you keep it; with no plan of your own, it's kept straight away.
- **Errors:** the public site shows plain words (e.g. "Settle has reached today's limit for travel times. Please try again tomorrow."). Google's own text and setup hints go to the server log, and also show on previews and local dev, so setup problems are easy to spot.
- **Privacy and previews:** `/privacy` explains what stays on the device and what goes to Google and Vercel (set `NEXT_PUBLIC_CONTACT_EMAIL` to show a contact). Shared links get a preview card (`src/app/opengraph-image.jpg`).
- **Share:** the whole plan is encoded in the link (`#s=…`). Nothing is stored on the server.

The engine is deliberately general (anchors and options, not flats and workplaces), so other uses (buying, jobs, schools, relocation) are new screens rather than a rebuild.

## Code map

| Path | What it is |
|---|---|
| `src/core` | Pure logic: types, comparison, peak-time calculation, polyline decoding, share links, listing sources. Fully tested. |
| `src/core/day.ts` | Saved days: turns a day (anchors in order, left-out anchors, back home) into each home's trips; reorder and skip helpers. |
| `src/core/sheet.ts` | Phone bottom sheet: its three heights and where a drag settles (flicks move one stop). |
| `src/core/view.ts` | Mobile mode: view preference (auto / mobile / desktop) and the phone card sizes the side chooser uses. |
| `src/core/sources/trademe.ts` | TradeMe link parsing and listing → option mapping. New listing sources (agency feeds, other portals) go next to it. |
| `src/server` | Google Routes client with caching, TradeMe API client, rate limiting. |
| `src/app/api/times` | `POST` durations for homes × places in the requested modes (Route Matrix API). |
| `src/app/api/peak` | `POST` best/worst drive time at peak, only for a drive you tap "Peak range" on. |
| `src/app/api/routes` | `POST` route lines for home → place pairs in a given mode (Routes API, max 48 per request). |
| `src/app/api/along` | `POST` suggestions along a route (Places API text search along route), with detour minutes. |
| `src/app/api/listing` | `GET ?url=` turns a TradeMe link into a home. |
| `.claude/agents/steve.md` | Steve, the project's technical project manager agent: site checks, design ideas, income and cost research, deployment steps. Reports in chat. |
| `src/components` | The UI: side panel (`SettleApp`), map (`MapView`), address search (`PlaceSearch`), drag-to-reorder (`useReorder`). |

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
   - **Server key** → `GOOGLE_MAPS_SERVER_KEY`. Restrict it by API to the Routes API and Places API (New) (Along the way needs Places), plus Elevation if you use it. No website restriction.
4. Set budget alerts and quota caps in the console so a traffic spike can't surprise you.

### TradeMe (optional)

Register an application at the [TradeMe developer site](https://developer.trademe.co.nz), then set `TRADEME_CONSUMER_KEY`, `TRADEME_CONSUMER_SECRET` and `TRADEME_ENV=sandbox`. Switch to `production` once TradeMe approves your app. Without these, pasting a TradeMe link shows a friendly "type the address instead".

## Cost controls built in

On load, Settle asks for one route per home × place in its chosen mode (e.g. 3 homes × 3 places = 9 drive routes) and nothing else. Extras only load for the home you select, and not while Compare is stepping through homes (only for the home it ends on):

- **Mode button times:** only for a trip whose modes you open: one Route Matrix element per mode not already known (e.g. transit, bike, walk = 3).
- **"5–9 min at peak":** two duration-only drive requests (`/api/peak`), only when you tap "Peak range" on a drive. Both are Routes Pro (traffic-aware), so this was the biggest cost before it moved to on tap.
- **Terrain:** bike and walk routes make one Elevation request if that API is enabled.

**Days:** a day doesn't add trips, it changes where they start. Stop → stop trips (e.g. gym → work) are the same from every home, so they're fetched once and shared; only home → first stop and last stop → home are per home. Other-mode times load only for a trip you open; peak ranges only for a drive you tap "Peak range" on.

Everything is cached for 3 days on the server (by rounded coordinates and mode) and in the browser, so reselecting a home or switching back to a mode is free. Traffic-aware driving and transit are billed at a higher tier than walk and bike.

Limits: 6 homes and 5 places per plan, 48 pairs per request, per-client rate limits on every endpoint. Set budget alerts and daily quota caps in the Google Cloud console as well.

The cache is in memory per server instance; move it to Redis/Vercel KV when traffic grows (same interface in `src/server/cache.ts`).

## Scripts

```bash
npm test        # unit tests (Vitest)
npm run lint
npm run build
```
