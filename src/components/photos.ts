/** Shrink a picked or pasted image so a few of them fit in the browser's storage. */
export async function shrinkImage(file: File, max = 800, quality = 0.72): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That isn't an image.");
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL("image/jpeg", quality);
}

/** Image files from a paste or drop. */
export function imageFiles(list: FileList | DataTransferItemList | null | undefined): File[] {
  if (!list) return [];
  const out: File[] = [];
  for (const it of Array.from(list as ArrayLike<File | DataTransferItem>)) {
    const f = it instanceof File ? it : it.kind === "file" ? it.getAsFile() : null;
    if (f && f.type.startsWith("image/")) out.push(f);
  }
  return out;
}
