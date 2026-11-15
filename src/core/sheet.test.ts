import { describe, expect, it } from "vitest";
import { clampHeight, FLICK, nextSnap, settle, SHEET_PEEK, SHEET_STRETCH, SHEET_TOP_GAP, sheetHeights } from "./sheet";

describe("phone bottom sheet", () => {
  const h = sheetHeights(844); // iPhone 13

  it("rests at peek, half and full, leaving map showing above full", () => {
    expect(h.peek).toBe(SHEET_PEEK);
    expect(h.half).toBe(422);
    expect(h.full).toBe(844 - SHEET_TOP_GAP);
  });
  it("keeps the stops in order even on a short screen", () => {
    const s = sheetHeights(420);
    expect(s.peek).toBeLessThan(s.half);
    expect(s.half).toBeLessThan(s.full);
  });
  it("settles a slow release on the nearest stop", () => {
    expect(settle(200, 0, h)).toBe("peek");
    expect(settle(400, 0.1, h)).toBe("half");
    expect(settle(700, -0.1, h)).toBe("full");
  });
  it("moves a flick one stop in its direction", () => {
    expect(settle(430, FLICK + 0.1, h)).toBe("full"); // just above half, flicked up
    expect(settle(410, -(FLICK + 0.1), h)).toBe("peek"); // just below half, flicked down
    expect(settle(h.full + 10, FLICK + 1, h)).toBe("full"); // nothing further up: nearest
  });
  it("stretches only a little past the ends", () => {
    expect(clampHeight(2000, h)).toBe(h.full + SHEET_STRETCH);
    expect(clampHeight(0, h)).toBe(h.peek - SHEET_STRETCH);
    expect(clampHeight(500, h)).toBe(500);
  });
  it("steps up on a tap, and back to half from the top", () => {
    expect(nextSnap("peek")).toBe("half");
    expect(nextSnap("half")).toBe("full");
    expect(nextSnap("full")).toBe("half");
  });
});
