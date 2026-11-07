import { parseMulIndex, readMulEntry } from '@sosarium/core';
import { hasAssets, loadAsset } from '@sosarium/core/testing';
import { describe, expect, it } from 'vitest';

import { parseAnimdata, serializeAnimdata } from './animdata';
import { parseBodyconvDef, resolveAnimationFile } from './bodyconv';
import {
  buildAnimationUopFile,
  buildLegacyAnimFiles,
  decodeEditGroup,
  decodeUopActionEntryForEdit,
  type EditGroup,
  EMPTY_EDIT_FRAME,
  encodeEditGroup,
  encodeUopActionEntry,
  pixelsFromFrame,
  runsFromPixels
} from './edit';
import { decodeUopAnimationEntry, emptyFrame } from './frames';

function makeGroup(): EditGroup {
  const palette = new Uint16Array(256);
  palette[5] = 0x9234;
  palette[6] = 0x9abc;
  const pixels = new Uint16Array(4 * 4);
  pixels[0 * 4 + 1] = 0x9234;
  pixels[0 * 4 + 2] = 0x9234;
  pixels[2 * 4 + 0] = 0x9abc;
  const runs = runsFromPixels(pixels, 4, 4, palette, 0x200, 0x1fc);
  return {
    palette,
    frames: [{ centerX: 0x200, centerY: 0x1fc, width: 4, height: 4, runs }]
  };
}

describe('animdata', () => {
  it('round-trips synthetic data', () => {
    const entries = new Map([
      [
        3,
        {
          frameData: new Int8Array(64).fill(7),
          unknown: 1,
          frameCount: 5,
          frameInterval: 2,
          frameStart: 1
        }
      ]
    ]);
    const bytes = serializeAnimdata({ entries, headers: [42], blockCount: 1, trailing: new Uint8Array([9, 9]) });
    const parsed = parseAnimdata(bytes);
    expect(parsed.entries.get(3)?.frameCount).toBe(5);
    expect(parsed.entries.get(3)?.frameData[63]).toBe(7);
    expect(parsed.headers).toEqual([42]);
    expect(Array.from(parsed.trailing)).toEqual([9, 9]);
  });
});

describe.skipIf(!hasAssets())('animdata (real file)', () => {
  it('round-trips the real animdata.mul byte-for-byte', async () => {
    const bytes = await loadAsset('animdata.mul').readAll();
    const parsed = parseAnimdata(bytes);
    const reserialized = serializeAnimdata(parsed);
    expect(reserialized.byteLength).toBe(bytes.byteLength);
    expect(Buffer.from(reserialized).equals(Buffer.from(bytes))).toBe(true);
    const withFrames = [...parsed.entries.values()].filter((entry) => entry.frameCount > 0);
    expect(withFrames.length).toBeGreaterThan(1000);
  });
});

describe('frame editing', () => {
  it('round-trips runs through pixels and back', () => {
    const group = makeGroup();
    const pixels = pixelsFromFrame(group.frames[0] as (typeof group.frames)[number], group.palette);
    expect(pixels[1]).toBe(0x9234);
    expect(pixels[2]).toBe(0x9234);
    expect(pixels[8]).toBe(0x9abc);
    const runs = runsFromPixels(pixels, 4, 4, group.palette, 0x200, 0x1fc);
    expect(runs).toHaveLength(2);
    expect(Array.from(runs[0]?.data ?? [])).toEqual([5, 5]);
    expect(Array.from(runs[1]?.data ?? [])).toEqual([6]);
  });

  it('encodes and decodes a legacy group symmetrically', () => {
    const group = makeGroup();
    const encoded = encodeEditGroup(group);
    expect(encoded).not.toBeNull();
    const decoded = decodeEditGroup(encoded as Uint8Array);
    expect(decoded.frames[0]?.width).toBe(4);
    expect(Array.from(decoded.frames[0]?.runs[0]?.data ?? [])).toEqual([5, 5]);
    expect(decoded.palette[5]).toBe(0x9234);
  });

  it('encodes a uop action entry readable by the player decoder', () => {
    const group = makeGroup();
    const emptyPalette = new Uint16Array(256);
    const payload = encodeUopActionEntry(
      [group, { palette: emptyPalette, frames: [EMPTY_EDIT_FRAME] }, null, null, null],
      7
    );
    const direction0 = decodeUopAnimationEntry(payload, 0, false);
    expect(direction0).toHaveLength(1);
    expect(direction0?.[0]?.width).toBe(4);
    expect(direction0?.[0]?.pixels[1]).toBe(0x9234);
    const direction1 = decodeUopAnimationEntry(payload, 1, false);
    expect(direction1?.[0]?.width).toBe(0);
    const direction2 = decodeUopAnimationEntry(payload, 2, false);
    expect(direction2?.[0]?.width).toBe(0);
    expect(emptyFrame().width).toBe(0);
  });
});

