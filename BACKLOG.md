# Settle backlog

Keep this current: every PR updates it (move items to Done, add what was learned or parked). Steve (`.claude/agents/steve.md`) reads it in full before every check.
Budget: **Google Maps Platform max US$50/month** beyond the free allowances.

## Next up

### Launch: owner-only steps (accounts and billing)
The site is public now (Vercel Authentication was turned off), so step 1 is urgent.
1. **Google Cloud budget and caps:** a US$50 budget with alerts at 50/90/100% (alerts only warn), plus **daily quota caps** on the Routes API and Places API (New), which actually stop spend. A start: about 350 route requests and 500 matrix elements a day, about 30 Text Search calls a day, about 500 autocomplete and Place Details calls a day.
2. **Restrict the keys:** the browser key by website (the `*.vercel.app` address, later the domain, plus localhost) to the Maps JavaScript API and Places API (New). The server key by API: Routes API and Places API (New), plus Elevation if used.
3. **Vercel → Settings → Functions → Region: Sydney (`syd1`).** The default is Washington, D.C. (`iad1`), so every `/api/*` call from NZ crosses the Pacific twice.
4. **Domain (optional for launch):** a `.nz` or `.co.nz` from an NZ registrar with cheap renewals (about NZ$17–36 a year). In Vercel → Settings → Domains, add the apex and `www`, copy the DNS records to the registrar, then add the domain to the browser key.
5. **Vercel Pro** (US$20/month) before any referral link, donate button or paid pass. Hobby is non-commercial. The owner has decided to launch on Pro.
6. **Privacy contact:** set `NEXT_PUBLIC_CONTACT_EMAIL` in Vercel (Settings → Environment Variables) and redeploy. The privacy page shows it under "Your rights". NZ's Privacy Act expects a way to get in touch.
7. **After adding a domain, redeploy once** so link previews (`metadataBase`) use it instead of the `vercel.app` address.
8. **TradeMe:** email api@trademe.co.nz about a Property API key for a free renter tool. Don't depend on it: the API is aimed at sellers, and buyer-side tools are "generally unsupported". Typed addresses already work.

### Before a wider launch: app fixes still to do (from Steve's reviews)
- **Compare off-screen:** scroll the map into view when Compare or Replay starts (less of an issue with the bottom sheet). Size S.
- **Along the way costs less without ratings:** asking for `rating`/`userRatingCount` puts Text Search in Enterprise (1k free, then US$35/1k). Without them it's Pro (5k free, then US$32/1k). Offer ratings on tap, or drop them. Size S.
- **Watch the rate limits after student posts:** 20 route requests a minute per IP suits most people, but hundreds of students behind one uni address could hit it. The limiter is per server instance, so it's softer in practice. Check the Vercel logs after any AUSA or AuSM post.
- **Check Google's caching terms** for the Routes API against the 3-day server cache and the browser cache. Location data from Directions/Geocoding may be cached up to 30 days, and place IDs may be cached. No Routes-specific clause was found yet.
- **Test on real phones** with real Google: iPhone Safari (address bar, keyboard over forms, safe areas) and Android Chrome. Setup, Compare, a shared link opened on a second phone, a TradeMe link.
- **Turn on Vercel Web Analytics** (no cookies) to count visitors.

