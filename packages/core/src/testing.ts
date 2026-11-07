import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { MemoryByteSource } from './byte-source';

export const assetsDir = process.env.UO_ASSETS_DIR ?? join(homedir(), 'Documents', 'Ultima Online Classic');

export function hasAssets(): boolean {
  return existsSync(assetsDir);
}

export function loadAsset(name: string): MemoryByteSource {
  const buffer = readFileSync(join(assetsDir, name));
  return new MemoryByteSource(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
}
