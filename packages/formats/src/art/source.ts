import {
  type ByteSource,
  hashFileName,
  MemoryWriteSink,
  type MulEntry,
  parseMulIndex,
  readMulEntry,
  serializeMulIndex,
  type UopContainer,
  UopContainerWriter,
  type UopEntry,
  uopEntryName
} from '@sosarium/core';

import type { WritableFile } from '../writable';
import type { ArtTile } from './land';
import { decodeLandTile, encodeLandTile, encodeUopLandEntry, UOP_LAND_BYTES } from './land';
import { decodeStaticArt, encodeStaticArt } from './static';

export type { WritableFile } from '../writable';

export interface ArtSource {
  readonly kind: 'mul' | 'uop';
  hasLand(index: number): boolean;
  hasStatic(index: number): boolean;
  readLand(index: number): Promise<ArtTile | null>;
  readStatic(index: number): Promise<ArtTile | null>;
  writeLand(index: number, tile: ArtTile): void;
  writeStatic(index: number, tile: ArtTile): void;
  isModified(kind: 'land' | 'static', index: number): boolean;
  readonly hasChanges: boolean;
  save(): Promise<void>;
}

export const LAND_COUNT = 0x4000;
export const STATIC_COUNT = 0x10000;

export class MulArtSource implements ArtSource {
  readonly kind = 'mul' as const;
  private readonly entries: (MulEntry | undefined)[];
  private readonly data: ByteSource;
  private dataLength: number;
  private readonly artFile: WritableFile;
  private readonly idxFile: WritableFile;
  private readonly modifiedLand = new Map<number, Uint8Array>();
  private readonly modifiedStatic = new Map<number, Uint8Array>();

  constructor(options: { idxBytes: Uint8Array; data: ByteSource; artFile: WritableFile; idxFile: WritableFile }) {
    this.entries = parseMulIndex(options.idxBytes);
    this.data = options.data;
    this.dataLength = options.data.byteLength;
    this.artFile = options.artFile;
    this.idxFile = options.idxFile;
  }

  hasLand(index: number): boolean {
    if (index < 0 || index >= LAND_COUNT) {
      return false;
    }
    return this.modifiedLand.has(index) || this.entries[index] !== undefined;
  }

  hasStatic(index: number): boolean {
    if (index < 0 || index >= STATIC_COUNT) {
      return false;
    }
    return this.modifiedStatic.has(index) || this.entries[index + LAND_COUNT] !== undefined;
  }

  async readLand(index: number): Promise<ArtTile | null> {
    const pending = this.modifiedLand.get(index);
    if (pending) {
      return decodeLandTile(pending);
    }
    const entry = this.entries[index];
    if (!entry) {
      return null;
    }
    return decodeLandTile(await readMulEntry(this.data, entry));
  }

  async readStatic(index: number): Promise<ArtTile | null> {
    const pending = this.modifiedStatic.get(index);
    if (pending) {
      return decodeStaticArt(pending);
    }
    const entry = this.entries[index + LAND_COUNT];
    if (!entry) {
      return null;
    }
    return decodeStaticArt(await readMulEntry(this.data, entry));
  }

  writeLand(index: number, tile: ArtTile): void {
    this.modifiedLand.set(index, encodeLandTile(tile));
  }

  writeStatic(index: number, tile: ArtTile): void {
    this.modifiedStatic.set(index, encodeStaticArt(tile));
  }

  isModified(kind: 'land' | 'static', index: number): boolean {
    return kind === 'land' ? this.modifiedLand.has(index) : this.modifiedStatic.has(index);
  }

  get hasChanges(): boolean {
    return this.modifiedLand.size > 0 || this.modifiedStatic.size > 0;
  }

  async save(): Promise<void> {
    if (!this.hasChanges) {
      return;
    }
    await this.artFile.open(true);
    await this.idxFile.open(true);
    try {
      for (const [index, bytes] of this.modifiedLand) {
        const entry = this.entries[index];
        if (entry && entry.length === bytes.byteLength) {
          await this.artFile.writeAt(entry.lookup, bytes);
        } else {
          const position = this.dataLength;
          this.dataLength += bytes.byteLength;
          await this.artFile.writeAt(position, bytes);
          this.entries[index] = { lookup: position, length: bytes.byteLength, extra: entry?.extra ?? 0 };
        }
      }

      for (const [index, bytes] of this.modifiedStatic) {
        const slot = index + LAND_COUNT;
        const entry = this.entries[slot];
        const position = this.dataLength;
        this.dataLength += bytes.byteLength;
        await this.artFile.writeAt(position, bytes);
        this.entries[slot] = { lookup: position, length: bytes.byteLength, extra: entry?.extra ?? 0 };
      }

      await this.idxFile.writeAt(0, serializeMulIndex(this.entries));
    } finally {
      await this.artFile.close();
      await this.idxFile.close();
    }
    this.modifiedLand.clear();
    this.modifiedStatic.clear();
  }
}

