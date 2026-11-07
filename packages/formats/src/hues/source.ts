import type { WritableFile } from '../writable';
import { type HueFile, type HueGroup, parseHues, serializeHues } from './format';

export class HueDataSource {
  readonly hues: HueGroup[];
  readonly blockCount: number;
  private readonly parsed: HueFile;
  private readonly file: WritableFile;
  private readonly modified = new Set<number>();

  constructor(bytes: Uint8Array, file: WritableFile) {
    this.parsed = parseHues(bytes);
    this.hues = this.parsed.hues;
    this.blockCount = this.parsed.headers.length;
    this.file = file;
  }

  update(index: number, patch: Partial<HueGroup>): void {
    const hue = this.hues[index];
    if (!hue) {
      throw new RangeError(`hue index ${index} out of range`);
    }
    Object.assign(hue, patch);
    this.modified.add(index);
  }

  setColor(index: number, slot: number, color: number): void {
    const hue = this.hues[index];
    if (!hue || slot < 0 || slot >= 32) {
      throw new RangeError(`hue slot ${slot} out of range`);
    }
    hue.colors[slot] = color & 0x7fff;
    this.modified.add(index);
  }

  isModified(index: number): boolean {
    return this.modified.has(index);
  }

  get modifiedCount(): number {
    return this.modified.size;
  }

  get hasChanges(): boolean {
    return this.modified.size > 0;
  }

  async save(): Promise<void> {
    if (!this.hasChanges) {
      return;
    }
    const bytes = serializeHues({
      headers: this.parsed.headers,
      hues: this.hues
    });

    await this.file.open(false);
    try {
      const chunkSize = 4 * 1024 * 1024;
      for (let position = 0; position < bytes.byteLength; position += chunkSize) {
        await this.file.writeAt(position, bytes.subarray(position, Math.min(position + chunkSize, bytes.byteLength)));
      }
    } finally {
      await this.file.close();
    }

    this.modified.clear();
  }
}
