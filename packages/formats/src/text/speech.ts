export interface SpeechEntry {
  id: number;
  keyword: string;
}

export function parseSpeech(bytes: Uint8Array): SpeechEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('utf-8');
  const entries: SpeechEntry[] = [];
  let cursor = 0;

  while (cursor + 4 <= bytes.byteLength) {
    const id = view.getInt16(cursor, false);
    let length = view.getInt16(cursor + 2, false);
    cursor += 4;
    if (length > 128) {
      length = 128;
    }
    if (cursor + length > bytes.byteLength) {
      throw new Error(
        `speech.mul: entry ${id} declares length ${length} but only ${bytes.byteLength - cursor} bytes remain`
      );
    }
    entries.push({ id, keyword: decoder.decode(bytes.subarray(cursor, cursor + length)) });
    cursor += length;
  }

  return entries;
}

export function serializeSpeech(entries: SpeechEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (const entry of entries) {
    const keyword = encoder.encode(entry.keyword);
    const record = new Uint8Array(4 + keyword.byteLength);
    const view = new DataView(record.buffer);
    view.setInt16(0, entry.id, false);
    view.setInt16(2, keyword.byteLength, false);
    record.set(keyword, 4);
    chunks.push(record);
    size += record.byteLength;
  }

  const out = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.byteLength;
  }
  return out;
}
