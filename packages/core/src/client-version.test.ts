import { hasAssets, loadAsset } from '@sosarium/core/testing';
import { describe, expect, it } from 'vitest';

import { detectClientVersion } from './client-version';

describe.skipIf(!hasAssets())('detectClientVersion (real client.exe)', () => {
  it('reads the FileVersion from the PE version resource', async () => {
    const bytes = await loadAsset('client.exe').readAll();
    expect(detectClientVersion(bytes)).toBe('7.0.114.40');
  });
});

describe('detectClientVersion robustness', () => {
  it('returns null for non-PE data', () => {
    expect(detectClientVersion(new Uint8Array(0))).toBeNull();
    expect(detectClientVersion(new Uint8Array(1024))).toBeNull();
    expect(detectClientVersion(new TextEncoder().encode('not an executable at all'))).toBeNull();
  });

  it('returns null for a truncated MZ header', () => {
    const bytes = new Uint8Array(64);
    bytes[0] = 0x4d;
    bytes[1] = 0x5a;
    expect(detectClientVersion(bytes)).toBeNull();
  });
});
