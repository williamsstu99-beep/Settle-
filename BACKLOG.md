# Settle backlog

Keep this current: every PR updates it (move items to Done, add what was learned or parked).
Budget: **Google Maps Platform max US$50/month** beyond the free allowances.

## Next up

## Open decisions
- **Day planner on the map:** check on a Vercel preview with real Google that chained routes, the trip back home (draws, then settles to light grey) and step-through look right.
- **Launch plan:** the owner will launch on **Vercel Pro** (US$20/month, needed for any income). Audience (soft launch to friends and students suggested), timing and domain not decided yet.

## Parked (later)
- **Phone demo video:** the owner wants desktop only for now. A phone clip showing the bottom sheet could follow for Upwork.
- **Sheet polish after real-phone testing:** check iPhone Safari (address bar resizing, the keyboard over forms, safe areas) and Android Chrome on the preview. If dragging on the header feels too easy to trigger, limit it to the handle.
- **Mobile, zoomed far out:** cards keep a fixed size at every zoom, so far out they can still overlap. Possible later: shrink anchor cards to just the tab below a zoom level.
- **Budget guard (US$50/month)** (parked by the owner, keep): do these outside the code, then add an app-side guard.
  - **Google Cloud console:** budget alerts at 50/90/100%, plus daily quota caps on the Routes API and Places API (New). A budget alone only warns; quota caps actually stop spend.
  - **App guard:** a server-side daily request cap that shows "Settle is busy today, try tomorrow" instead of billing past the limit. This needs a shared counter (Vercel KV/Upstash), since in-memory counters are per instance.
- **Motorway snapping fix** (parked by the owner, keep): set `vehicleStopover: true` on drive origin/destination waypoints (routes, matrix, peak). Stops vague pins (e.g. a postcode like "Auckland 1011") snapping onto a motorway lane and producing U-turn detours or silly times (e.g. 62 min). Test on a Vercel preview with real Google. Also nudge users to enter a street address, not a postcode.
- **Cards covering routes** (parked by the owner, keep; the mobile work may settle part of it): the selected property card and the anchor cards can sit on top of route lines.
  - Options: A) shrink the map card and put details in the panel; B) fade cards while a route draws; C) let cards be dragged; D) make the map card tiny (name + price) and move the rest to the panel.
  - Suggested: D + A. Not decided.
- **Day planner, next steps:** depart times per day (the trip home at 5pm, not 8am; weekends), a timeline view per property, "Along the way" stops added into the day, and a landing section showing days.
- **Overview screen:** the house button returns to the overview (nothing selected, everything closed, map fits all). If it still feels cluttered, next step could be compact property cards in the overview (name, price, best time only).
- **Day total:** not shown (no per-day totals rule). Revisit if people ask for "Day: 54 min" once trips are chained.
- **Share links and stop → stop mode choices:** share links keep days but not mode overrides on stop → stop trips; add if it matters.
- **Optimise:** suggest the fastest mode per anchor.
- **Accounts + sync:** so saved properties and photos follow you across devices (would need Supabase or similar, plus image storage). The free version stays login-free.
- **"Paste a listing":** paste the post text or a screenshot (e.g. from a Facebook group) and AI extracts the address, rent, rooms and photos. There's no Facebook API and no scraping.
- **Shared cache:** move `TtlCache` to Vercel KV/Redis so users share results (check Google's caching terms).
- **TradeMe:** production API approval (currently sandbox).
- **Revenue ideas:** a paid tier, referrals (movers, broadband, power), agencies paying to list.
- **Vercel Pro:** needed before charging money (Hobby is non-commercial).

## Done
- Saved days: drag life anchors into visiting order to route them as one trip (home → stops → back home), the same day applied to every property; "Leave out" keeps an anchor as its own trip; several named days, saved locally and in share links. Matrix requests trimmed to unknown trips and modes.
- #1–#3: Next.js app, Google Routes + TradeMe server routes, key setup fixes and plain-English errors.
- #4–#9: one-home-at-a-time Compare, per-leg modes, map cards with hubs and tabbed anchor cards, stable card placement, lighter cards, deselect.
- #10: step-through routes (toggle), drive by default, bolder anchor tabs, chevrons, "Along the way" suggestions.
- #11: cost savers (extras only for the selected home; `/api/peak` on demand).
- #12: landing page at `/`, route-S logo and favicon, the app at `/compare` starts empty with life anchors first, example via `?example=1`.
- #13: property form (name, address → suburb, rent, beds, baths, listing link, photos), photos on the map card, chip borders removed.
- #14: CLAUDE.md and this backlog.
- Mobile mode: on by itself up to 760px, header toggle remembered per device. Homes are a small name tab (the desktop's unselected style); selected adds a faint arrow that opens photos (camera or library), price, rooms and links, and pans the card into view. Anchors keep their tabbed card, shrunk to name, time and mode symbol. Also fixed a double dashed border on the empty photo box. Parked: budget guard, motorway snapping and cards covering routes.
- Fixes from the day planner preview: anchors added while a day is active now always show in the panel (a drag whose drop was missed could leave the list stuck on its old order; drags are now heard on the whole window, and the list always includes every anchor). A house button in the header goes back to the overview; the phone/desktop switch moved to the map. Each trip shows its mode with a ">" and the other modes open on demand, and their times only load then (fewer Route Matrix calls).
- First-run setup: step 1 "Add your places" and step 2 "Add your properties" each take as many as you like; you move on with Next and Show on the map (Back to places too). Day controls stay hidden until setup is done.
- Setup copy: step 1 now reads "Add the places that matter to you", its button "Add anchor", and step 2 goes "Back to anchors".
- Day planner polish: anchors left out of a day get no trip at all (no route, no Google call); the trip back home draws then fades to very light grey; the selected property's map card shows "Home from <last stop> · N min".
- Steve (`.claude/agents/steve.md`): a technical project manager agent that checks the site for clunky spots (mobile first), suggests design refinements, researches income ideas and running costs, and explains the deployment steps. Reports in chat; no PRs unless asked. The owner will tune him.
- Steve now knows the owner background (web designer on Upwork, wants location-independent income while travelling, aiming big). Auracle (a friend's AI training company moving into automations) added as background only.
- Peak range on tap: "5–9 min at peak" loads only when you tap "Peak range" on a drive (it was 2 Routes Pro requests per drive for every home you selected). Steve's estimate: the Google bill at 1,000 users drops from about US$240 to about US$80 a month.
- Phone bottom sheet (the owner chose option A over a pinned map): full-screen map with the panel as a sheet at peek / half / full. Drag the handle or header, tap the handle, swipe the list. It drops to half when you pick a home, to peek for Compare, and opens to full for typing. Map fitting and opened cards keep clear of it.
- Landing demo video: a 26-second desktop recording of the live site (real Google map) plays in the hero (`public/landing/demo.mp4`, 1.2 MB, with `demo-poster.jpg`). The plan: Work at Commercial Bay, Gym at Westfield Newmarket, Grey Lynn School (walk), and the owner's own photos on mock addresses (Richmond Road, Grey Lynn; Bond Street, Kingsland). It shows Compare, the peak range, switching to Transit (Bus 105) and the photo cards. A higher-quality copy was made for the owner's Upwork proposal. Replaces the planned hero screenshot. Vercel Authentication is now off, so the site is public.
