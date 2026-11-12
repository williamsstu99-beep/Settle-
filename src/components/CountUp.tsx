"use client";

import { useEffect, useState } from "react";

/** Counts a number up from 0 over `ms`, once per mount (give it a key to restart). */
export function CountUp({ value, ms, instant }: { value: number; ms: number; instant: boolean }) {
  const [shown, setShown] = useState(instant ? value : 0);
  useEffect(() => {
    if (instant) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, instant]);
  return <>{instant ? value : shown}</>;
}
