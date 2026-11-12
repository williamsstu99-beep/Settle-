"use client";

import { useRef, useState } from "react";
import { areaOf, MAX_PHOTOS, safeLink, wholeNumber } from "@/core/home";
import { parseTradeMeListingId } from "@/core/sources/trademe";
import type { Option } from "@/core/types";
import { PlaceSearch, type PickedPlace } from "./PlaceSearch";
import { PhotoStrip } from "./PhotoStrip";

/** What the form hands back: everything about a home except its id. */
export type HomeDraft = Omit<Option, "id">;

/**
 * Add or edit a property: a name, the address (which fills in the suburb),
 * rent, beds, baths, a listing link and your own photos.
 */
export function HomeForm({
  initial,
  onSave,
  onCancel,
  onRemove,
  fetchListing,
}: {
  initial?: Option;
  onSave: (d: HomeDraft) => void;
  onCancel: () => void;
  onRemove?: () => void;
  /** Turns a TradeMe link into a home (location, rent, beds, photo). */
  fetchListing: (url: string) => Promise<Option>;
}) {
  const [name, setName] = useState(initial?.title ?? "");
  const [place, setPlace] = useState<Pick<Option, "location" | "address" | "subtitle"> | null>(initial ? { location: initial.location, address: initial.address, subtitle: initial.subtitle } : null);
  const [street, setStreet] = useState<string | undefined>(undefined);
  const [rent, setRent] = useState(initial?.price?.amount ? String(initial.price.amount) : "");
  const [beds, setBeds] = useState(initial?.bedrooms ? String(initial.bedrooms) : "");
  const [baths, setBaths] = useState(initial?.bathrooms ? String(initial.bathrooms) : "");
  const [link, setLink] = useState(initial?.link ?? (initial?.source.kind === "trademe" ? initial.source.url : ""));
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? []);
  const [listing, setListing] = useState<Option | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const pick = (pl: PickedPlace) => {
    setPlace({ location: pl.location, address: pl.address, subtitle: areaOf(pl.address) ?? pl.subtitle });
    setStreet(pl.title);
  };

  /** A TradeMe link fills in everything it can; you can still change the details. */
  const fillFromListing = async (url: string) => {
    setErr(null);
    setBusy(true);
    try {
      const o = await fetchListing(url);
      setListing(o);
      setPlace({ location: o.location, address: o.address, subtitle: o.subtitle });
      setStreet(o.title);
      if (o.price?.amount && !rent) setRent(String(o.price.amount));
      if (o.bedrooms && !beds) setBeds(String(o.bedrooms));
      if (o.bathrooms && !baths) setBaths(String(o.bathrooms));
      setLink(url);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const onLinkBlur = () => {
    const t = link.trim();
    if (t && !place && parseTradeMeListingId(t)) void fillFromListing(t);
  };

  const save = () => {
    if (!place) return setErr("Pick the address first, so Settle knows where it is.");
    const amount = wholeNumber(rent, 100000);
    const tm = listing?.source.kind === "trademe" ? listing.source : initial?.source.kind === "trademe" ? initial.source : null;
    onSave({
      title: (name.trim() || street || initial?.title || "Home").slice(0, 80),
      subtitle: place.subtitle,
      address: place.address,
      location: place.location,
      source: tm ?? { kind: "manual" },
      price: amount ? { amount, period: "week", currency: initial?.price?.currency ?? listing?.price?.currency ?? "NZD" } : undefined,
      bedrooms: wholeNumber(beds, 50),
      bathrooms: wholeNumber(baths, 20),
      propertyType: listing?.propertyType ?? initial?.propertyType,
      photo: listing?.photo ?? initial?.photo,
      link: safeLink(link),
      photos: photos.length ? photos : undefined,
    });
  };

  const id = initial?.id ?? "new";
  return (
    <div className="edit homeform">
      <label className="flabel" htmlFor={`hn-${id}`}>Name <span>e.g. Valley Rd flat, The townhouse</span></label>
      <input id={`hn-${id}`} ref={nameRef} className="text" autoFocus={!initial} value={name} maxLength={80} placeholder={street ?? "Property"} onChange={(e) => setName(e.target.value)} />

      <label className="flabel" htmlFor={`ha-${id}`}>Address</label>
      {place ? (
        <div className="picked">
          <span><b>{street ?? place.address?.split(",")[0] ?? initial?.title}</b>{place.subtitle && <> · {place.subtitle}</>}</span>
          <button className="link" onClick={() => { setPlace(null); setStreet(undefined); }}>Change</button>
        </div>
      ) : (
        <PlaceSearch id={`ha-${id}`} placeholder="Type the address, or paste a TradeMe link" onPick={pick} onLink={fillFromListing} />
      )}

      <div className="hf-row">
        <div>
          <label className="flabel" htmlFor={`hr-${id}`}>Rent <span>per week</span></label>
          <div className="money"><span>$</span><input id={`hr-${id}`} className="text" inputMode="numeric" value={rent} placeholder="e.g. 650" onChange={(e) => setRent(e.target.value)} /></div>
        </div>
        <div>
          <label className="flabel" htmlFor={`hb-${id}`}>Beds</label>
          <input id={`hb-${id}`} className="text" inputMode="numeric" value={beds} placeholder="e.g. 2" onChange={(e) => setBeds(e.target.value)} />
        </div>
        <div>
          <label className="flabel" htmlFor={`hba-${id}`}>Baths</label>
          <input id={`hba-${id}`} className="text" inputMode="numeric" value={baths} placeholder="e.g. 1" onChange={(e) => setBaths(e.target.value)} />
        </div>
      </div>

      <label className="flabel" htmlFor={`hl-${id}`}>Listing link <span>optional · TradeMe, Facebook, agency</span></label>
      <input id={`hl-${id}`} className="text" type="url" inputMode="url" value={link} placeholder="https://" onChange={(e) => setLink(e.target.value)} onBlur={onLinkBlur} />

      <span className="flabel">Photos <span>paste, drop or choose · up to {MAX_PHOTOS} · kept on this device</span></span>
      <PhotoStrip photos={photos} onChange={setPhotos} onError={setErr} />

      {err && <p className="err">{err}</p>}
      <div className="edit-foot">
        {onRemove ? <button className="link danger" onClick={onRemove}>Remove</button> : <span />}
        <span className="hf-actions">
          <button className="link" onClick={onCancel}>Cancel</button>
          <button className="btn dark" onClick={save} disabled={busy}>{busy ? "Getting listing…" : initial ? "Save" : "Add property"}</button>
        </span>
      </div>
    </div>
  );
}
