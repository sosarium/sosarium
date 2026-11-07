import type { ArtTile } from '@sosarium/formats';
import { rgbaToPixels } from '@sosarium/render';

export function tileToCanvas(tile: ArtTile): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = tile.width;
  canvas.height = tile.height;
  const context = canvas.getContext('2d');
  if (!context) {
    return canvas;
  }
  const image = context.createImageData(tile.width, tile.height);
  for (let i = 0; i < tile.pixels.length; i++) {
    const value = tile.pixels[i] as number;
    const offset = i * 4;
    image.data[offset] = ((value >> 10) & 0x1f) << 3;
    image.data[offset + 1] = ((value >> 5) & 0x1f) << 3;
    image.data[offset + 2] = (value & 0x1f) << 3;
    image.data[offset + 3] = value & 0x8000 ? 255 : 0;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

export async function tileToPngBlob(tile: ArtTile): Promise<Blob> {
  const canvas = tileToCanvas(tile);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('could not encode PNG'));
      }
    }, 'image/png');
  });
}

export async function imageFileToTile(file: Blob): Promise<ArtTile | null> {
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width <= 0 || bitmap.height <= 0 || bitmap.width > 2048 || bitmap.height > 2048) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return {
      width: bitmap.width,
      height: bitmap.height,
      pixels: rgbaToPixels(data.data)
    };
  } finally {
    bitmap.close();
  }
}
