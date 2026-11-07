export class BinaryReader {
  private view: DataView;
  private pos = 0;
  private readonly littleEndian: boolean;

  constructor(
    private readonly bytes: Uint8Array,
    options: { littleEndian?: boolean } = {}
  ) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.littleEndian = options.littleEndian ?? false;
  }

  get offset(): number {
    return this.pos;
  }

  get remaining(): number {
    return this.bytes.byteLength - this.pos;
  }

  seek(position: number): void {
    this.assertRange(position, 0);
    this.pos = position;
  }

  skip(count: number): void {
    this.assertRange(this.pos, count);
    this.pos += count;
  }

  private assertRange(position: number, length: number): void {
    if (position < 0 || length < 0 || position + length > this.bytes.byteLength) {
      throw new RangeError(`read out of bounds: offset ${position} length ${length} of ${this.bytes.byteLength} bytes`);
    }
  }

  readU8(): number {
    this.assertRange(this.pos, 1);
    return this.view.getUint8(this.pos++);
  }

  readI8(): number {
    this.assertRange(this.pos, 1);
    return this.view.getInt8(this.pos++);
  }

  readU16(): number {
    this.assertRange(this.pos, 2);
    const value = this.view.getUint16(this.pos, this.littleEndian);
    this.pos += 2;
    return value;
  }

  readI16(): number {
    this.assertRange(this.pos, 2);
    const value = this.view.getInt16(this.pos, this.littleEndian);
    this.pos += 2;
    return value;
  }

  readU32(): number {
    this.assertRange(this.pos, 4);
    const value = this.view.getUint32(this.pos, this.littleEndian);
    this.pos += 4;
    return value;
  }

  readI32(): number {
    this.assertRange(this.pos, 4);
    const value = this.view.getInt32(this.pos, this.littleEndian);
    this.pos += 4;
    return value;
  }

  readF32(): number {
    this.assertRange(this.pos, 4);
    const value = this.view.getFloat32(this.pos, this.littleEndian);
    this.pos += 4;
    return value;
  }

  readU64(): bigint {
    this.assertRange(this.pos, 8);
    const value = this.view.getBigUint64(this.pos, this.littleEndian);
    this.pos += 8;
    return value;
  }

  readI64(): bigint {
    this.assertRange(this.pos, 8);
    const value = this.view.getBigInt64(this.pos, this.littleEndian);
    this.pos += 8;
    return value;
  }

  readBytes(length: number): Uint8Array {
    this.assertRange(this.pos, length);
    const slice = this.bytes.subarray(this.pos, this.pos + length);
    this.pos += length;
    return slice;
  }

  readAscii(length: number): string {
    const slice = this.readBytes(length);
    let end = slice.length;
    for (let i = 0; i < slice.length; i++) {
      if (slice[i] === 0) {
        end = i;
        break;
      }
    }
    let text = '';
    for (let i = 0; i < end; i++) {
      text += String.fromCharCode(slice[i] as number);
    }
    return text;
  }

  readAsciiNullTerminated(): string {
    let text = '';
    for (;;) {
      const byte = this.readU8();
      if (byte === 0) {
        return text;
      }
      text += String.fromCharCode(byte);
    }
  }

  readUtf16(length: number): string {
    const slice = this.readBytes(length * 2);
    const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
    let text = '';
    for (let i = 0; i < length; i++) {
      text += String.fromCharCode(view.getUint16(i * 2, this.littleEndian));
    }
    return text;
  }
}

export class BinaryWriter {
  private buffer: Uint8Array;
  private view: DataView;
  private pos = 0;
  private highWater = 0;
  private readonly littleEndian: boolean;

  constructor(initialCapacity = 1024, options: { littleEndian?: boolean } = {}) {
    this.buffer = new Uint8Array(initialCapacity);
    this.view = new DataView(this.buffer.buffer);
    this.littleEndian = options.littleEndian ?? false;
  }

  get offset(): number {
    return this.pos;
  }

  seek(position: number): void {
    if (position < 0 || position > this.buffer.byteLength) {
      throw new RangeError(`seek out of bounds: ${position}`);
    }
    this.pos = position;
  }

  private ensure(extra: number): void {
    this.highWater = Math.max(this.highWater, this.pos + extra);
    if (this.pos + extra <= this.buffer.byteLength) {
      return;
    }
    let capacity = this.buffer.byteLength * 2;
    while (capacity < this.pos + extra) {
      capacity *= 2;
    }
    const next = new Uint8Array(capacity);
    next.set(this.buffer);
    this.buffer = next;
    this.view = new DataView(next.buffer);
  }

  writeU8(value: number): void {
    this.ensure(1);
    this.view.setUint8(this.pos++, value & 0xff);
  }

  writeI8(value: number): void {
    this.ensure(1);
    this.view.setInt8(this.pos++, value);
  }

  writeU16(value: number): void {
    this.ensure(2);
    this.view.setUint16(this.pos, value & 0xffff, this.littleEndian);
    this.pos += 2;
  }

  writeI16(value: number): void {
    this.ensure(2);
    this.view.setInt16(this.pos, value, this.littleEndian);
    this.pos += 2;
  }

  writeU32(value: number): void {
    this.ensure(4);
    this.view.setUint32(this.pos, value >>> 0, this.littleEndian);
    this.pos += 4;
  }

  writeI32(value: number): void {
    this.ensure(4);
    this.view.setInt32(this.pos, value | 0, this.littleEndian);
    this.pos += 4;
  }

  writeU64(value: bigint): void {
    this.ensure(8);
    this.view.setBigUint64(this.pos, value, this.littleEndian);
    this.pos += 8;
  }

  writeI64(value: bigint): void {
    this.ensure(8);
    this.view.setBigInt64(this.pos, value, this.littleEndian);
    this.pos += 8;
  }

  writeBytes(bytes: Uint8Array): void {
    this.ensure(bytes.byteLength);
    this.buffer.set(bytes, this.pos);
    this.pos += bytes.byteLength;
  }

  writeAscii(text: string, fixedLength?: number): void {
    const length = fixedLength ?? text.length;
    this.ensure(length);
    for (let i = 0; i < length; i++) {
      this.buffer[this.pos++] = i < text.length ? text.charCodeAt(i) & 0xff : 0;
    }
  }

  writeAsciiNullTerminated(text: string): void {
    this.ensure(text.length + 1);
    for (let i = 0; i < text.length; i++) {
      this.buffer[this.pos++] = text.charCodeAt(i) & 0xff;
    }
    this.buffer[this.pos++] = 0;
  }

  writeUtf16(text: string): void {
    this.ensure(text.length * 2);
    for (let i = 0; i < text.length; i++) {
      this.view.setUint16(this.pos, text.charCodeAt(i), this.littleEndian);
      this.pos += 2;
    }
  }

  toBytes(): Uint8Array {
    return this.buffer.slice(0, this.highWater);
  }
}
