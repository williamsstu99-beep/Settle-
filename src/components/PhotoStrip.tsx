"use client";

import { useRef, useState } from "react";
import { MAX_PHOTOS } from "@/core/home";
import { Icon } from "./icons";
import { imageFiles, shrinkImage } from "./photos";

/** Thumbnails plus a "+" tile that takes a paste, a drop or a file pick. */
export function PhotoStrip({ photos, onChange, onError, dark }: { photos: string[]; onChange: (p: string[]) => void; onError: (m: string | null) => void; dark?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const add = async (files: File[]) => {
    onError(null);
    const room = MAX_PHOTOS - photos.length;
    if (!files.length) return;
    if (room <= 0) return onError(`Up to ${MAX_PHOTOS} photos per property.`);
    try {
      const shrunk = await Promise.all(files.slice(0, room).map((f) => shrinkImage(f)));
      onChange([...photos, ...shrunk]);
      if (files.length > room) onError(`Added ${room}; up to ${MAX_PHOTOS} photos per property.`);
    } catch {
      onError("Couldn't read that image.");
    }
  };
  return (
    <div
      className={`photostrip${dark ? " dark" : ""}${over ? " over" : ""}`}
      onPaste={(e) => { const f = imageFiles(e.clipboardData?.items); if (f.length) { e.preventDefault(); void add(f); } }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void add(imageFiles(e.dataTransfer?.files)); }}
    >
      {photos.map((src, i) => (
        <div key={i} className="ph">
          {/* Local data URL; next/image adds nothing here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`Photo ${i + 1}`} />
          <button className="ph-x" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(photos.filter((_, j) => j !== i))}><Icon name="close" size={11} /></button>
        </div>
      ))}
      {photos.length < MAX_PHOTOS && (
        <button className="ph add" onClick={() => input.current?.click()} aria-label="Add photos: choose files, or paste or drop images here">
          <Icon name="plus" size={16} />
          {!photos.length && <span>Add photos</span>}
        </button>
      )}
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { void add(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
    </div>
  );
}