describe.skipIf(!hasAssets())('animation editing (real files)', () => {
  it('round-trips a real legacy group byte-for-byte', async () => {
    const entries = parseMulIndex(await loadAsset('anim.idx').readAll());
    const data = loadAsset('anim.mul');
    const entry = entries[12 * 110];
    expect(entry).toBeDefined();
    const bytes = await readMulEntry(data, entry as NonNullable<typeof entry>);
    const decoded = decodeEditGroup(bytes);
    const reencoded = encodeEditGroup(decoded);
    expect(reencoded).not.toBeNull();
    expect(Buffer.from(reencoded as Uint8Array).equals(Buffer.from(bytes))).toBe(true);
    expect(decoded.frames.length).toBeGreaterThan(0);
  });

  it('rebuilds an anim index with untouched entries byte-identical', async () => {
    const entries = parseMulIndex(await loadAsset('anim.idx').readAll());
    const data = loadAsset('anim.mul');
    const slice = entries.slice(0, 24);
    const originalIdx = new Uint8Array(24 * 12);
    const idxView = new DataView(originalIdx.buffer);

    let offset = 0;
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < slice.length; i++) {
      const entry = slice[i];
      if (!entry) {
        idxView.setInt32(i * 12, -1, true);
        idxView.setInt32(i * 12 + 4, -1, true);
        idxView.setInt32(i * 12 + 8, -1, true);
        continue;
      }
      const bytes = await readMulEntry(data, entry);
      idxView.setInt32(i * 12, offset, true);
      idxView.setInt32(i * 12 + 4, bytes.byteLength, true);
      idxView.setInt32(i * 12 + 8, entry.extra, true);
      chunks.push(bytes);
      offset += bytes.byteLength;
    }

    const rebuilt = await buildLegacyAnimFiles(slice, (lookup, length) => data.read(lookup, length), new Map());
    expect(Buffer.from(rebuilt.idx).equals(Buffer.from(originalIdx))).toBe(true);
    expect(rebuilt.mul.byteLength).toBe(offset);
    let position = 0;
    for (const chunk of chunks) {
      expect(Buffer.from(rebuilt.mul.slice(position, position + chunk.byteLength)).equals(Buffer.from(chunk))).toBe(
        true
      );
      position += chunk.byteLength;
    }
  });

  it('writes an edited group back through the rebuild path', async () => {
    const entries = parseMulIndex(await loadAsset('anim.idx').readAll());
    const data = loadAsset('anim.mul');
    const index = 12 * 110;
    const entry = entries[index] as NonNullable<(typeof entries)[number]>;
    const original = decodeEditGroup(await readMulEntry(data, entry));

    const edited: EditGroup = {
      palette: original.palette,
      frames: original.frames.map((frame, frameIndex) =>
        frameIndex === 0 ? { ...frame, runs: frame.runs.slice(0, Math.max(1, frame.runs.length - 1)) } : frame
      )
    };
    const rebuilt = await buildLegacyAnimFiles(
      entries.slice(index, index + 1),
      (lookup, length) => data.read(lookup, length),
      new Map([[0, edited]])
    );
    const lookup = new DataView(rebuilt.idx.buffer).getInt32(0, true);
    const length = new DataView(rebuilt.idx.buffer).getInt32(4, true);
    expect(lookup).toBe(0);
    const decoded = decodeEditGroup(rebuilt.mul.slice(0, length));
    expect(decoded.frames[0]?.runs.length).toBe(edited.frames[0]?.runs.length ?? 0);
  });
});

describe('bodyconv.def', () => {
  it('parses synthetic mappings with the 68 quirk', () => {
    const tables = parseBodyconvDef('# comment\n100 101 102 103 104 105\n200 68 -1 -1 -1 -1\n');
    expect(resolveAnimationFile(tables, 100)).toEqual({ fileType: 2, body: 101 });
    expect(resolveAnimationFile(tables, 200)).toEqual({ fileType: 2, body: 122 });
    expect(resolveAnimationFile(tables, 999)).toEqual({ fileType: 1, body: 999 });
  });

  it.skipIf(!hasAssets())('parses the real bodyconv.def', async () => {
    const text = new TextDecoder('latin1').decode(await loadAsset('Bodyconv.def').readAll());
    const tables = parseBodyconvDef(text);
    const mapped = [...(tables.byFileType.get(2) ?? new Map()).entries()];
    expect(mapped.length).toBeGreaterThan(100);
    const first = mapped[0] as [number, number];
    expect(resolveAnimationFile(tables, first[0])).toEqual({ fileType: 2, body: first[1] });
  });
});

