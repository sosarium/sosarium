import { zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { MemoryByteSource } from './byte-source';
import { entryByIdentifier, hashFileName, readUopContainer, readUopEntryData, uopEntryName } from './uop';
import { MemoryWriteSink, UopContainerWriter } from './uop-writer';

describe('UopContainerWriter', () => {
  it('writes a v4 container readable by the reader', async () => {
    const sink = new MemoryWriteSink();
    const writer = new UopContainerWriter(sink, 'v4', 2);
    await writer.writeHeader();

    const stored = new TextEncoder().encode('stored payload');
    const compressedSource = new TextEncoder().encode('payload that should be compressed after zlib');
    const compressed = zlibSync(compressedSource);

    await writer.writeEntry(hashFileName('build/testlegacymul/00000000.dat'), stored, 0);
    await writer.writeEntry(
      hashFileName('build/testlegacymul/00000001.dat'),
      compressed,
      1,
      compressedSource.byteLength
    );
    await writer.complete();

    const container = await readUopContainer(new MemoryByteSource(sink.toBytes()));
    expect(container.version).toBe(4);
    expect(container.entryCount).toBe(2);

    const first = entryByIdentifier(container, 'build/testlegacymul/00000000.dat');
    expect(first).toBeDefined();
    const firstData = await readUopEntryData(new MemoryByteSource(sink.toBytes()), first as NonNullable<typeof first>);
    expect(new TextDecoder().decode(firstData)).toBe('stored payload');

    const second = entryByIdentifier(container, 'build/testlegacymul/00000001.dat');
    expect(second).toBeDefined();
    expect(second?.compressionFlag).toBe(1);
    const secondData = await readUopEntryData(
      new MemoryByteSource(sink.toBytes()),
      second as NonNullable<typeof second>
    );
    expect(new TextDecoder().decode(secondData)).toBe('payload that should be compressed after zlib');
  });

  it('spans multiple v5 blocks and preserves every payload', async () => {
    const sink = new MemoryWriteSink();
    const count = 1001;
    const writer = new UopContainerWriter(sink, 'v5', count);
    await writer.writeHeader();

    for (let i = 0; i < count; i++) {
      const payload = new Uint8Array(16 + (i % 7));
      payload.fill(i & 0xff);
      await writer.writeEntry(hashFileName(uopEntryName('map0legacymul', i, 'dat')), payload);
    }
    await writer.complete();

    const bytes = sink.toBytes();
    const container = await readUopContainer(new MemoryByteSource(bytes));
    expect(container.entryCount).toBe(count);

    const source = new MemoryByteSource(bytes);
    for (const index of [0, 999, 1000]) {
      const entry = entryByIdentifier(container, uopEntryName('map0legacymul', index, 'dat'));
      expect(entry, `entry ${index}`).toBeDefined();
      const data = await readUopEntryData(source, entry as NonNullable<typeof entry>);
      expect(data.byteLength).toBe(16 + (index % 7));
      expect(data[0]).toBe(index & 0xff);
    }
  });

  it('refuses to complete with fewer entries than declared', async () => {
    const sink = new MemoryWriteSink();
    const writer = new UopContainerWriter(sink, 'v4', 2);
    await writer.writeHeader();
    await writer.writeEntry(hashFileName('build/testlegacymul/00000000.dat'), new Uint8Array(4));
    await expect(writer.complete()).rejects.toThrow('1 entries written');
  });

  it('refuses more entries than declared', async () => {
    const sink = new MemoryWriteSink();
    const writer = new UopContainerWriter(sink, 'v4', 1);
    await writer.writeHeader();
    await writer.writeEntry(hashFileName('a'), new Uint8Array(4));
    await expect(writer.writeEntry(hashFileName('b'), new Uint8Array(4))).rejects.toThrow('more entries');
  });
});
