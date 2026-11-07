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

import type { ArtTile } from '../art/land';
import type { WritableFile } from '../writable';
import {
  decodeGumpPayload,
  decodeUopGumpEntry,
  encodeGumpPayload,
  encodeUopGumpEntry,
  gumpDimensions,
  gumpExtra
} from './format';

export const GUMP_COUNT = 0x12000;
export const GUMP_UOP_PATTERN = 'gumpartlegacymul';

export interface GumpSource {
  readonly kind: 'mul' | 'uop';
  readonly count: number;
  has(index: number): boolean;
  read(index: number): Promise<ArtTile | null>;
  write(index: number, tile: ArtTile): void;
  isModified(index: number): boolean;
  readonly hasChanges: boolean;
  save(): Promise<void>;
}

export class MulGumpSource implements GumpSource {
  readonly kind = 'mul' as const;
  readonly count: number;
  private readonly entries: (MulEntry | undefined)[];
  private readonly data: ByteSource;
  private dataLength: number;
  private readonly gumpFile: WritableFile;
  private readonly idxFile: WritableFile;
  private readonly modified = new Map<number, { payload: Uint8Array; width: number; height: number }>();

  constructor(options: { idxBytes: Uint8Array; data: ByteSource; gumpFile: WritableFile; idxFile: WritableFile }) {
    this.entries = parseMulIndex(options.idxBytes);
    this.count = this.entries.length;
    this.data = options.data;
    this.dataLength = options.data.byteLength;
    this.gumpFile = options.gumpFile;
    this.idxFile = options.idxFile;
  }

  has(index: number): boolean {
    return this.modified.has(index) || this.entries[index] !== undefined;
  }

  async read(index: number): Promise<ArtTile | null> {
    const pending = this.modified.get(index);
    if (pending) {
      return decodeGumpPayload(pending.payload, pending.width, pending.height);
    }
    const entry = this.entries[index];
    if (!entry) {
      return null;
    }
    const { width, height } = gumpDimensions(entry.extra);
    return decodeGumpPayload(await readMulEntry(this.data, entry), width, height);
  }

  write(index: number, tile: ArtTile): void {
    this.modified.set(index, { payload: encodeGumpPayload(tile), width: tile.width, height: tile.height });
  }

  isModified(index: number): boolean {
    return this.modified.has(index);
  }

  get hasChanges(): boolean {
    return this.modified.size > 0;
  }

  async save(): Promise<void> {
    if (!this.hasChanges) {
      return;
    }
    await this.gumpFile.open(true);
    await this.idxFile.open(true);
    try {
      for (const [index, entry] of this.modified) {
        const position = this.dataLength;
        this.dataLength += entry.payload.byteLength;
        await this.gumpFile.writeAt(position, entry.payload);
        this.entries[index] = {
          lookup: position,
          length: entry.payload.byteLength,
          extra: gumpExtra(entry.width, entry.height)
        };
      }
      await this.idxFile.writeAt(0, serializeMulIndex(this.entries));
    } finally {
      await this.gumpFile.close();
      await this.idxFile.close();
    }
    this.modified.clear();
  }
}

export interface UopGumpSourceOptions {
  container: UopContainer;
  readEntry: (entry: UopEntry) => Promise<Uint8Array>;
  file: WritableFile;
  layout: 'v4' | 'v5';
}

export class UopGumpSource implements GumpSource {
  readonly kind = 'uop' as const;
  readonly count = GUMP_COUNT;
  private readonly container: UopContainer;
  private readonly readEntry: UopGumpSourceOptions['readEntry'];
  private readonly file: WritableFile;
  private readonly layout: 'v4' | 'v5';
  private readonly entries = new Map<number, UopEntry>();
  private readonly modified = new Map<number, Uint8Array>();

  constructor(options: UopGumpSourceOptions) {
    this.container = options.container;
    this.readEntry = options.readEntry;
    this.file = options.file;
    this.layout = options.layout;

    for (let index = 0; index < GUMP_COUNT; index++) {
      const entry =
        this.container.byIdentifier.get(hashFileName(uopEntryName(GUMP_UOP_PATTERN, index, 'tga'))) ??
        this.container.byIdentifier.get(hashFileName(uopEntryName(GUMP_UOP_PATTERN, index, 'tga', 7)));
      if (entry) {
        this.entries.set(index, entry);
      }
    }
  }

  has(index: number): boolean {
    return this.modified.has(index) || this.entries.has(index);
  }

  async read(index: number): Promise<ArtTile | null> {
    const pending = this.modified.get(index);
    if (pending) {
      return decodeUopGumpEntry(pending);
    }
    const entry = this.entries.get(index);
    return entry ? decodeUopGumpEntry(await this.readEntry(entry)) : null;
  }

  write(index: number, tile: ArtTile): void {
    this.modified.set(index, encodeUopGumpEntry(tile));
  }

  isModified(index: number): boolean {
    return this.modified.has(index);
  }

  get hasChanges(): boolean {
    return this.modified.size > 0;
  }

  async save(): Promise<void> {
    if (!this.hasChanges) {
      return;
    }

    const replaced = new Map<number, Uint8Array>();
    for (const [index, payload] of this.modified) {
      const entry = this.entries.get(index);
      if (entry) {
        replaced.set(entry.index, payload);
      }
    }
    const added = [...this.modified.keys()].filter((index) => !this.entries.has(index));
    const newEntryCount = this.container.entryCount + added.length;

    const sink = new MemoryWriteSink();
    const writer = new UopContainerWriter(sink, this.layout, newEntryCount);
    await writer.writeHeader();

    for (const entry of this.container.entries) {
      const payload = replaced.get(entry.index) ?? (await this.readEntry(entry));
      await writer.writeEntry(entry.identifier, payload, 0);
    }
    for (const index of added) {
      await writer.writeEntry(
        hashFileName(uopEntryName(GUMP_UOP_PATTERN, index, 'tga')),
        this.modified.get(index) as Uint8Array,
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

    this.modified.clear();
  }
}