describe.skipIf(!hasAssets())('uop action entry editing (real files)', () => {
  it('splits a real entry into direction groups and round-trips them', async () => {
    const source = loadAsset('AnimationFrame1.uop');
    const { readUopContainer, readUopEntryData, hashFileName } = await import('@sosarium/core');
    const container = await readUopContainer(source);
    const name = (body: number, action: number) =>
      `build/animationlegacyframe/${String(body).padStart(6, '0')}/${String(action).padStart(2, '0')}.bin`;

    let payload: Uint8Array | null = null;
    for (let body = 0; body < 0x800 && !payload; body++) {
      for (let action = 0; action < 80 && !payload; action++) {
        const entry = container.byIdentifier.get(hashFileName(name(body, action)));
        if (!entry) {
          continue;
        }
        const bytes = await readUopEntryData(source, entry);
        const groups = decodeUopActionEntryForEdit(bytes);
        const frames = decodeUopAnimationEntry(bytes, 0, false);
        if (groups[0] && (frames ?? []).some((frame) => frame.width > 0)) {
          payload = bytes;
          const reencoded = encodeUopActionEntry(groups, action);
          const decoded = decodeUopAnimationEntry(reencoded, 0, false);
          expect(decoded).toHaveLength((frames as NonNullable<typeof frames>).length);
          const original = frames as NonNullable<typeof frames>;
          for (let i = 0; i < original.length; i++) {
            expect(decoded?.[i]?.width).toBe(original[i]?.width);
            expect(decoded?.[i]?.height).toBe(original[i]?.height);
            expect(decoded?.[i]?.centerX).toBe(original[i]?.centerX);
            expect(Array.from(decoded?.[i]?.pixels ?? [])).toEqual(Array.from(original[i]?.pixels ?? []));
          }
        }
      }
    }
    expect(payload).not.toBeNull();
  });
});

describe.skipIf(!hasAssets())('uop rebuild integration', () => {
  it('saves an edited entry and preserves untouched entries through a full rewrite', async () => {
    const { readUopContainer, readUopEntryData, MemoryByteSource, hashFileName } = await import('@sosarium/core');
    const source = loadAsset('AnimationFrame1.uop');
    const container = await readUopContainer(source);
    const name = (body: number, action: number) =>
      `build/animationlegacyframe/${String(body).padStart(6, '0')}/${String(action).padStart(2, '0')}.bin`;

    const seeds: { hash: bigint; bytes: Uint8Array }[] = [];
    for (let body = 0; body < 0x800 && seeds.length < 3; body++) {
      for (let action = 0; action < 80 && seeds.length < 3; action++) {
        const entry = container.byIdentifier.get(hashFileName(name(body, action)));
        if (!entry) {
          continue;
        }
        const bytes = await readUopEntryData(source, entry);
        const groups = decodeUopActionEntryForEdit(bytes);
        const frames = decodeUopAnimationEntry(bytes, 0, false);
        if (groups[0] && (frames ?? []).some((frame) => frame.width > 0) && groups[0].frames.length > 1) {
          seeds.push({ hash: hashFileName(name(body, action)), bytes });
        }
      }
    }
    expect(seeds).toHaveLength(3);

    const editedSeed = seeds[0] as (typeof seeds)[number];
    const groups = decodeUopActionEntryForEdit(editedSeed.bytes);
    const firstFrame = (groups[0] as NonNullable<(typeof groups)[number]>).frames[0];
    if (firstFrame) {
      firstFrame.runs = firstFrame.runs.slice(0, Math.max(1, firstFrame.runs.length - 1));
    }
    const editedPayload = encodeUopActionEntry(groups, 0);

    const rebuilt = await buildAnimationUopFile(
      seeds.map((seed) => ({ hash: seed.hash, payload: seed.hash === editedSeed.hash ? editedPayload : seed.bytes })),
      container.version === 5 ? 5 : 4
    );

    const rebuiltContainer = await readUopContainer(new MemoryByteSource(rebuilt));
    expect(rebuiltContainer.entryCount).toBe(3);
    for (const seed of seeds) {
      const entry = rebuiltContainer.byIdentifier.get(seed.hash);
      expect(entry).toBeDefined();
      const payload = await readUopEntryData(new MemoryByteSource(rebuilt), entry as NonNullable<typeof entry>);
      if (seed.hash === editedSeed.hash) {
        const decoded = decodeUopAnimationEntry(payload, 0, false);
        expect(decoded?.[0]?.width).toBe(firstFrame?.width);
        expect(decoded?.[0]?.height).toBe(firstFrame?.height);
      } else {
        expect(Buffer.from(payload).equals(Buffer.from(seed.bytes))).toBe(true);
      }
    }
  });
});