export interface UopArtSourceOptions {
  container: UopContainer;
  readEntry: (entry: UopEntry) => Promise<Uint8Array>;
  file: WritableFile;
  pattern: string;
  layout: 'v4' | 'v5';
}

export class UopArtSource implements ArtSource {
  readonly kind = 'uop' as const;
  private readonly container: UopContainer;
  private readonly readEntry: UopArtSourceOptions['readEntry'];
  private readonly file: WritableFile;
  private readonly pattern: string;
  private readonly layout: 'v4' | 'v5';
  private readonly landEntry = new Map<number, UopEntry>();
  private readonly staticEntry = new Map<number, UopEntry>();
  private readonly modifiedLand = new Map<number, Uint8Array>();
  private readonly modifiedStatic = new Map<number, Uint8Array>();

  constructor(options: UopArtSourceOptions) {
    this.container = options.container;
    this.readEntry = options.readEntry;
    this.file = options.file;
    this.pattern = options.pattern;
    this.layout = options.layout;

    for (let index = 0; index < LAND_COUNT + STATIC_COUNT; index++) {
      const entry = this.container.byIdentifier.get(hashFileName(uopEntryName(this.pattern, index, 'tga')));
      if (!entry) {
        continue;
      }
      if (index < LAND_COUNT) {
        this.landEntry.set(index, entry);
      } else {
        this.staticEntry.set(index - LAND_COUNT, entry);
      }
    }
  }

  hasLand(index: number): boolean {
    return this.modifiedLand.has(index) || this.landEntry.has(index);
  }

  hasStatic(index: number): boolean {
    return this.modifiedStatic.has(index) || this.staticEntry.has(index);
  }

  async readLand(index: number): Promise<ArtTile | null> {
    const pending = this.modifiedLand.get(index);
    if (pending) {
      return decodeLandTile(pending);
    }
    const entry = this.landEntry.get(index);
    return entry ? decodeLandTile(await this.readEntry(entry)) : null;
  }

  async readStatic(index: number): Promise<ArtTile | null> {
    const pending = this.modifiedStatic.get(index);
    if (pending) {
      return decodeStaticArt(pending);
    }
    const entry = this.staticEntry.get(index);
    return entry ? decodeStaticArt(await this.readEntry(entry)) : null;
  }

  writeLand(index: number, tile: ArtTile): void {
    this.modifiedLand.set(index, encodeUopLandEntry(tile));
  }

  writeStatic(index: number, tile: ArtTile): void {
    this.modifiedStatic.set(index, encodeStaticArt(tile));
  }

  isModified(kind: 'land' | 'static', index: number): boolean {
    return kind === 'land' ? this.modifiedLand.has(index) : this.modifiedStatic.has(index);
  }

  get hasChanges(): boolean {
    return this.modifiedLand.size > 0 || this.modifiedStatic.size > 0;
  }

  async save(): Promise<void> {
    if (!this.hasChanges) {
      return;
    }

    const replaced = new Map<number, Uint8Array>();
    for (const [index, bytes] of this.modifiedLand) {
      const entry = this.landEntry.get(index);
      if (entry) {
        replaced.set(entry.index, bytes);
      }
    }
    for (const [index, bytes] of this.modifiedStatic) {
      const entry = this.staticEntry.get(index);
      if (entry) {
        replaced.set(entry.index, bytes);
      }
    }

    const addedLand = [...this.modifiedLand.keys()].filter((index) => !this.landEntry.has(index));
    const addedStatic = [...this.modifiedStatic.keys()].filter((index) => !this.staticEntry.has(index));
    const newEntryCount = this.container.entryCount + addedLand.length + addedStatic.length;

    const sink = new MemoryWriteSink();
    const writer = new UopContainerWriter(sink, this.layout, newEntryCount);
    await writer.writeHeader();

    for (const entry of this.container.entries) {
      const payload = replaced.get(entry.index) ?? (await this.readEntry(entry));
      await writer.writeEntry(entry.identifier, payload, 0);
    }
    for (const index of addedLand) {
      await writer.writeEntry(
        hashFileName(uopEntryName(this.pattern, index, 'tga')),
        this.modifiedLand.get(index) as Uint8Array,
        0
      );
    }
    for (const index of addedStatic) {
      await writer.writeEntry(
        hashFileName(uopEntryName(this.pattern, index + LAND_COUNT, 'tga')),
        this.modifiedStatic.get(index) as Uint8Array,
        0
      );
    }
    await writer.complete();

    const bytes = sink.view();
    await this.file.open(false);
    try {
      const chunkSize = 4 * 1024 * 1024;
      for (let position = 0; position < bytes.byteLength; position += chunkSize) {
        await this.file.writeAt(position, bytes.subarray(position, Math.min(position + chunkSize, bytes.byteLength)));
      }
    } finally {
      await this.file.close();
    }

    this.modifiedLand.clear();
    this.modifiedStatic.clear();
  }
}

export { UOP_LAND_BYTES };
