# Settle backlog

Keep this current: every PR updates it (move items to Done, add what was learned or parked).
Budget: **Google Maps Platform max US$50/month** beyond the free allowances.

## Next up
- **Mobile panel:** the map cards are done (see Done); the panel below the map is still the desktop panel stacked underneath. Options raised: A) a bottom sheet over a full-screen map (peek / half / full), B) Map / List tabs, C) keep stacked but tighten it. Not decided.
- **Hero screenshot:** a real app screenshot of a listing with photos at `public/landing/hero.png` (~1200×1040). The owner provides it.

## Open decisions
- **Launch plan:** audience, timing and domain are not decided yet.

## Parked (later)
- **Mobile, zoomed far out:** cards keep a fixed size at every zoom, so far out they can still overlap. Possible later: shrink anchor cards to just the tab below a zoom level.
- **Budget guard (US$50/month)** (parked by the owner, keep): do these outside the code, then add an app-side guard.
  - **Google Cloud console:** budget alerts at 50/90/100%, plus daily quota caps on the Routes API and Places API (New). A budget alone only warns; quota caps actually stop spend.
  - **App guard:** a server-side daily request cap that shows "Settle is busy today, try tomorrow" instead of billing past the limit. This needs a shared counter (Vercel KV/Upstash), since in-memory counters are per instance.
- **Motorway snapping fix** (parked by the owner, keep): set `vehicleStopover: true` on drive origin/destination waypoints (routes, matrix, peak). Stops vague pins (e.g. a postcode like "Auckland 1011") snapping onto a motorway lane and producing U-turn detours or silly times (e.g. 62 min). Test on a Vercel preview with real Google. Also nudge users to enter a street address, not a postcode.
- **Cards covering routes** (parked by the owner, keep; the mobile work may settle part of it): the selected property card and the anchor cards can sit on top of route lines.
  - Options: A) shrink the map card and put details in the panel; B) fade cards while a route draws; C) let cards be dragged; D) make the map card tiny (name + price) and move the rest to the panel.
  - Suggested: D + A. Not decided.
- **"My day" planner:** chain stops (home → work → gym → partner's → home) with times, a timeline per property, and "Along the way" stops built in. Landing option C on the design canvas shows the idea.
- **Optimise:** suggest the fastest mode per anchor.
- **Accounts + sync:** so saved properties and photos follow you across devices (would need Supabase or similar, plus image storage). The free version stays login-free.
- **"Paste a listing":** paste the post text or a screenshot (e.g. from a Facebook group) and AI extracts the address, rent, rooms and photos. There's no Facebook API and no scraping.
- **Shared cache:** move `TtlCache` to Vercel KV/Redis so users share results (check Google's caching terms).
- **TradeMe:** production API approval (currently sandbox).
- **Revenue ideas:** a paid tier, referrals (movers, broadband, power), agencies paying to list.
- **Vercel Pro:** needed before charging money (Hobby is non-commercial).

## Done
- #1–#3: Next.js app, Google Routes + TradeMe server routes, key setup fixes and plain-English errors.
- #4–#9: one-home-at-a-time Compare, per-leg modes, map cards with hubs and tabbed anchor cards, stable card placement, lighter cards, deselect.
- #10: step-through routes (toggle), drive by default, bolder anchor tabs, chevrons, "Along the way" suggestions.
- #11: cost savers (extras only for the selected home; `/api/peak` on demand).
- #12: landing page at `/`, route-S logo and favicon, the app at `/compare` starts empty with life anchors first, example via `?example=1`.
- #13: property form (name, address → suburb, rent, beds, baths, listing link, photos), photos on the map card, chip borders removed.
- #14: CLAUDE.md and this backlog.
- Mobile mode: on by itself up to 760px, header toggle remembered per device. Homes are a small name tab (the desktop's unselected style); selected adds a faint arrow that opens photos (camera or library), price, rooms and links, and pans the card into view. Anchors keep their tabbed card, shrunk to name, time and mode symbol. Also fixed a double dashed border on the empty photo box. Parked: budget guard, motorway snapping and cards covering routes.
