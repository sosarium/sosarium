import { describe, expect, it } from 'vitest';

import { detectClientFlavor, isUoClientFolder } from './client-files';

const modernClient = [
  'client.exe',
  'artLegacyMUL.uop',
  'gumpartLegacyMUL.uop',
  'map0LegacyMUL.uop',
  'map0xLegacyMUL.uop',
  'staidx0.mul',
  'statics0.mul',
  'tiledata.mul',
  'hues.mul',
  'skills.mul',
  'skillgrp.mul',
  'multi.mul',
  'multi.idx',
  'MultiCollection.uop',
  'Multimap.rle',
  'radarcol.mul',
  'light.mul',
  'lightidx.mul',
  'texmaps.mul',
  'texidx.mul',
  'soundLegacyMUL.uop',
  'fonts.mul',
  'speech.mul',
  'Cliloc.enu',
  'anim.mul',
  'anim.idx',
  'anim2.mul',
  'anim2.idx',
  'AnimationFrame1.uop',
  'AnimationSequence.uop',
  'animdata.mul',
  'Anim1.def',
  'Body.def'
];

const classicClient = [
  'client.exe',
  'art.mul',
  'artidx.mul',
  'gumpart.mul',
  'gumpidx.mul',
  'map0.mul',
  'staidx0.mul',
  'statics0.mul',
  'tiledata.mul',
  'hues.mul',
  'skills.mul',
  'sound.mul',
  'soundidx.mul',
  'verdata.mul'
];

describe('detectClientFlavor', () => {
  it('detects a modern UOP-based client', () => {
    const flavor = detectClientFlavor(modernClient);
    expect(flavor).toMatchObject({
      clientExe: true,
      art: 'uop',
      gump: 'uop',
      map: 'uop',
      mapX: true,
      statics: true,
      anim: 'mul',
      animData: true,
      animDefs: true,
      bodyDefs: true,
      multi: 'mul',
      multiMap: true,
      sound: 'uop',
      light: true,
      textures: true,
      cliloc: true
    });
  });

  it('detects a classic MUL client', () => {
    const flavor = detectClientFlavor(classicClient);
    expect(flavor).toMatchObject({
      art: 'mul',
      gump: 'mul',
      map: 'mul',
      mapX: false,
      statics: true,
      sound: 'mul',
      verdata: true
    });
  });

  it('prefers MUL over UOP when both exist', () => {
    const flavor = detectClientFlavor(['art.mul', 'artidx.mul', 'artLegacyMUL.uop']);
    expect(flavor.art).toBe('mul');
  });

  it('rejects an incomplete MUL pair', () => {
    expect(detectClientFlavor(['art.mul']).art).toBeNull();
    expect(detectClientFlavor(['staidx0.mul']).statics).toBe(false);
  });

  it('matches file names case-insensitively', () => {
    const flavor = detectClientFlavor(['ART.MUL', 'ArtIdx.MUL', 'TILEDATA.MUL']);
    expect(flavor.art).toBe('mul');
    expect(flavor.tiledata).toBe(true);
  });

  it('returns an empty flavor for unrelated folders', () => {
    const flavor = detectClientFlavor(['readme.txt', 'photo.jpg']);
    expect(isUoClientFolder(flavor)).toBe(false);
  });
});

describe('isUoClientFolder', () => {
  it('accepts a folder with only tiledata.mul', () => {
    expect(isUoClientFolder(detectClientFlavor(['tiledata.mul']))).toBe(true);
  });

  it('accepts a folder with only UOP art', () => {
    expect(isUoClientFolder(detectClientFlavor(['artlegacymul.uop']))).toBe(true);
  });
});
