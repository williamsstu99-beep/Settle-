"use client";

import { useEffect, useRef } from "react";

/**
 * The landing hero: a real recording of Settle (real Google map and routes),
 * muted and looping. It pauses while scrolled off-screen, and with reduced
 * motion it doesn't autoplay: it shows its first frame with play controls.
 */
export function HeroVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      v.pause();
      v.controls = true;
      return;
    }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => {}); // muted, so browsers allow it
      else v.pause();
    }, { threshold: 0.2 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return <video ref={ref} src={src} poster={poster} autoPlay muted loop playsInline preload="auto" aria-label={label} />;
}
