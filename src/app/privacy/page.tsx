import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import "../landing.css";

export const metadata: Metadata = {
  title: "Privacy · Settle",
  description: "What Settle keeps, what it sends to Google, and what it never does. No accounts, nothing sold.",
};

/** Set NEXT_PUBLIC_CONTACT_EMAIL in the hosting settings to show a contact address. */
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function Privacy() {
  return (
    <div className="l">
      <header className="l-wrap l-nav">
        <Link href="/" className="l-brand" aria-label="Settle home"><Wordmark /></Link>
        <nav aria-label="Main">
          <Link href="/compare" className="l-btn l-btn-dark l-btn-sm">Open Settle</Link>
        </nav>
      </header>
      <main className="l-wrap l-legal">
        <h1>Privacy</h1>
        <p className="l-lede">Settle is free and has no accounts. Here’s exactly what happens to what you put in.</p>

        <h2>What stays on your device</h2>
        <ul>
          <li>Your life anchors, properties, saved days and photos are kept in this browser only (its local storage). They’re never uploaded to Settle.</li>
          <li>Photos are shrunk and stay on this device. They’re never included in share links.</li>
          <li>Clearing your browser’s site data removes everything.</li>
        </ul>

        <h2>What goes to Google</h2>
        <ul>
          <li>To show real routes and travel times, the locations of your anchors and properties are sent to Google Maps Platform, through Settle’s server.</li>
          <li>The map, and the address search as you type, come straight from Google in your browser.</li>
          <li>Google handles this under its own <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a>.</li>
        </ul>

        <h2>What Settle’s server does</h2>
        <ul>
          <li>It passes requests to Google and briefly keeps the results (routes and times for up to three days, “Along the way” suggestions for a day), so asking again is free and fast. It doesn’t record who asked.</li>
          <li>Like any website, the hosting provider (Vercel) sees your IP address. Settle uses it only to stop one address making too many requests at once.</li>
          <li>If you paste a TradeMe link, Settle asks TradeMe for that listing’s details.</li>
        </ul>

        <h2>Share links</h2>
        <p>
          A share link carries your plan inside the link itself: your anchors and their addresses, your properties (with rent and any listing links)
          and your days, but not photos. That part of the link comes after the “#”, so it’s never sent to Settle’s server. Anyone you send it to can
          see the plan, so share it with people you trust. Opening someone’s link never replaces a plan already on your device unless you choose to keep theirs.
        </p>

        <h2>What Settle never does</h2>
        <ul>
          <li>No accounts and no ads. Settle itself sets no cookies; the Google map runs under Google’s own policy.</li>
          <li>Your information is never sold or shared for marketing.</li>
        </ul>

        <h2>Your rights</h2>
        <p>
          Under New Zealand’s Privacy Act 2020 you can ask what information is held about you and ask for it to be corrected.
          Settle doesn’t keep anything that identifies you, so in practice there’s nothing to hand over. Everything you entered is on your own device.
          {CONTACT ? <> Questions? Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</> : null}
        </p>
        <p className="l-small">Last updated 16 November 2026.</p>
      </main>
      <footer className="l-wrap l-foot">
        <span>© Settle · Made in Aotearoa</span>
        <span>Travel times by Google Maps</span>
      </footer>
    </div>
  );
}
