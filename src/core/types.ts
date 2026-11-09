/**
 * Settle's core model. Deliberately general: an "anchor" is a place that
 * matters in someone's life, an "option" is a candidate they are weighing up
 * (a flat today; a house, job or school later). Nothing here assumes renting
 * or New Zealand.
 */

export type LatLng = { lat: number; lng: number };

export type Mode = "drive" | "transit" | "bike" | "walk";

export const MODES: Mode[] = ["transit", "drive", "bike", "walk"];

export type AnchorIcon =
  | "work"
  | "gym"
  | "partner"
  | "family"
  | "study"
  | "cafe"
  | "other";

export type Anchor = {
  id: string;
  name: string;
  icon: AnchorIcon;
  location: LatLng;
  address?: string;
  mode: Mode;
};

export type Price = {
  amount: number;
  period: "week" | "month" | "once";
  currency: string; // ISO 4217, e.g. NZD
};

/** Where an option came from. New sources (agency feeds, other portals) add a variant here. */
export type OptionSource =
  | { kind: "manual" }
  | { kind: "trademe"; listingId: string; url: string }
  | { kind: "feed"; provider: string; ref: string; url?: string };

export type Option = {
  id: string;
  title: string; // e.g. street address
  subtitle?: string; // e.g. suburb, city
  location: LatLng;
  source: OptionSource;
  price?: Price;
  bedrooms?: number;
  bathrooms?: number;
  propertyType?: string;
};

export type Leg = {
  optionId: string;
  anchorId: string;
  mode: Mode;
  status: "ok" | "no_route";
  minutes?: number;
  meters?: number;
  /** Google encoded polyline. */
  polyline?: string;
};
