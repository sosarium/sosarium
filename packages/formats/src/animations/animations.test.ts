import { parseMulIndex, readUopContainer, readUopEntryData } from '@sosarium/core';
import { hasAssets, loadAsset } from '@sosarium/core/testing';
import { describe, expect, it } from 'vitest';

import { decodeLegacyAnimationGroup, decodeUopAnimationEntry, emptyFrame, FRAME_HEADER_SENTINEL } from './frames';
import { LegacyAnimationSource } from './legacy';
import { parseAnimationSequence } from './sequence';
import { AnimationSource } from './source';
import { AnimationUopSource } from './uop';

const DOUBLE_XOR = 0x80200000;

function writeRunHeader(view: DataView, offset: number, x: number, y: number, length: number): void {
  view.setUint32(offset, ((x << 22) | (y << 12) | length) ^ DOUBLE_XOR, true);
}

function buildLegacyGroup(directionFlipped = false): Uint8Array {
  const frameLength = 8 + 4 + 3;
  const bytes = new Uint8Array(520 + 4 + frameLength);
  const view = new DataView(bytes.buffer);
  view.setUint16(5 * 2, 0x1234, true);
  view.setInt32(512, 1, true);
  view.setInt32(516, 8, true);
  view.setInt16(520, 0x200, true);
  view.setInt16(522, 0x1fc, true);
  view.setUint16(524, 8, true);
  view.setUint16(526, 4, true);
  writeRunHeader(view, 528, 1, 2, 3);
  bytes.set([5, 5, 5], 532);
  view.setUint32(535, FRAME_HEADER_SENTINEL, true);
  void directionFlipped;
  return bytes;
}

function buildUopEntry(): Uint8Array {
  const headerTable = 10 * 16;
  const frameSize = 512 + 8 + 4 + 2 + 4;
  const dataStart = 40;
  const frameDataStart = dataStart + headerTable;
  const total = frameDataStart + 10 * frameSize;
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setUint32(32, 10, true);
  view.setUint32(36, dataStart, true);

  for (let i = 0; i < 10; i++) {
    const headerOffset = dataStart + i * 16;
    view.setUint16(headerOffset, 0, true);
    view.setUint16(headerOffset + 2, i + 1, true);
    view.setBigInt64(headerOffset + 4, 0n, true);
    view.setUint32(headerOffset + 12, frameDataStart + i * frameSize - headerOffset, true);
  }

  for (let i = 0; i < 10; i++) {
    const frameStart = frameDataStart + i * frameSize;
    view.setUint16(frameStart + 7 * 2, 0x2345, true);
    view.setInt16(frameStart + 512, 0x200, true);
    view.setInt16(frameStart + 514, 0x1fc, true);
    view.setUint16(frameStart + 516, 4, true);
    view.setUint16(frameStart + 518, 4, true);
    writeRunHeader(view, frameStart + 520, 0, 0, 2);
    bytes.set([7, 7], frameStart + 524);
    view.setUint32(frameStart + 526, FRAME_HEADER_SENTINEL, true);
  }

  return bytes;
}

describe('animation frame decoding', () => {
  it('decodes a legacy group with palette, lookups and runs', () => {
    const frames = decodeLegacyAnimationGroup(buildLegacyGroup(), false);
    expect(frames).toHaveLength(1);
    const frame = frames?.[0];
    expect(frame?.width).toBe(8);
    expect(frame?.height).toBe(4);
    expect(frame?.centerX).toBe(0x200);
    expect(frame?.centerY).toBe(0x1fc);
    expect(frame?.pixels[2 * 8 + 1]).toBe(0x9234);
    expect(frame?.pixels[2 * 8 + 2]).toBe(0x9234);
    expect(frame?.pixels[2 * 8 + 3]).toBe(0x9234);
    expect(frame?.pixels[0]).toBe(0);
  });

  it('mirrors runs for flipped directions', () => {
    const frames = decodeLegacyAnimationGroup(buildLegacyGroup(), true);
    const frame = frames?.[0];
    expect(frame?.centerX).toBe(8 - 0x200);
    expect(frame?.pixels[2 * 8 + 7]).toBe(0x9234);
    expect(frame?.pixels[2 * 8 + 6]).toBe(0x9234);
  });

  it('decodes a uop entry with gap-filled frame tables per direction', () => {
    const frames = decodeUopAnimationEntry(buildUopEntry(), 1, false);
    expect(frames).toHaveLength(2);
    for (const frame of frames ?? []) {
      expect(frame.width).toBe(4);
      expect(frame.pixels[0]).toBe(0xa345);
      expect(frame.pixels[1]).toBe(0xa345);
    }
  });

  it('returns empty frames for invalid headers', () => {
    expect(decodeUopAnimationEntry(new Uint8Array(10), 0, false)).toBeNull();
    expect(emptyFrame().width).toBe(0);
  });
});