### Soft launch plan (suggested by Steve, all free)
1. Friends and their flatmates.
2. One honest feedback post in r/auckland (check the sidebar rules first).
3. University student associations and flat-hunting groups (AUSA, AuSM, AUT's off-campus accommodation page). Students hunt from about October to February, and "trip to campus" is their key question, which suits the Walkable hint.
4. Short posts on the owner's own socials (doubles as the Upwork portfolio piece).

Include `/compare?example=1` in every post.

## Open decisions
- **Launch:** on Vercel Pro (decided). Domain, timing and audience are not decided yet (a soft launch to friends and students is suggested).
- **Day planner on the map:** check on the live site with real Google that chained routes, the trip back home (draws, then settles to light grey) and step-through look right.

## What we've learned (Steve's research, 15–16 Nov 2026)
Sources are in his overnight notes and morning report. Re-check prices before relying on them.
- **Google costs:**
  - Free caps are per service: Essentials 10k, Pro 5k, Enterprise 1k a month.
  - Traffic-aware drive routes and drive matrix elements are **Pro**: US$10 per 1,000 after 5k free.
  - Before "peak on tap", a user cost about 29 Pro requests; now about 13.
  - **Estimate with peak on tap:** about US$0 at 100 users a month, about US$80 at 1,000, and about US$1,500 at 10,000. The US$50 cap covers roughly 770 sessions a month.
- **Vercel:** Pro is US$20/month and includes US$20 of usage, 1 TB of transfer and 10M edge requests, which is plenty for Settle. Hobby is free but personal and non-commercial only.
- **Domains:** the .nz wholesale fee rose to NZ$22 + GST on 1 July 2025. Retail is about NZ$17–36 a year.
- **Income:**
  - **Fastest:** Settle as an Upwork portfolio piece. Google Maps freelance work pays about US$45–75 an hour, against US$15 for general web developers. A case study (including "how I kept Google under US$50/month"), a 60-second video (done, see Done) and an Upwork specialised profile for "Map and location apps".
  - **In-app:**
    - A "Moving in?" broadband link. Broadband Compare pays referral commission; Powerswitch is a non-profit and pays nothing. About NZ$150–500/month at 1,000 users (a guess).
    - A one-off NZ$5–10 Plus pass through Stripe, with no accounts. About NZ$80–240/month at 1,000 users (a guess).
    - No open NZ movers or contents-insurance affiliate programme was found. Commission Factory is the NZ network to watch.
  - **Scale:** a commute-check widget for listing sites, priced like Walk Score or TravelTime: free for people, paid licences or embeds for businesses using their own Google key. Spin-offs on the same engine: a relocation planner, job-offer comparer, school-zone tool, nomad base finder, and "Settle for my brand" client builds.
  - **Suggested order:** the Upwork case study and one referral link now, the Plus pass at about 1,000 users a month, then a widget pilot with one paying client.
- **Mobile pattern:** a three-height bottom sheet over a usable map is the standard (built, see Done). On the web the hard parts are iOS scroll chaining and drag-vs-scroll, handled in `useSheet`.

## Parked (later)
- **Phone demo video:** desktop only for now; a phone clip showing the bottom sheet could follow for Upwork.
- **Sheet polish after real-phone testing:** if dragging on the header feels too easy to trigger, limit it to the handle.
- **Mobile, zoomed far out:** cards keep a fixed size at every zoom, so far out they can overlap. Possible: shrink anchor cards to just the tab below a zoom level.
- **App-side budget guard:** a server-side daily request cap that shows "Settle is busy today, try tomorrow" instead of billing past the limit. Needs a shared counter (Vercel KV/Upstash), since in-memory counters are per instance. The Google Cloud caps (Next up, step 1) come first.
- **Motorway snapping fix** (parked by the owner, keep): set `vehicleStopover: true` on drive origin/destination waypoints (routes, matrix, peak). This stops vague pins (e.g. a postcode like "Auckland 1011") snapping onto a motorway lane, which causes U-turn detours or silly times (e.g. 62 min). Test with real Google. Also nudge users to enter a street address, not a postcode.
- **Cards covering routes** (parked by the owner, keep): the selected property card and anchor cards can sit on top of route lines.
  - Options: A) shrink the map card and put details in the panel; B) fade cards while a route draws; C) let cards be dragged; D) make the map card tiny (name + price) and move the rest to the panel.
  - Suggested: D + A.
- **Day planner, next steps:** depart times per day (the trip home at 5pm, not 8am; weekends), a timeline per property, "Along the way" stops added into the day, and a landing section showing days.
- **Overview screen:** if it still feels cluttered, compact property cards in the overview (name, price, best time only).
- **Day total:** not shown (no per-day totals rule). Revisit if people ask for "Day: 54 min".
- **Share links and stop → stop mode choices:** share links keep days but not mode overrides on stop → stop trips.
- **Optimise:** suggest the fastest mode per anchor.
- **Accounts + sync:** so properties and photos follow you across devices (Supabase or similar, plus image storage). The free version stays login-free.
- **"Paste a listing":** paste a post's text or a screenshot (e.g. from a Facebook group) and AI extracts the address, rent, rooms and photos. No Facebook API and no scraping.
- **Shared cache:** move `TtlCache` to Vercel KV/Redis so users share results, subject to Google's caching terms. It would make share-link viewers nearly free.
- **Sponsored listings:** parked; would hurt trust in "real routes, not ads".

