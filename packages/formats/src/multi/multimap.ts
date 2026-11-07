export interface MultiMapImage {
  width: number;
  height: number;
  pixels: Uint16Array;
}

export const MULTIMAP_WIDTH = 2560;
export const MULTIMAP_HEIGHT = 2048;

export function parseMultiMapRle(bytes: Uint8Array): MultiMapImage {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  const pixels = new Uint16Array(width * height);
  let position = 8;
  let index = 0;

  while (position < bytes.byteLength && index < pixels.length) {
    const run = bytes[position++] as number;
    const count = run & 0x7f;
    const color = run & 0x80 ? 0x8000 : 0xffff;
    for (let i = 0; i < count && index < pixels.length; i++) {
      pixels[index++] = color;
    }
  }

  return { width, height, pixels };
}

export function serializeMultiMapRle(image: MultiMapImage): Uint8Array {
  const runs: number[] = [];
  let current = image.pixels[0] ?? 0xffff;
  let count = 0;

  const flush = () => {
    while (count > 0) {
      const chunk = Math.min(count, 0x7f);
      runs.push((current === 0xffff ? 0x00 : 0x80) | chunk);
      count -= chunk;
    }
  };

  for (let i = 0; i < image.pixels.length; i++) {
    const color = image.pixels[i] as number;
    if (color === current) {
      count++;
      continue;
    }
    flush();
    current = color;
    count = 1;
  }
  flush();

  const out = new Uint8Array(8 + runs.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, image.width, true);
  view.setUint32(4, image.height, true);
  out.set(runs, 8);
  return out;
}