describe('animation sequence parsing', () => {
  it('reads action replacements and skips variable lists', () => {
    const bytes = new Uint8Array(56 + 64 + 4 + 4);
    const view = new DataView(bytes.buffer);
    view.setInt32(52, 1, true);
    view.setInt32(56, 3, true);
    view.setInt32(60, 0, true);
    view.setInt32(64, 5, true);
    const replacements = parseAnimationSequence(bytes);
    expect(replacements[3]).toBe(5);
    expect(replacements[4]).toBe(4);
  });

  it('returns identity mappings for short data', () => {
    const replacements = parseAnimationSequence(new Uint8Array(8));
    expect(replacements[7]).toBe(7);
    expect(replacements).toHaveLength(80);
  });
});

describe.skipIf(!hasAssets())('animations (real client files)', () => {
  it('discovers bodies and decodes uop frames', async () => {
    const files = [] as {
      name: string;
      container: Awaited<ReturnType<typeof readUopContainer>>;
      readEntry: (entry: Parameters<typeof readUopEntryData>[1]) => Promise<Uint8Array>;
    }[];
    for (const index of [1, 2, 3, 4, 6]) {
      const source = loadAsset(`AnimationFrame${index}.uop`);
      files.push({
        name: `AnimationFrame${index}.uop`,
        container: await readUopContainer(source),
        readEntry: (entry) => readUopEntryData(source, entry)
      });
    }
    const uop = new AnimationUopSource(files, null);

    const bodies = uop.bodies();
    expect(bodies.length).toBeGreaterThan(50);

    const body = bodies.find((candidate) => uop.actions(candidate).length > 0);
    expect(body).toBeDefined();
    const frames = await uop.read(body as number, uop.actions(body as number)[0] as number, 0);
    expect(frames).not.toBeNull();
    expect((frames as NonNullable<typeof frames>).length).toBeGreaterThan(0);
    const withPixels = (frames as NonNullable<typeof frames>).find((frame) => frame.width > 0);
    expect(withPixels).toBeDefined();
    const opaque = (withPixels?.pixels ?? new Uint16Array(0)).reduce(
      (count, value) => count + (value & 0x8000 ? 1 : 0),
      0
    );
    expect(opaque).toBeGreaterThan(0);
  });

  it('parses real sequence replacements', async () => {
    const framesSource = loadAsset('AnimationFrame1.uop');
    const sequenceSource = loadAsset('AnimationSequence.uop');
    const sequenceContainer = await readUopContainer(sequenceSource);
    const uop = new AnimationUopSource(
      [
        {
          name: 'AnimationFrame1.uop',
          container: await readUopContainer(framesSource),
          readEntry: (entry) => readUopEntryData(framesSource, entry)
        }
      ],
      {
        name: 'AnimationSequence.uop',
        container: sequenceContainer,
        readEntry: (entry) => readUopEntryData(sequenceSource, entry)
      }
    );
    await uop.loadSequences();

    const body1253 = uop.sequenceReplacements(1253);
    if (body1253) {
      expect(body1253[2]).toBe(0);
      expect(body1253[3]).toBe(1);
      expect(body1253[42]).toBe(38);
    }
    const defined = uop.bodies().length;
    expect(defined).toBeGreaterThan(0);
  });

  it('reads legacy anim.mul frames through the index math', async () => {
    const idxBytes = await loadAsset('anim.idx').readAll();
    const data = loadAsset('anim.mul');
    const entries = parseMulIndex(idxBytes);
    const legacy = new LegacyAnimationSource([{ fileType: 1, entries, data }]);

    const bodies = legacy.bodies();
    expect(bodies.length).toBeGreaterThan(10);
    const body = bodies.includes(12) ? 12 : bodies[0];
    expect(body).toBeDefined();
    const frames = await legacy.read(body as number, 0, 0);
    expect(frames).not.toBeNull();
    expect((frames as NonNullable<typeof frames>).length).toBeGreaterThan(0);
    const withPixels = (frames as NonNullable<typeof frames>).find((frame) => frame.width > 0);
    expect(withPixels).toBeDefined();
  });

  it('combines uop and legacy sources', async () => {
    const frameSource = loadAsset('AnimationFrame1.uop');
    const uop = new AnimationUopSource(
      [
        {
          name: 'AnimationFrame1.uop',
          container: await readUopContainer(frameSource),
          readEntry: (entry) => readUopEntryData(frameSource, entry)
        }
      ],
      null
    );
    const legacy = new LegacyAnimationSource([
      { fileType: 1, entries: parseMulIndex(await loadAsset('anim.idx').readAll()), data: loadAsset('anim.mul') }
    ]);
    const combined = new AnimationSource(uop, legacy);
    expect(combined.kindLabel).toBe('UOP + MUL');
    const body = combined.bodies()[0];
    expect(body).toBeDefined();
    const frames = await combined.read(body as number, 0, 0);
    expect(frames).not.toBeNull();
  });
});
