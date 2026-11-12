import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import Link from "next/link";
import { HeroMap } from "@/components/landing/HeroMap";
import { SettleMark, Wordmark } from "@/components/Logo";
import "./landing.css";

/** Drop a real screenshot of the app at public/landing/hero.png and it replaces the illustration. */
const HERO = "/landing/hero.png";
const hasHeroShot = existsSync(path.join(process.cwd(), "public", HERO));

const STEPS = [
  { n: "1", tint: "sky", title: "Set your life anchors", body: "Work, the gym, your partner’s place, the kids’ school. Name them and choose how you usually get there." },
  { n: "2", tint: "peach", title: "Add the homes", body: "Paste a TradeMe link or type any address. Compare up to six at once." },
  { n: "3", tint: "sage", title: "See which fits", body: "Real peak-hour routes from Google, home by home, finishing on your best match." },
];

const FEATURES = [
  { title: "Drive, bus, bike or walk", body: "Switch any trip and see the real route, the fare and how often the bus comes." },
  { title: "Along the way", body: "Find a gym, café, supermarket or daycare on the way to work, with the minutes each stop adds." },
  { title: "Yours, and shareable", body: "Your homes and anchors stay saved on your device. Send one link and flatmates see the same map." },
];

export default function Landing() {
  return (
    <div className="l">
      <header className="l-wrap l-nav">
        <Link href="/" className="l-brand" aria-label="Settle home"><Wordmark /></Link>
        <nav aria-label="Main">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <Link href="/compare" className="l-btn l-btn-dark l-btn-sm">Open Settle</Link>
        </nav>
      </header>

      <main>
        <section className="l-wrap l-hero">
          <div className="l-hero-copy">
            <span className="l-pill">Free · no sign-up</span>
            <h1>Find the home that fits your life.</h1>
            <p className="l-lede">
              Plan around your <b>life anchors</b>, the things that actually matter. Work, the gym, your partner’s place, the kids’ school.
              Add the homes you’re looking at and Settle shows the real trip from each one, on one map.
            </p>
            <div className="l-ctas">
              <Link href="/compare" className="l-btn l-btn-dark">Start with your anchors</Link>
              <Link href="/compare?example=1" className="l-btn l-btn-light">See an example</Link>
            </div>
            <p className="l-small">Paste a TradeMe link or type any address.</p>
          </div>
          <div className="l-hero-art">
            {hasHeroShot ? (
              <div className="l-shot"><Image src={HERO} alt="Settle comparing three homes on a map, with routes to work, the gym and a friend’s place" fill sizes="(max-width: 900px) 100vw, 640px" priority /></div>
            ) : (
              <HeroMap />
            )}
          </div>
        </section>

        <section id="how" className="l-band">
          <div className="l-wrap">
            <h2 className="l-h2 l-center">Three steps. No spreadsheets.</h2>
            <ol className="l-steps">
              {STEPS.map((s) => (
                <li key={s.n} className="l-card l-card-soft">
                  <span className={`l-num l-${s.tint}`}>{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" className="l-wrap l-features">
          <div className="l-anchors">
            <h2 className="l-h2">Your life isn’t one commute.</h2>
            <p className="l-lede">
              A flat near work can still be a long way from everything else. Settle measures every home against all of your anchors at once, so you can
              see the trade-off before you sign the lease.
            </p>
          </div>
          <div className="l-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="l-card l-card-line">
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="l-wrap">
          <div className="l-cta">
            <SettleMark size={56} onDark />
            <h2 className="l-h2">Your next home, planned around your life.</h2>
            <p>Free while we’re getting started. No account needed.</p>
            <Link href="/compare" className="l-btn l-btn-white">Start with your anchors</Link>
          </div>
        </section>
      </main>

      <footer className="l-wrap l-foot">
        <span>© Settle · Made in Aotearoa</span>
        <span>Travel times by Google Maps</span>
      </footer>
    </div>
  );
}
