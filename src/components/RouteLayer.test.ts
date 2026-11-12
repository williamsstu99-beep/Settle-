import { beforeAll, describe, expect, it } from "vitest";
import { measure } from "@/core/polyline";
import { DRAW_MS, FADE_MS, GREY, layoutParts, paint, STEP_DRAW, STEP_GAP, syncLines, type DrawRoute, type Line } from "./RouteLayer";

class FakePolyline {
  o: Record<string, unknown> = {};
  removed = false;
  setOptions(o: Record<string, unknown>) { this.o = { ...this.o, ...o }; }
  setMap(m: unknown) { if (m === null) this.removed = true; }
}
beforeAll(() => {
  (globalThis as unknown as { google: unknown }).google = { maps: { SymbolPath: { CIRCLE: 0, FORWARD_OPEN_ARROW: 3 } } };
});

const path = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 2 }];
const route = (o: string, a: string, selected: boolean, color = "#6E93D6", parts = [{ m: measure(path), dashed: false }]): DrawRoute => ({ key: `${o}|${a}`, optionId: o, color, parts, selected });
const all = (sel: string) => ["A", "B"].flatMap((o) => [route(o, "work", o === sel, "#6E93D6"), route(o, "gym", o === sel, "#DB935C")]);

function setup() {
  const lines = new Map<string, Line>();
  const create = () => new FakePolyline() as unknown as google.maps.Polyline;
  const layer = (key: string, which: "grey" | "casing" | "core", part = 0) => (lines.get(key)!.parts[part][which] as unknown as FakePolyline).o;
  return { lines, create, layer };
}

describe("routes", () => {
  it("shows every home's routes as thin grey lines", () => {
    const { lines, create, layer } = setup();
    syncLines(lines, all("A"), 0, create);
    paint(lines, 5000);
    for (const k of ["A|work", "B|work", "B|gym"]) expect(layer(k, "grey")).toMatchObject({ visible: true, strokeColor: GREY, strokeWeight: 2 });
    expect(layer("B|work", "core").visible).toBe(false);
  });
  it("draws the selected home's routes out of its hub in each place's colour on a white casing", () => {
    const { lines, create, layer } = setup();
    syncLines(lines, all("A"), 0, create);
    paint(lines, DRAW_MS / 2);
    expect(layer("A|work", "core")).toMatchObject({ visible: true, strokeColor: "#6E93D6", strokeWeight: 5 });
    expect(layer("A|gym", "core").strokeColor).toBe("#DB935C");
    expect(layer("A|work", "casing")).toMatchObject({ visible: true, strokeColor: "#ffffff", strokeWeight: 9 });
    expect((layer("A|work", "core").path as unknown[]).length).toBeLessThan(path.length + 1);
    expect((layer("A|work", "core").icons as { offset: string }[]).some((i) => i.offset === "100%")).toBe(true);
  });
  it("then marks them with still direction chevrons and stops animating", () => {
    const { lines, create, layer } = setup();
    syncLines(lines, all("A"), 0, create);
    expect(paint(lines, DRAW_MS + 100)).toBe(false);
    const icons = layer("A|work", "core").icons as { repeat?: string; icon: { path: unknown } }[];
    expect(icons).toHaveLength(1);
    expect(icons[0].repeat).toBe("72px");
  });
  it("steps through places: each route waits for its turn, then draws", () => {
    const { lines, create, layer } = setup();
    const stepped = all("A").map((r, i) => (r.selected ? { ...r, delay: i * STEP_GAP, drawMs: STEP_DRAW } : r));
    syncLines(lines, stepped, 0, create);
    paint(lines, STEP_DRAW / 2);
    expect(layer("A|work", "core").visible).toBe(true);
    expect(layer("A|gym", "core").visible).toBe(false); // not its turn yet
    paint(lines, STEP_GAP + STEP_DRAW / 2);
    expect(layer("A|work", "core").path).toEqual(path); // done
    expect(layer("A|gym", "core").visible).toBe(true); // drawing now
    expect(paint(lines, STEP_GAP + STEP_DRAW + 10)).toBe(false);
  });
  it("selecting another home fades the old colour back to grey and draws the new one", () => {
    const { lines, create, layer } = setup();
    syncLines(lines, all("A"), 0, create);
    paint(lines, 5000);
    syncLines(lines, all("B"), 5000, create);
    paint(lines, 5000 + FADE_MS / 2);
    expect(layer("A|work", "core").strokeOpacity as number).toBeLessThan(1);
    expect(layer("A|work", "grey").visible).toBe(true);
    expect((layer("B|work", "core").path as unknown[]).length).toBeLessThan(path.length + 1);
    paint(lines, 5000 + FADE_MS + 10);
    expect(layer("A|work", "core").visible).toBe(false);
  });
  it("fades out a route whose mode changed and removes it", () => {
    const { lines, create } = setup();
    syncLines(lines, all("A"), 0, create);
    paint(lines, 5000);
    const old = lines.get("A|work")!.parts[0].core as unknown as FakePolyline;
    syncLines(lines, [...all("A").filter((r) => r.key !== "A|work"), { ...route("A", "work", true), key: "A|work|drive" }], 5000, create);
    paint(lines, 5000 + FADE_MS + 1);
    expect(lines.has("A|work")).toBe(false);
    expect(old.removed).toBe(true);
    expect(lines.has("A|work|drive")).toBe(true);
  });
  it("with reduced motion: no drawing, pulses stand still, nothing keeps animating", () => {
    const { lines, create, layer } = setup();
    syncLines(lines, all("A"), 0, create, true);
    expect(paint(lines, 0)).toBe(false);
    expect(layer("A|work", "core")).toMatchObject({ visible: true, path });
  });
});

describe("transit parts", () => {
  const walk = { m: measure([{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }]), dashed: true };
  const ride = { m: measure([{ lat: 0, lng: 1 }, { lat: 0, lng: 4 }]), dashed: false };
  it("shares one progress across parts by length", () => {
    expect(layoutParts({ parts: [walk, ride] }).map((p) => [p.start, p.end])).toEqual([[0, 0.25], [0.25, 1]]);
  });
  it("draws walking parts dashed (grey and colour) and rides solid", () => {
    const { lines, create, layer } = setup();
    syncLines(lines, [route("A", "work", true, "#6E93D6", [walk, ride])], 0, create);
    paint(lines, DRAW_MS * 2);
    expect(layer("A|work", "core", 0).strokeOpacity).toBe(0);
    expect((layer("A|work", "core", 0).icons as { repeat?: string }[]).some((i) => i.repeat === "15px")).toBe(true);
    expect(layer("A|work", "grey", 0).strokeOpacity).toBe(0);
    expect(layer("A|work", "core", 1)).toMatchObject({ visible: true, strokeOpacity: 1 });
  });
});
