export interface Texture {
  size: 64 | 128;
  pixels: Uint16Array;
}

export function textureSize(extra: number): 64 | 128 {
  return extra === 0 ? 64 : 128;
}

export function decodeTexture(bytes: Uint8Array, extra: number): Texture | null {
  const size = textureSize(extra);
  const max = size * size * 2;
  if (bytes.byteLength < max) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pixels = new Uint16Array(size * size);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = view.getUint16(i * 2, true) ^ 0x8000;
  }
  return { size, pixels };
}

export function encodeTexture(texture: Texture): Uint8Array {
  const bytes = new Uint8Array(texture.pixels.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < texture.pixels.length; i++) {
    view.setUint16(i * 2, (texture.pixels[i] as number) ^ 0x8000, true);
  }
  return bytes;
}
