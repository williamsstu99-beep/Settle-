import { beforeAll, describe, expect, it } from "vitest";
import { measure } from "@/core/polyline";
import { advance, DRAW_MS, FADE_MS, FADE_OUT_MS, GAP_MS, layoutParts, paint, SWAP_MS, syncLines, type DrawRoute, type Line, type Live, type RunState } from "./RouteLayer";

// Minimal stand-in for google.maps.Polyline: records the last options it was given.
class FakePolyline {
  o: Record<string, unknown> = {};
  removed = false;
  setOptions(o: Record<string, unknown>) { this.o = { ...this.o, ...o }; }
  setMap(m: unknown) { if (m === null) this.removed = true; }
}
beforeAll(() => {
  (globalThis as unknown as { google: unknown }).google = { maps: { SymbolPath: { CIRCLE: 0 } } };
});

const path = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 2 }];
const route = (o: string, a: string, mode = "transit", parts = [{ m: measure(path), dashed: false }]): DrawRoute => ({ key: `${o}|${a}|${mode}`, pair: `${o}|${a}`, optionId: o, color: `#${o}${o}${o}`, parts });
const routes = ["A", "B", "C"].flatMap((o) => ["work", "gym"].map((a) => route(o, a)));

function setup(rs: DrawRoute[] = routes, focus: string | null = null) {
  const lines = new Map<string, Line>();
  const phases: unknown[] = [];
  const live: Live = { order: ["A", "B", "C"], focus, runKey: "k", onPhase: (_k, p) => phases.push(p) };
  const st: RunState = { phase: null, start: 0, fadeStart: 0, raf: 0 };
  const create = () => new FakePolyline() as unknown as google.maps.Polyline;
  syncLines(lines, rs, false, 0, create);
  st.phase = 0;
  const core = (key: string, part = 0) => (lines.get(key)!.parts[part].core as unknown as FakePolyline).o;
  const step = (t: number) => { advance(st, live, t); return paint(lines, st, live, t); };
  return { lines, live, st, phases, core, step, create };
}

describe("route sequence", () => {
  it("draws one home at a time, all its routes together, partway along the road", () => {
    const { core, step } = setup();
    step(DRAW_MS / 2);
    expect(core("A|work|transit").visible).toBe(true);
    expect(core("A|gym|transit").visible).toBe(true);
    expect((core("A|work|transit").path as unknown[]).length).toBeLessThan(path.length + 1);
    expect((core("A|work|transit").icons as unknown[]).length).toBe(1); // moving head dot
    expect(core("B|work|transit").visible).toBe(false);
  });
  it("keeps earlier homes on the map, softened, while the next one draws", () => {
    const { core, step, phases } = setup();
    step(DRAW_MS + GAP_MS + 10);
    expect(phases).toEqual([1]);
    expect(core("A|work|transit")).toMatchObject({ visible: true, strokeOpacity: 0.6, path });
    expect(core("B|work|transit").visible).toBe(true);
    expect(core("C|work|transit").visible).toBe(false);
  });
  it("finishes, then settles every route into a muted overview and stops moving", () => {
    const { core, step, phases, st } = setup();
    step(3 * (DRAW_MS + GAP_MS) + 1);
    expect(phases.at(-1)).toBe("done");
    expect(step(st.fadeStart + FADE_MS)).toBe(false);
    for (const k of ["A|work|transit", "B|gym|transit", "C|work|transit"]) {
      expect(core(k).visible).toBe(true);
      expect(core(k).strokeOpacity as number).toBeCloseTo(0.45);
      expect(core(k).icons).toEqual([]);
    }
  });
  it("in the overview, focusing a home keeps its colour and greys the rest", () => {
    const { core, step, st, live } = setup();
    step(3 * (DRAW_MS + GAP_MS) + 1);
    live.focus = "B";
    step(st.fadeStart + FADE_MS);
    expect(core("B|work|transit")).toMatchObject({ strokeColor: "#BBB", strokeOpacity: 1 });
    expect(core("A|work|transit")).toMatchObject({ strokeColor: "#B3B8C0" });
  });
});

describe("changing one route's mode", () => {
  it("fades the old line out and draws only the new one in, leaving other routes alone", () => {
    const { lines, core, step, st, live, create } = setup();
    const end = 3 * (DRAW_MS + GAP_MS) + 1;
    step(end);
    const t0 = st.fadeStart + FADE_MS;
    step(t0);
    live.focus = "B";
    const swapped = routes.map((r) => (r.key === "B|work|transit" ? route("B", "work", "drive") : r));
    syncLines(lines, swapped, true, t0, create);
    const old = lines.get("B|work|transit")!.parts[0].core as unknown as FakePolyline;

    expect(step(t0 + SWAP_MS / 2)).toBe(true);
    expect((core("B|work|drive").path as unknown[]).length).toBeLessThan(path.length + 1); // drawing in
    expect((core("B|work|drive").icons as unknown[]).length).toBe(1);
    expect(core("B|gym|transit").path).toEqual(path); // untouched
    expect(lines.has("B|work|transit")).toBe(false); // faded out and removed by now
    expect(old.removed).toBe(true);

    step(t0 + SWAP_MS + 1);
    expect(core("B|work|drive")).toMatchObject({ path, icons: [] });
  });
  it("fades the old line gradually rather than cutting it", () => {
    const { lines, step, st, create } = setup();
    step(3 * (DRAW_MS + GAP_MS) + 1);
    const t0 = st.fadeStart + FADE_MS;
    step(t0);
    syncLines(lines, routes.filter((r) => r.key !== "A|gym|transit"), true, t0, create);
    step(t0 + FADE_OUT_MS / 2);
    const o = (lines.get("A|gym|transit")!.parts[0].core as unknown as FakePolyline).o;
    expect(o.strokeOpacity as number).toBeGreaterThan(0);
    expect(o.strokeOpacity as number).toBeLessThan(0.45);
  });
});

describe("transit parts", () => {
  const walk = { m: measure([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }]), dashed: true };
  const ride = { m: measure([{ lat: 0, lng: 1 }, { lat: 0, lng: 4 }]), dashed: false };
  it("shares one progress across parts by length", () => {
    expect(layoutParts(route("A", "work", "transit", [walk, ride])).map((p) => [p.start, p.end])).toEqual([[0, 0.25], [0.25, 1]]);
  });
  it("draws walking parts dashed and rides solid, in order", () => {
    const { core, step } = setup([route("A", "work", "transit", [walk, ride])]);
    step(DRAW_MS * 0.2);
    expect(core("A|work|transit", 0)).toMatchObject({ visible: true, strokeOpacity: 0 }); // dashes come from icons
    expect((core("A|work|transit", 0).icons as { repeat?: string }[]).some((i) => i.repeat)).toBe(true);
    expect(core("A|work|transit", 1).visible).toBe(false); // ride not reached yet
    step(DRAW_MS);
    expect(core("A|work|transit", 1)).toMatchObject({ visible: true, strokeOpacity: 1 });
  });
});
