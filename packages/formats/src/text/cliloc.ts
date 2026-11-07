import { clilocCompressedLength, mythicDecompress, wrapCompressedCliloc } from '@sosarium/core';

export interface ClilocEntry {
  number: number;
  flag: number;
  text: string;
}

export interface ClilocFile {
  language: string;
  compressed: boolean;
  header1: number;
  header2: number;
  entries: ClilocEntry[];
}

function parsePayload(data: Uint8Array, language: string, compressed: boolean): ClilocFile {
  if (data.byteLength < 6) {
    throw new Error(`cliloc ${language}: ${data.byteLength} bytes is smaller than the 6-byte header`);
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const header1 = view.getInt32(0, true);
  const header2 = view.getInt16(4, true);
  const decoder = new TextDecoder('utf-8');
  const entries: ClilocEntry[] = [];
  let cursor = 6;

  while (cursor < data.byteLength) {
    const remaining = data.byteLength - cursor;
    if (remaining < 7) {
      throw new Error(`cliloc ${language}: ${remaining} trailing byte(s) at offset 0x${cursor.toString(16)}`);
    }
    const number = view.getInt32(cursor, true);
    const flag = data[cursor + 4] as number;
    const length = view.getUint16(cursor + 5, true);
    cursor += 7;
    if (length > data.byteLength - cursor) {
      throw new Error(
        `cliloc ${language}: entry #${number} declares length ${length} but only ${data.byteLength - cursor} bytes remain`
      );
    }
    const text = decoder.decode(data.subarray(cursor, cursor + length));
    cursor += length;
    entries.push({ number, flag, text });
  }

  return { language, compressed, header1, header2, entries };
}

export function clilocIsCompressed(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 8) {
    return false;
  }
  const expected = clilocCompressedLength(bytes);
  if (expected < 6) {
    return false;
  }
  return expected <= bytes.byteLength * 4 && expected >= bytes.byteLength / 4;
}

export function parseCliloc(bytes: Uint8Array, language: string): ClilocFile {
  if (clilocIsCompressed(bytes)) {
    try {
      return parsePayload(mythicDecompress(bytes), language, true);
    } catch {
      return parsePayload(bytes, language, false);
    }
  }
  return parsePayload(bytes, language, false);
}

export function serializeCliloc(file: ClilocFile): Uint8Array {
  const sorted = [...file.entries].sort((a, b) => a.number - b.number);
  const encoder = new TextEncoder();
  const bodies: Uint8Array[] = [];
  let size = 6;
  for (const entry of sorted) {
    const encoded = encoder.encode(entry.text);
    const body = new Uint8Array(7 + encoded.byteLength);
    const view = new DataView(body.buffer);
    view.setInt32(0, entry.number, true);
    body[4] = entry.flag;
    view.setUint16(5, encoded.byteLength, true);
    body.set(encoded, 7);
    bodies.push(body);
    size += body.byteLength;
  }

  const payload = new Uint8Array(size);
  const payloadView = new DataView(payload.buffer);
  payloadView.setInt32(0, file.header1, true);
  payloadView.setInt16(4, file.header2, true);
  let position = 6;
  for (const body of bodies) {
    payload.set(body, position);
    position += body.byteLength;
  }

  return file.compressed ? wrapCompressedCliloc(payload) : payload;
}
