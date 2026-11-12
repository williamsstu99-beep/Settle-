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
  /** Permanent colour for this place: its card, route lines and panel row. */
  color?: string;
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
  /** Listing photo URL, when the source has one. */
  photo?: string;
  /** Full address, when picked from search. */
  address?: string;
  /** Any listing link the user pasted (TradeMe, Facebook, an agency…). */
  link?: string;
  /** Photos the user added (downscaled data URLs). Kept on this device only, never in share links. */
  photos?: string[];
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
  /** Transit only: the route split into walking and riding parts. */
  steps?: TransitStep[];
  /** Transit only: one-way fare, when Google returns one. Never estimated. */
  fare?: { amount: number; currency: string };
  /** Drive only: optimistic–pessimistic minutes at the peak departure. */
  peak?: [number, number];
  /** Bike / walk only: total climb along the route, in metres. */
  ascent?: number;
};

export type TransitStep = {
  kind: "walk" | "ride";
  polyline: string;
  /** Short line name for rides, e.g. "25B" or "Western Line". */
  line?: string;
  vehicle?: string; // e.g. BUS, HEAVY_RAIL, FERRY
  /** Rides: the stop you board at (for "1 change at …"). */
  from?: string;
  /** Rides: minutes between services, when Google gives it. */
  headwayMin?: number;
};

/** A travel time without geometry, from the batch (matrix) request. */
export type Time = {
  optionId: string;
  anchorId: string;
  mode: Mode;
  status: "ok" | "no_route";
  minutes?: number;
  meters?: number;
};
