import { describe, expect, it, vi } from 'vitest';

import { commitFiles } from './file-access';

function fakeDirectory(failing?: string) {
  const closed: string[] = [];
  const aborted: string[] = [];
  const directory = {
    getFileHandle: vi.fn(async (name: string) => ({
      createWritable: async () => ({
        write: async () => {
          if (name === failing) {
            throw new DOMException('disk full', 'QuotaExceededError');
          }
        },
        close: async () => {
          closed.push(name);
        },
        abort: async () => {
          aborted.push(name);
        }
      })
    }))
  } as unknown as FileSystemDirectoryHandle;
  return { directory, closed, aborted };
}

const files = [
  { name: 'staidx0.mul', bytes: new Uint8Array(1) },
  { name: 'statics0.mul', bytes: new Uint8Array(1) }
];

describe('commitFiles', () => {
  it('closes every file once all writes succeed', async () => {
    const { directory, closed, aborted } = fakeDirectory();
    await commitFiles(directory, files);
    expect(closed).toEqual(['staidx0.mul', 'statics0.mul']);
    expect(aborted).toEqual([]);
  });

  it('commits nothing when a later write fails', async () => {
    const { directory, closed, aborted } = fakeDirectory('statics0.mul');
    await expect(commitFiles(directory, files)).rejects.toThrow('disk full');
    expect(closed).toEqual([]);
    expect(aborted).toEqual(['staidx0.mul', 'statics0.mul']);
  });
});
