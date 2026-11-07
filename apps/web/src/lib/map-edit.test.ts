import { serializeRadarCol } from '@sosarium/formats';
import { describe, expect, it, vi } from 'vitest';

import { type FacetSaveRequest, saveFacet, setLandTile } from './map-edit';
import type { SessionState } from './session';

function fakeSession(names: string[], mode: SessionState['mode'] = 'readwrite') {
  const written = new Map<string, Uint8Array>();
  const handle = {
    getFileHandle: vi.fn(async (name: string) => ({
      createWritable: async () => ({
        write: async ({ data }: { data: Uint8Array }) => {
          written.set(name, data);
        },
        close: async () => undefined
      })
    }))
  } as unknown as FileSystemDirectoryHandle;
  const session: SessionState = {
    status: 'ready',
    name: 'client',
    mode,
    flavor: null,
    clientVersion: null,
    files: names.map((name) => ({ name, size: 0 })) as SessionState['files'],
    handle,
    filesByName: null
  };
  return { session, written };
}

const FACET_FILES = ['map0LegacyMUL.uop', 'staidx0.mul', 'statics0.mul', 'RadarCol.mul'];

const request: FacetSaveRequest = {
  facet: 0,
  extended: false,
  dimensions: { width: 8, height: 8, blockWidth: 1, blockHeight: 1 } as FacetSaveRequest['dimensions'],
  landEdits: new Map(),
  staticEdits: new Map(),
  radarColors: null,
  defrag: false
};

describe('saveFacet', () => {
  it('refuses read-only sessions without writing', async () => {
    const { session, written } = fakeSession(FACET_FILES, 'readonly');
    await expect(saveFacet(session, request)).rejects.toThrow('read-only');
    expect(written.size).toBe(0);
  });

  it('refuses facets with missing files', async () => {
    const { session, written } = fakeSession(['staidx0.mul']);
    await expect(saveFacet(session, request)).rejects.toThrow('facet 0 files are incomplete');
    expect(written.size).toBe(0);
  });

  it('writes only the radar file for a radar-only save', async () => {
    const { session, written } = fakeSession(FACET_FILES);
    const radarColors = new Uint16Array(0x8000).fill(0x1234);
    const result = await saveFacet(session, { ...request, radarColors });
    expect(result.files).toEqual(['RadarCol.mul']);
    expect([...written.keys()]).toEqual(['RadarCol.mul']);
    expect(written.get('RadarCol.mul')).toEqual(serializeRadarCol(radarColors));
  });
});

describe('setLandTile', () => {
  it('writes the id and clamped z without mutating the block', () => {
    const block = new Uint8Array(196);
    const updated = setLandTile(block, 1, 0x1234, 500);
    expect([...updated.slice(7, 10)]).toEqual([0x34, 0x12, 127]);
    expect(block.every((byte) => byte === 0)).toBe(true);
  });
});
