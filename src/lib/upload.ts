/**
 * Downscales/compresses an image client-side (photos from phones are often
 * multi-MB; a compressed copy uploads fast and renders fine in chat).
 * Non-image files are returned unchanged.
 */
export async function compressImage(
  file: File,
  maxDim = 1600,
  quality = 0.82,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 300 * 1024) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) return file;

  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

/**
 * Uploads a file to Convex storage and returns its storage ID.
 * `generateUploadUrl` is the `api.messages.generateUploadUrl` mutation.
 */
export async function uploadToConvex(
  file: File,
  generateUploadUrl: () => Promise<string>,
): Promise<string> {
  const postUrl = await generateUploadUrl();
  const response = await fetch(postUrl, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!response.ok) {
    throw new Error("Upload failed — please try again");
  }
  const { storageId } = (await response.json()) as { storageId: string };
  return storageId;
}
