import { beforeAll, describe, expect, it } from "vitest";
import { measure } from "@/core/polyline";
import { advance, DRAW_MS, FADE_MS, GAP_MS, paint, type Line, type Live, type RunState } from "./RouteLayer";

// Minimal stand-in for google.maps.Polyline: records the last options it was given.
class FakePolyline {
  o: Record<string, unknown> = {};
  setOptions(o: Record<string, unknown>) { this.o = { ...this.o, ...o }; }
}
beforeAll(() => {
  (globalThis as unknown as { google: unknown }).google = { maps: { SymbolPath: { CIRCLE: 0 } } };
});

const path = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 2 }];
const routes = ["A", "B", "C"].flatMap((o) => ["work", "gym"].map((a) => ({ key: `${o}-${a}`, optionId: o, color: `#${o}${o}${o}`, m: measure(path) })));

function setup(focus: string | null = null) {
  const lines = new Map<string, Line>(routes.map((r) => [r.key, { glow: new FakePolyline(), core: new FakePolyline() } as unknown as Line]));
  const phases: unknown[] = [];
  const live: Live = { routes, order: ["A", "B", "C"], focus, runKey: "k", onPhase: (_k, p) => phases.push(p) };
  const st: RunState = { phase: 0, start: 0, fadeStart: 0, raf: 0 };
  const core = (key: string) => (lines.get(key)!.core as unknown as FakePolyline).o;
  const step = (t: number) => { advance(st, live, t); paint(lines, st, live, t); };
  return { lines, live, st, phases, core, step };
}

describe("route sequence", () => {
  it("draws one home at a time, all its routes together, partway along the road", () => {
    const { core, step } = setup();
    step(DRAW_MS / 2);
    expect(core("A-work").visible).toBe(true);
    expect(core("A-gym").visible).toBe(true);
    expect((core("A-work").path as unknown[]).length).toBeLessThan(path.length + 1);
    expect((core("A-work").icons as unknown[]).length).toBe(1); // moving head dot
    expect(core("B-work").visible).toBe(false);
  });
  it("keeps earlier homes on the map, softened, while the next one draws", () => {
    const { core, step, phases } = setup();
    step(DRAW_MS + GAP_MS + 10);
    expect(phases).toEqual([1]);
    expect(core("A-work")).toMatchObject({ visible: true, strokeOpacity: 0.6, path });
    expect(core("B-work").visible).toBe(true);
    expect(core("C-work").visible).toBe(false);
  });
  it("finishes, then settles every route into a muted overview", () => {
    const { core, step, phases, st } = setup();
    step(3 * (DRAW_MS + GAP_MS) + 1);
    expect(phases.at(-1)).toBe("done");
    step(st.fadeStart + FADE_MS);
    for (const k of ["A-work", "B-gym", "C-work"]) {
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
    expect(core("B-work")).toMatchObject({ strokeColor: "#BBB", strokeOpacity: 1 });
    expect(core("A-work")).toMatchObject({ strokeColor: "#B3B8C0" });
  });
});
