import type { WritableFile } from '../writable';
import {
  type ItemTileData,
  type LandTileData,
  parseTileData,
  serializeTileData,
  type TileDataFile,
  type TileDataFormat
} from './formats';

export class TileDataSource {
  readonly format: TileDataFormat;
  readonly land: LandTileData[];
  readonly items: ItemTileData[];
  private readonly parsed: TileDataFile;
  private readonly file: WritableFile;
  private readonly modifiedLand = new Set<number>();
  private readonly modifiedItems = new Set<number>();

  constructor(bytes: Uint8Array, file: WritableFile) {
    this.parsed = parseTileData(bytes);
    this.format = this.parsed.format;
    this.land = this.parsed.land;
    this.items = this.parsed.items;
    this.file = file;
  }

  updateItem(index: number, patch: Partial<ItemTileData>): void {
    const tile = this.items[index];
    if (!tile) {
      throw new RangeError(`item index ${index} out of range`);
    }
    Object.assign(tile, patch);
    this.modifiedItems.add(index);
  }

  updateLand(index: number, patch: Partial<LandTileData>): void {
    const tile = this.land[index];
    if (!tile) {
      throw new RangeError(`land index ${index} out of range`);
    }
    Object.assign(tile, patch);
    this.modifiedLand.add(index);
  }

  isModified(kind: 'items' | 'land', index: number): boolean {
    return kind === 'items' ? this.modifiedItems.has(index) : this.modifiedLand.has(index);
  }

  get modifiedCount(): number {
    return this.modifiedLand.size + this.modifiedItems.size;
  }

  get hasChanges(): boolean {
    return this.modifiedCount > 0;
  }

  async save(): Promise<void> {
    if (!this.hasChanges) {
      return;
    }
    const bytes = serializeTileData({
      format: this.format,
      landHeaders: this.parsed.landHeaders,
      itemHeaders: this.parsed.itemHeaders,
      land: this.land,
      items: this.items
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

    this.modifiedItems.clear();
    this.modifiedLand.clear();
  }
}
