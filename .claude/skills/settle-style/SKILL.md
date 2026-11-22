---
name: settle-style
description: How Stu (Settle's owner) likes the app to look, feel and work, and how he likes changes proposed, built, shown and explained. Use whenever designing, building, reviewing or explaining anything in the Settle app (UI, map, phone sheet, landing page, copy, recordings), or when planning work with him.
---

# Settle: what Stu likes, and how he likes it

Settle is Stu's own product and his strongest portfolio piece, so it should look **beautiful, calm and professional** in the hands of a renter and in an Upwork proposal. `CLAUDE.md` has the hard rules; this file is the taste and the way of working that sits behind them. If they ever disagree, follow `CLAUDE.md` and mention it.

## How the app should feel

- **Calm and clear.** Light, plenty of space, one thing at a time. No neon, no dark-heavy UI, no gradient washes, no emoji. Short lists, not one long scroll.
- **Beautiful, and the same everywhere.** The **charcoal property card** on the map is a signature: it must look the same on phone and desktop. Map place tabs are bold and solid in the anchor's colour. Anchors in the panel are just a colour bar and a name (no icons). Palette: `ANCHOR_PALETTE` (sky, peach, rose, sage, lavender), ink `#2C3038`.
- **In control, never stuck.** Every property, anchor and day can be removed from the panel (never from the map) with **Undo**. There's always a way back (the house button, Back, Cancel) and a way out (**Start fresh**, which asks "are you sure?" first). A user should never feel trapped in a plan.
- **The map stays in view.** On a phone the panel is a bottom sheet with tabs (Properties / Anchors / My days). Never make people scroll away from the map to do something and miss the animation.
- **Tidy, not cluttered.** Show the default and let people open the rest: a trip shows "Drive >" and the other modes open on demand; "Peak range" loads on tap. Compact property cards.
- **Nothing that looks broken.** No cards off the edge, no page shifting sideways, no surprise zoom-outs (e.g. all of NZ after a reorder), no white strips, no text wrapping awkwardly.
- **Delight in the motion.** Routes draw out one anchor at a time ("Step through routes"); times count up; the trip home draws, then settles to a very light grey so it doesn't overpower. Reduced motion always gets a calm still version.
- **Real over imitation.** For the landing page and Upwork, a sharp **real recording of the live app** (real Google map, real routes, his own photos on mock addresses) beats a drawn animation: Stu found the animation "way less beautiful than the actual app".

## Product instincts he's shown

- **Times are one-way, per anchor.** No weekly or per-day totals.
- **Days:** reorder anchors to try an order on the map; nothing is saved until "Save to my days". Left-out anchors get no route at all.
- **Onboarding never jumps ahead:** add as many places as you like, then Next; then as many properties, then Show on the map.
- **Cost first:** the Google budget is US$50/month. Load extras only when someone asks for them (other modes, peak range). Weigh every new API call.
- **Free, no accounts.** Shared links open as a preview that never overwrites someone's own plan.
- **Users should feel** in control, calm and confident. Steve's file has the full version, and Steve checks reviews against it.

## How he likes to work with you

- **Big design changes: talk first, then build.** Offer 2–3 options with a recommendation, using `AskUserQuestion` with previews or simple ASCII mock-ups. When he says "go", build it all without more questions.
- **When he's confused, draw it.** Small ASCII phone or screen sketches (before and after) work far better than paragraphs.
- **Show, don't just tell.** After UI work, send screenshots or a short clip (Playwright rig with stubbed Google, kept out of the repo) and say plainly that it hasn't been tried on a real phone yet. For anything visual, check it frame by frame yourself first.
- **One PR per change set,** with a clear title and a short "what changed / testing" body. He merges. Update `BACKLOG.md` in every PR. Run `npm test`, `npm run lint` and `npm run build` first.
- **Get Steve to review bigger changes** before calling them done, fix what he finds, and tell Stu what Steve said in plain words.
- **Finish properly:** if you notice related breakage (a security patch, a broken map, a bug in his screenshots), flag it in one or two lines and offer to fix it rather than silently expanding the job.
- **Owner-only steps** (Google Cloud, Vercel, GitHub settings): give **direct links** to the exact pages and numbered click-by-click steps. Ask for a screenshot if he's stuck. Never ask for keys in chat.
- **Keep him safe:** warn before anything that could break the live site (e.g. locking a key before the server has its own key) and give the safe order.

## How to talk to him

- **Plain English, NZ spelling, short.** Lead with the outcome ("Done, PR #N"), then what changed in his words, then anything he needs to do. Skip jargon; if a technical word is needed, explain it in a few words.
- **Honest.** If something only worked in the test rig, say so. If he's about to do something risky, say "hold off" and why.
- **He's on his phone a lot** and testing in Messenger's browser: keep replies scannable, and give the production link: https://settle-dun-delta.vercel.app
- **He likes momentum.** When he says "go", don't stall with extra questions; pick sensible defaults, say what you chose, and keep going.