## Done
- #1–#3: Next.js app, Google Routes and TradeMe server routes, key setup fixes, plain-English errors.
- #4–#9: one-home-at-a-time Compare, per-leg modes, map cards with hubs and tabbed anchor cards, stable card placement, lighter cards, deselect.
- #10: step-through routes (toggle), drive by default, bolder anchor tabs, chevrons, "Along the way" suggestions.
- #11: cost savers (extras only for the selected home).
- #12: landing page at `/`, route-S logo and favicon; the app at `/compare` starts empty; the example via `?example=1`.
- #13: property form (name, address → suburb, rent, beds, baths, listing link, photos), photos on the map card, chip borders removed.
- #14: CLAUDE.md and this backlog.
- #15: **mobile mode.** On by itself up to 760px. Homes are a small name tab; the selected one has a faint arrow that opens photos (camera or library), price, rooms and links, and pans into view. Anchors keep their tabbed card, shrunk to name, time and mode symbol. Fixed a double dashed border on the empty photo box. Also parked the budget guard, motorway snapping and cards covering routes.
- #16: **saved days.** Drag life anchors into visiting order to route them as one trip (home → stops → back home), the same day applied to every property. Several named days, saved locally and in share links.
- #17: **day planner fixes and tidying.**
  - Anchors added while a day is active always show in the panel. Drags are heard on the whole window, and the list always includes every anchor.
  - A house button goes back to the overview; the phone/desktop switch moved to the map.
  - Each trip shows its mode with a ">" and the other modes on demand. Their times load only then, so fewer Route Matrix calls.
  - First-run setup: add as many places, then as many properties, moving on with Next and Show on the map.
- #18: setup copy: "Add the places that matter to you", "Add anchor", "Back to anchors".
- #19: **days polish.**
  - Anchors left out of a day get no trip at all: no route, no Google call. Separate trips still shows them.
  - The trip back home draws, then fades to a very light grey.
  - The selected property's map card shows "Home from <last stop> · N min".
- #20–#22: **Steve** (`.claude/agents/steve.md`), a technical project manager agent: site checks (mobile first), design refinements, income and cost research, deployment steps. Reports in chat; no PRs unless asked. He knows the owner's background (web designer on Upwork, location-independent income while travelling, aiming big), with Auracle (a friend's AI training company moving into automations) as background only. Overnight research ran hourly until 7am on 16 Nov, then a morning report.
- #22: **peak range on tap.** "5–9 min at peak" loads only when you tap "Peak range" on a drive. It used to cost 2 Routes Pro requests per drive for every home selected; this cuts the estimated bill at 1,000 users from about US$240 to about US$80 a month.
- #23: **phone bottom sheet** (the owner chose it over a pinned map).
  - The map is full-screen, and the panel is a sheet at peek / half / full.
  - Drag the handle or header, tap the handle, or swipe the list.
  - It drops to half when you pick a home, to peek for Compare, and opens to full for typing.
  - "Show all" and opened cards keep clear of it.
- #24: **landing demo video.** A 26-second desktop recording of the live site with the real Google map.
  - The plan: Work at Commercial Bay, Gym at Westfield Newmarket, Grey Lynn School (walk), and the owner's photos on mock addresses (Richmond Road, Grey Lynn; Bond Street, Kingsland).
  - It shows Compare, the peak range, Transit (Bus 105) and the photo cards.
  - It plays in the hero (`public/landing/demo.mp4`, 1.2 MB); a higher-quality MP4 went to the owner for an Upwork proposal.
  - Vercel Authentication is off, so the site is public.
- Backlog rewritten in full (this version): launch steps, Steve's fixes and research, decisions and the PR history.
- #25: **backlog rewrite and launch fixes** (Steve's must-do list, then his review of them).
  - **Shared links are safe.** A shared link or the example opens as a preview that's never saved over the plan on this device, with a "Keep it" / "Back to yours" banner. If the device has no plan of its own, a shared plan is simply kept, so edits are never lost. `core/plan.ts` `planSource()` decides. Shared-links decision: A.
  - **Plain errors for the public.** "Today's limit reached, try tomorrow" for a daily quota, "busy, try in a minute" for a rate limit, and a general "try again" otherwise, worded for suggestions on Along the way. Google's text and setup hints go to the server log, and only show on previews and local dev.
  - **Tighter per-IP limits:** routes 20/min (was 60), times 20, peak 15, along 10, listing 20.
  - **Phones:** 16px text fields (no iOS zoom) and 38–44px tap targets, banner buttons included. No zoom buttons or view toggle; phones always use mobile mode, even with an old saved "desktop" choice.
  - **`/privacy`:** a plain-English privacy page, checked by Steve against the code. Linked from the landing footer and the bottom of the app panel. The contact shows once `NEXT_PUBLIC_CONTACT_EMAIL` is set.
  - **Link previews:** a 1200×630 preview card with alt text, Open Graph and Twitter tags, and `metadataBase` from Vercel's production domain.
  - Setup notes: the server key needs Places API (New) as well as Routes.
  - Share opens the phone's share sheet (WhatsApp, Messenger…); desktop still copies the link. An old error line clears once routes or times come back.
  - Steve reads BACKLOG.md in full before every check.
