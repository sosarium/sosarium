import { type Animdata, parseAnimdata, serializeAnimdata } from '@sosarium/formats';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveAnimationEdits } from './animations-save';
import { type SessionState, sessionStore } from './session';

function openSession(names: string[], mode: SessionState['mode'] = 'readwrite') {
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
  sessionStore.set({
    status: 'ready',
    name: 'client',
    mode,
    flavor: null,
    clientVersion: null,
    files: names.map((name) => ({ name, size: 0 })) as SessionState['files'],
    handle,
    filesByName: null
  });
  return written;
}

const empty = { uopEdits: new Map(), legacyEdits: new Map(), animdata: null };
const animdata: Animdata = parseAnimdata(new Uint8Array(548));

describe('saveAnimationEdits', () => {
  afterEach(() => {
    sessionStore.reset();
  });

  it('refuses read-only sessions', async () => {
    const written = openSession(['animdata.mul'], 'readonly');
    await expect(saveAnimationEdits({ ...empty, animdata })).rejects.toThrow('read-only');
    expect(written.size).toBe(0);
  });

  it('fails when animdata.mul is missing', async () => {
    openSession([]);
    await expect(saveAnimationEdits({ ...empty, animdata })).rejects.toThrow('missing animdata.mul');
  });

  it('writes animdata to the actual file name', async () => {
    const written = openSession(['AnimData.mul']);
    await expect(saveAnimationEdits({ ...empty, animdata })).resolves.toEqual(['AnimData.mul']);
    expect(written.get('AnimData.mul')).toEqual(serializeAnimdata(animdata));
  });
});
