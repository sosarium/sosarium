export interface ByteSource {
  readonly byteLength: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export class MemoryByteSource implements ByteSource {
  constructor(private readonly bytes: Uint8Array) {}

  get byteLength(): number {
    return this.bytes.byteLength;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    if (offset < 0 || length < 0 || offset + length > this.bytes.byteLength) {
      throw new RangeError(`read out of bounds: offset ${offset} length ${length} of ${this.bytes.byteLength}`);
    }
    return this.bytes.subarray(offset, offset + length);
  }

  async readAll(): Promise<Uint8Array> {
    return this.bytes;
  }
}

export class BlobByteSource implements ByteSource {
  constructor(private readonly blob: Blob) {}

  get byteLength(): number {
    return this.blob.size;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    if (offset < 0 || length < 0 || offset + length > this.blob.size) {
      throw new RangeError(`read out of bounds: offset ${offset} length ${length} of ${this.blob.size}`);
    }
    return new Uint8Array(await this.blob.slice(offset, offset + length).arrayBuffer());
  }
}

export async function readAllBytes(source: ByteSource): Promise<Uint8Array> {
  return source.read(0, source.byteLength);
}
