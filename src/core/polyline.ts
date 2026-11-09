import type { LatLng } from "./types";

/** Decode a Google encoded polyline (precision 5). */
export function decodePolyline(encoded: string): LatLng[] {
  const out: LatLng[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    for (const which of [0, 1]) {
      let result = 0, shift = 0, b: number;
      do {
        b = encoded.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

/** The point halfway along a path, by distance. Used to place time labels. */
export function midpoint(path: LatLng[]): LatLng | undefined {
  if (!path.length) return undefined;
  if (path.length === 1) return path[0];
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i].lat - path[i - 1].lat, (path[i].lng - path[i - 1].lng) * Math.cos((path[i].lat * Math.PI) / 180));
    seg.push(d);
    total += d;
  }
  let goal = total / 2;
  for (let i = 0; i < seg.length; i++) {
    if (goal <= seg[i]) {
      const f = seg[i] ? goal / seg[i] : 0;
      return { lat: path[i].lat + (path[i + 1].lat - path[i].lat) * f, lng: path[i].lng + (path[i + 1].lng - path[i].lng) * f };
    }
    goal -= seg[i];
  }
  return path[path.length - 1];
}

/** A path prepared for drawing progressively: cumulative distance at each point. */
export type Measured = { path: LatLng[]; cum: number[]; total: number };

export function measure(path: LatLng[]): Measured {
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const dy = b.lat - a.lat, dx = (b.lng - a.lng) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  return { path, cum, total: cum[cum.length - 1] ?? 0 };
}

/** The first `t` (0–1) of a path by distance, ending exactly at the interpolated point. */
export function partialPath(m: Measured, t: number): LatLng[] {
  if (m.path.length < 2 || t >= 1) return m.path;
  if (t <= 0) return [m.path[0]];
  const goal = m.total * t;
  let i = 1;
  while (i < m.cum.length && m.cum[i] < goal) i++;
  const segLen = m.cum[i] - m.cum[i - 1];
  const f = segLen ? (goal - m.cum[i - 1]) / segLen : 0;
  const a = m.path[i - 1], b = m.path[i];
  return [...m.path.slice(0, i), { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }];
}

/** Ease-in-out, so lines start gently and settle into the destination. */
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
