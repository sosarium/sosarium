import type { WritableFile } from '@sosarium/formats';

import type { SessionState } from './session';

export function findFile(session: SessionState, name: string): string | null {
  const lower = name.toLowerCase();
  for (const file of session.files) {
    if (file.name.toLowerCase() === lower) {
      return file.name;
    }
  }
  return null;
}

// createWritable stages to a swap file, so nothing lands on disk until close().
export async function commitFiles(
  directory: FileSystemDirectoryHandle,
  files: { name: string; bytes: Uint8Array }[]
): Promise<void> {
  const streams: FileSystemWritableFileStream[] = [];
  try {
    for (const { name, bytes } of files) {
      const stream = await (await directory.getFileHandle(name)).createWritable({ keepExistingData: false });
      streams.push(stream);
      await stream.write({ type: 'write', position: 0, data: bytes.slice() });
    }
  } catch (cause) {
    await Promise.allSettled(streams.map((stream) => stream.abort()));
    throw cause;
  }
  for (const stream of streams) {
    await stream.close();
  }
}

export class HandleWritableFile implements WritableFile {
  private stream: FileSystemWritableFileStream | null = null;

  constructor(private readonly handle: FileSystemFileHandle) {}

  async open(keepExistingData: boolean): Promise<void> {
    this.stream = await this.handle.createWritable({ keepExistingData });
  }

  async writeAt(position: number, data: Uint8Array): Promise<void> {
    if (!this.stream) {
      throw new Error('writable stream is not open');
    }
    await this.stream.write({ type: 'write', position, data: data.slice() });
  }

  async close(): Promise<void> {
    const stream = this.stream;
    this.stream = null;
    await stream?.close();
  }
}

export class UnavailableWritableFile implements WritableFile {
  async open(): Promise<void> {
    throw new Error('This session is read-only — open the folder with write access to save.');
  }
  async writeAt(): Promise<void> {}
  async close(): Promise<void> {}
}
