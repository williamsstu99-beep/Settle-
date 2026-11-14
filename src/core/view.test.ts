import { describe, expect, it } from "vitest";
import { MOBILE_GEO, mobileAnchorWidth, mobileHomeWidth, readPref, resolveView, togglePref } from "./view";

describe("mobile mode", () => {
  it("follows the screen on auto", () => {
    expect(resolveView("auto", true)).toBe("mobile");
    expect(resolveView("auto", false)).toBe("desktop");
  });
  it("lets the toggle force either view", () => {
    expect(resolveView("desktop", true)).toBe("desktop");
    expect(resolveView("mobile", false)).toBe("mobile");
  });
  it("flips the view, and goes back to auto when that's what the screen wants", () => {
    expect(togglePref("auto", true)).toBe("desktop");
    expect(togglePref("desktop", true)).toBe("auto");
    expect(togglePref("auto", false)).toBe("mobile");
    expect(togglePref("mobile", false)).toBe("auto");
  });
  it("reads only known values from storage", () => {
    expect(readPref("mobile")).toBe("mobile");
    expect(readPref("desktop")).toBe("desktop");
    expect(readPref(null)).toBe("auto");
    expect(readPref("tablet")).toBe("auto");
  });
  it("keeps cards small enough for a phone", () => {
    expect(mobileHomeWidth("12 Very Long Street Name Avenue, Grey Lynn")).toBeLessThanOrEqual(170);
    expect(mobileAnchorWidth("Partner’s place and the long way round", true)).toBe(MOBILE_GEO.anchor.max);
    // A short name still leaves room for "18 min" and the mode icon.
    expect(mobileAnchorWidth("Gym", true)).toBeGreaterThanOrEqual(84);
    expect(mobileAnchorWidth("Gym", false)).toBeLessThan(84);
  });
});
