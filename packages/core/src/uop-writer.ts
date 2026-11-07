import {
  adler32,
  UOP_BLOCK_HEADER_SIZE,
  UOP_FILE_HEADER_SIZE,
  UOP_MAGIC,
  UOP_SIGNATURE,
  UOP_TABLE_ENTRY_SIZE
} from './uop';

export interface WriteSink {
  writeAt(position: number, data: Uint8Array): Promise<void>;
}

export class MemoryWriteSink implements WriteSink {
  private buffer = new Uint8Array(4096);
  private length = 0;

  get byteLength(): number {
    return this.length;
  }

  async writeAt(position: number, data: Uint8Array): Promise<void> {
    const end = position + data.byteLength;
    if (end > this.buffer.byteLength) {
      let capacity = this.buffer.byteLength * 2;
      while (capacity < end) {
        capacity *= 2;
      }
      const next = new Uint8Array(capacity);
      next.set(this.buffer);
      this.buffer = next;
    }
    this.buffer.set(data, position);
    this.length = Math.max(this.length, end);
  }

  toBytes(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }

  view(): Uint8Array {
    return this.buffer.subarray(0, this.length);
  }
}

export type UopLayout = 'v4' | 'v5';

const LAYOUTS: Record<UopLayout, { version: number; firstBlock: number; blockCapacity: number }> = {
  v4: { version: 4, firstBlock: 0x28, blockCapacity: 0x64 },
  v5: { version: 5, firstBlock: 0x200, blockCapacity: 0x3e8 }
};

interface TableEntry {
  offset: number;
  headerLength: number;
  size: number;
  decompressedSize: number;
  identifier: bigint;
  adler: number;
  compressionFlag: number;
}

export class UopContainerWriter {
  private readonly sink: WriteSink;
  private readonly layout: UopLayout;
  private readonly entryCount: number;
  private readonly blockCapacity: number;
  private readonly table: TableEntry[] = [];
  private position = 0;
  private entriesWritten = 0;
  private blockStart = -1;
  private completed = false;

  constructor(sink: WriteSink, layout: UopLayout, entryCount: number) {
    this.sink = sink;
    this.layout = layout;
    this.entryCount = entryCount;
    this.blockCapacity = LAYOUTS[layout].blockCapacity;
  }

  private async write(data: Uint8Array): Promise<void> {
    await this.sink.writeAt(this.position, data);
    this.position += data.byteLength;
  }

  async writeHeader(): Promise<void> {
    const config = LAYOUTS[this.layout];
    const header = new Uint8Array(config.firstBlock);
    const view = new DataView(header.buffer);
    view.setUint32(0, UOP_MAGIC, true);
    view.setUint32(4, config.version, true);
    view.setUint32(8, UOP_SIGNATURE, true);
    view.setBigUint64(12, BigInt(config.firstBlock), true);
    view.setUint32(20, this.blockCapacity, true);
    view.setUint32(24, this.entryCount, true);
    await this.write(header);
  }

  async writeEntry(
    identifier: bigint,
    payload: Uint8Array,
    compressionFlag = 0,
    decompressedSize?: number
  ): Promise<void> {
    if (this.completed) {
      throw new Error('UOP container already completed');
    }
    if (this.entriesWritten >= this.entryCount) {
      throw new Error(`more entries written than the declared ${this.entryCount}`);
    }
    if (this.blockStart < 0) {
      await this.beginBlock();
    }

    const entry: TableEntry = {
      offset: this.position,
      headerLength: 0,
      size: payload.byteLength,
      decompressedSize: decompressedSize ?? payload.byteLength,
      identifier,
      adler: adler32(payload),
      compressionFlag
    };
    await this.write(payload);
    this.table.push(entry);
    this.entriesWritten++;

    if (this.table.length === this.blockCapacity) {
      await this.endBlock(this.entriesWritten < this.entryCount);
    }
  }

  async complete(): Promise<void> {
    if (this.completed) {
      return;
    }
    if (this.entriesWritten !== this.entryCount) {
      throw new Error(`${this.entriesWritten} entries written but the header declares ${this.entryCount}`);
    }
    if (this.blockStart >= 0) {
      await this.endBlock(false);
    }
    this.completed = true;
  }

  private async beginBlock(): Promise<void> {
    this.blockStart = this.position;
    this.table.length = 0;

    const used = Math.min(this.blockCapacity, this.entryCount - this.entriesWritten);
    const header = new Uint8Array(UOP_BLOCK_HEADER_SIZE + this.blockCapacity * UOP_TABLE_ENTRY_SIZE);
    new DataView(header.buffer).setUint32(0, used, true);
    await this.write(header);
  }

  private async endBlock(moreToCome: boolean): Promise<void> {
    const afterBlock = this.position;

    if (moreToCome) {
      const pointer = new Uint8Array(8);
      new DataView(pointer.buffer).setBigUint64(0, BigInt(afterBlock), true);
      await this.sink.writeAt(this.blockStart + 4, pointer);
    }

    const table = new Uint8Array(this.blockCapacity * UOP_TABLE_ENTRY_SIZE);
    const view = new DataView(table.buffer);
    for (let i = 0; i < this.table.length; i++) {
      const entry = this.table[i] as TableEntry;
      const offset = i * UOP_TABLE_ENTRY_SIZE;
      view.setBigUint64(offset, BigInt(entry.offset), true);
      view.setInt32(offset + 8, entry.headerLength, true);
      view.setInt32(offset + 12, entry.size, true);
      view.setInt32(offset + 16, entry.decompressedSize, true);
      view.setBigUint64(offset + 20, entry.identifier, true);
      view.setUint32(offset + 28, entry.adler, true);
      view.setInt16(offset + 32, entry.compressionFlag, true);
    }
    await this.sink.writeAt(this.blockStart + UOP_BLOCK_HEADER_SIZE, table);

    this.blockStart = -1;
    this.table.length = 0;
    if (moreToCome) {
      await this.beginBlock();
    }
  }
}

export { UOP_BLOCK_HEADER_SIZE, UOP_FILE_HEADER_SIZE, UOP_TABLE_ENTRY_SIZE };
