import { beforeAll, describe, expect, it } from "vitest";
import { measure } from "@/core/polyline";
import { DRAW_MS, FADE_OUT_MS, FEED_MS, layoutParts, paint, syncLines, type DrawRoute, type Line } from "./RouteLayer";

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
const route = (o: string, a: string, color = "#2F5FB3", parts = [{ m: measure(path), dashed: false }], faint = false): DrawRoute => ({ key: `${o}|${a}`, optionId: o, color, parts, faint });
const homeRoutes = (o: string) => [route(o, "work", "#2F5FB3"), route(o, "gym", "#B8651A")];

function setup() {
  const lines = new Map<string, Line>();
  const create = () => new FakePolyline() as unknown as google.maps.Polyline;
  const core = (key: string, part = 0) => (lines.get(key)!.parts[part].core as unknown as FakePolyline).o;
  const casing = (key: string) => (lines.get(key)!.parts[0].casing as unknown as FakePolyline).o;
  return { lines, create, core, casing };
}

describe("selected home's routes", () => {
  it("draw out from the home together, each in its place's colour, on a white casing", () => {
    const { lines, create, core, casing } = setup();
    syncLines(lines, homeRoutes("A"), 0, create);
    expect(paint(lines, DRAW_MS / 2)).toBe(true);
    expect(core("A|work")).toMatchObject({ visible: true, strokeColor: "#2F5FB3" });
    expect(core("A|gym").strokeColor).toBe("#B8651A");
    expect((core("A|work").path as unknown[]).length).toBeLessThan(path.length + 1);
    expect((core("A|work").icons as { offset: string }[])[0].offset).toBe("100%"); // head
    expect(casing("A|work")).toMatchObject({ strokeColor: "#ffffff", visible: true });
  });
  it("then send one light back along each route into the home, and stop", () => {
    const { lines, create, core } = setup();
    syncLines(lines, homeRoutes("A"), 0, create);
    paint(lines, DRAW_MS + FEED_MS * 0.1);
    const early = parseFloat((core("A|work").icons as { offset: string }[])[0].offset);
    paint(lines, DRAW_MS + FEED_MS * 0.8);
    const late = parseFloat((core("A|work").icons as { offset: string }[])[0].offset);
    expect(early).toBeGreaterThan(late); // travelling towards the home (start of the line)
    expect(paint(lines, DRAW_MS + FEED_MS + 1)).toBe(false);
    expect(core("A|work")).toMatchObject({ path, icons: [] });
  });
  it("selecting another home fades the old routes out and draws the new ones", () => {
    const { lines, create, core } = setup();
    syncLines(lines, homeRoutes("A"), 0, create);
    paint(lines, 5000);
    const oldWork = lines.get("A|work")!.parts[0].core as unknown as FakePolyline;
    syncLines(lines, homeRoutes("B"), 5000, create);
    paint(lines, 5000 + FADE_OUT_MS / 2);
    expect((oldWork.o.strokeOpacity as number)).toBeLessThan(1);
    expect((core("B|work").path as unknown[]).length).toBeLessThan(path.length + 1);
    paint(lines, 5000 + FADE_OUT_MS + 1);
    expect(lines.has("A|work")).toBe(false);
    expect(oldWork.removed).toBe(true);
  });
  it("shows routes straight away when motion is reduced", () => {
    const { lines, create, core } = setup();
    syncLines(lines, homeRoutes("A"), 0, create, true);
    expect(paint(lines, 0)).toBe(false);
    expect(core("A|work")).toMatchObject({ path, icons: [] });
  });
  it("draws other homes faintly in grey without a light when Show all routes is on", () => {
    const { lines, create, core, casing } = setup();
    syncLines(lines, [route("B", "work", "#2F5FB3", undefined, true)], 0, create);
    paint(lines, DRAW_MS + 10);
    expect(core("B|work")).toMatchObject({ strokeColor: "#AEB4BD", strokeOpacity: 0.5, icons: [] });
    expect(casing("B|work").visible).toBe(false);
  });
});

describe("transit parts", () => {
  const walk = { m: measure([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }]), dashed: true };
  const ride = { m: measure([{ lat: 0, lng: 1 }, { lat: 0, lng: 4 }]), dashed: false };
  it("shares one progress across parts by length", () => {
    expect(layoutParts(route("A", "work", "#000", [walk, ride])).map((p) => [p.start, p.end])).toEqual([[0, 0.25], [0.25, 1]]);
  });
  it("draws walking parts dashed and rides solid, in order", () => {
    const { lines, create, core } = setup();
    syncLines(lines, [route("A", "work", "#2F5FB3", [walk, ride])], 0, create);
    paint(lines, DRAW_MS * 0.2);
    expect(core("A|work", 0)).toMatchObject({ visible: true, strokeOpacity: 0 });
    expect((core("A|work", 0).icons as { repeat?: string }[]).some((i) => i.repeat)).toBe(true);
    expect(core("A|work", 1).visible).toBe(false);
    paint(lines, DRAW_MS);
    expect(core("A|work", 1)).toMatchObject({ visible: true, strokeOpacity: 1 });
  });
});
