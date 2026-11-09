"use client";

import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useEffect, useRef, useState } from "react";
import { parseTradeMeListingId } from "@/core/sources/trademe";
import type { LatLng } from "@/core/types";
import { Icon } from "./icons";

export type PickedPlace = { location: LatLng; title: string; subtitle?: string; address?: string };

type Suggestion = { kind: "place"; main: string; secondary?: string; pred: google.maps.places.PlacePrediction } | { kind: "link"; url: string; id: string };

/**
 * Address search with Google Places autocomplete. Optionally recognises a
 * pasted TradeMe link and hands it to `onLink` instead.
 */
export function PlaceSearch({
  placeholder,
  onPick,
  onLink,
  autoFocus,
  id,
}: {
  placeholder: string;
  onPick: (p: PickedPlace) => void;
  onLink?: (url: string) => Promise<void> | void;
  autoFocus?: boolean;
  id: string;
}) {
  const places = useMapsLibrary("places");
  const map = useMap();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const text = q.trim();
  const tmId = onLink ? parseTradeMeListingId(text) : null;
  const shown: Suggestion[] = tmId ? [{ kind: "link", url: text, id: tmId }] : text.length >= 3 ? items : [];

  useEffect(() => {
    if (tmId || !places || text.length < 3) return;
    let live = true;
    const t = setTimeout(async () => {
      try {
        token.current ??= new places.AutocompleteSessionToken();
        const c = map?.getCenter();
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: text,
          sessionToken: token.current,
          ...(c ? { locationBias: { center: c, radius: 50000 } } : {}),
        });
        if (!live) return;
        setItems(
          suggestions.flatMap((s): Suggestion[] =>
            s.placePrediction ? [{ kind: "place", main: s.placePrediction.mainText?.text ?? s.placePrediction.text.text, secondary: s.placePrediction.secondaryText?.text, pred: s.placePrediction }] : [],
          ),
        );
        setActive(0);
      } catch {
        if (live) setErr("Address search isn't working right now.");
      }
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text, tmId, places, map]);

  async function choose(s: Suggestion) {
    setErr(null);
    setBusy(true);
    try {
      if (s.kind === "link") {
        await onLink?.(s.url);
      } else {
        const place = s.pred.toPlace();
        await place.fetchFields({ fields: ["location", "formattedAddress"] });
        token.current = null;
        if (!place.location) throw new Error("no location");
        onPick({ location: { lat: place.location.lat(), lng: place.location.lng() }, title: s.main, subtitle: s.secondary, address: place.formattedAddress ?? undefined });
      }
      setQ("");
      setItems([]);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error && e.message !== "no location" ? e.message : "Couldn't find that place. Try another search.");
    } finally {
      setBusy(false);
    }
  }

  const listId = `${id}-list`;
  return (
    <div className="search">
      <Icon name={onLink ? "link" : "search"} size={15} />
      <input
        id={id}
        className="text"
        value={q}
        placeholder={places || onLink ? placeholder : "Address search needs the Google key"}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        disabled={busy}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setErr(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && shown[active]) { e.preventDefault(); choose(shown[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && shown.length > 0 && (
        <div className="sugg" role="listbox" id={listId}>
          {shown.map((s, i) => (
            <button key={i} role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(s)}>
              {s.kind === "link" ? (
                <>Add TradeMe listing<small>Listing {s.id}</small></>
              ) : (
                <>{s.main}{s.secondary && <small>{s.secondary}</small>}</>
              )}
            </button>
          ))}
        </div>
      )}
      {busy && <p className="hint" style={{ marginTop: 6 }}>Finding it…</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
