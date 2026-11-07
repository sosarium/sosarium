export const SOUND_NAME_LENGTH = 0x10;
export const SOUND_HEADER_LENGTH = 0x20;

export interface SoundEntry {
  id: number;
  name: string;
  wave: Uint8Array;
}

export interface SoundIndexEntry {
  lookup: number;
  length: number;
  index: number;
  reserved: number;
}

export function parseSound(bytes: Uint8Array, id: number): SoundEntry | null {
  if (bytes.byteLength < SOUND_HEADER_LENGTH) {
    return null;
  }
  const nameBytes = bytes.subarray(0, SOUND_NAME_LENGTH);
  let end = nameBytes.length;
  for (let i = 0; i < nameBytes.length; i++) {
    if (nameBytes[i] === 0) {
      end = i;
      break;
    }
  }
  const name = new TextDecoder('ascii').decode(nameBytes.subarray(0, end));
  return { id, name, wave: bytes.slice(SOUND_HEADER_LENGTH) };
}

export function parseSoundIndex(bytes: Uint8Array): SoundIndexEntry[] {
  const count = Math.floor(bytes.byteLength / 16);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: SoundIndexEntry[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * 16;
    entries[i] = {
      lookup: view.getInt32(base, true),
      length: view.getInt32(base + 4, true),
      index: view.getUint16(base + 8, true),
      reserved: view.getUint16(base + 10, true)
    };
  }
  return entries;
}

export function wavBytes(wave: Uint8Array): Uint8Array {
  const out = new Uint8Array(44 + wave.byteLength);
  const view = new DataView(out.buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      out[offset + i] = text.charCodeAt(i);
    }
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, wave.byteLength + 36, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 22050, true);
  view.setUint32(28, 44100, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, wave.byteLength, true);
  out.set(wave, 44);
  return out;
}

export function soundSeconds(wave: Uint8Array): number {
  return wave.byteLength / (22050 * 2);
}

export function encodeSoundEntry(name: string, wave: Uint8Array): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const bytes = new Uint8Array(SOUND_HEADER_LENGTH + wave.byteLength);
  bytes.set(nameBytes.subarray(0, SOUND_NAME_LENGTH), 0);
  bytes.set(wave, SOUND_HEADER_LENGTH);
  return bytes;
}

export function parseSoundDef(text: string): Map<number, number> {
  const table = new Map<number, number>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const match = /^(-?\d+)\s+(-?\d+)/.exec(line);
    if (match) {
      table.set(Number(match[1]), Number(match[2]));
    }
  }
  return table;
}
