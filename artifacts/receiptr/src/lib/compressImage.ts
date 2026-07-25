const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

export async function compressImage(
  blob: Blob,
  mimeType: string,
): Promise<{ blob: Blob; contentType: string }> {
  if (!mimeType.startsWith("image/")) {
    return { blob, contentType: mimeType };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return { blob, contentType: mimeType };
  }

  let { width, height } = bitmap;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width >= height) {
      height = Math.round((height / width) * MAX_DIMENSION);
      width = MAX_DIMENSION;
    } else {
      width = Math.round((width / height) * MAX_DIMENSION);
      height = MAX_DIMENSION;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return { blob, contentType: mimeType };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve) => {
    canvas.toBlob(
      (compressed) => {
        resolve(
          compressed
            ? { blob: compressed, contentType: "image/jpeg" }
            : { blob, contentType: mimeType },
        );
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

export function compressedFileName(originalName: string, contentType: string): string {
  if (contentType === "image/jpeg" && !originalName.match(/\.jpe?g$/i)) {
    return originalName.replace(/\.[^.]+$/, ".jpg") || originalName + ".jpg";
  }
  return originalName;
}
