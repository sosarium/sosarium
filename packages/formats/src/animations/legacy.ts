import { type ByteSource, type MulEntry, readMulEntry } from '@sosarium/core';

import { type BodyconvTables, resolveAnimationFile } from './bodyconv';
import { type AnimationFrameData, decodeLegacyAnimationGroup } from './frames';

export interface LegacyAnimFile {
  fileType: number;
  entries: (MulEntry | undefined)[];
  data: ByteSource;
}

export const MAX_ANIMATION_BODIES = 0x800;

export function legacyIndexFor(fileType: number, body: number, action: number, direction: number): number {
  let index: number;
  switch (fileType) {
    case 3:
      if (body < 300) {
        index = body * 65;
      } else if (body < 400) {
        index = 33000 + (body - 300) * 110;
      } else {
        index = 35000 + (body - 400) * 175;
      }
      break;
    case 2:
      if (body < 200) {
        index = body * 110;
      } else {
        index = 22000 + (body - 200) * 65;
      }
      break;
    case 5:
      if (body < 200 && body !== 34) {
        index = body * 110;
      } else if (body < 400) {
        index = 22000 + (body - 200) * 65;
      } else {
        index = 35000 + (body - 400) * 175;
      }
      break;
    default:
      if (body < 200) {
        index = body * 110;
      } else if (body < 400) {
        index = 22000 + (body - 200) * 65;
      } else {
        index = 35000 + (body - 400) * 175;
      }
  }
  index += action * 5;
  index += direction <= 4 ? direction : direction - (direction - 4) * 2;
  return index;
}

export class LegacyAnimationSource {
  private readonly files: LegacyAnimFile[];
  private readonly tables: BodyconvTables | null;

  constructor(files: LegacyAnimFile[], tables: BodyconvTables | null = null) {
    this.files = files;
    this.tables = tables;
  }

  private find(body: number, action: number, direction: number): { file: LegacyAnimFile; entry: MulEntry } | null {
    if (this.tables) {
      const resolved = resolveAnimationFile(this.tables, body);
      const preferred = this.files.find((file) => file.fileType === resolved.fileType);
      if (preferred) {
        const entry = preferred.entries[legacyIndexFor(preferred.fileType, resolved.body, action, direction)];
        if (entry) {
          return { file: preferred, entry };
        }
      }
    }

    for (const file of this.files) {
      const index = legacyIndexFor(file.fileType, body, action, direction);
      const entry = file.entries[index];
      if (entry) {
        return { file, entry };
      }
    }
    return null;
  }

  has(body: number, action: number, direction = 0): boolean {
    return this.find(body, action, direction) !== null;
  }

  bodies(): number[] {
    const found: number[] = [];
    for (let body = 0; body < MAX_ANIMATION_BODIES; body++) {
      if (this.find(body, 0, 0)) {
        found.push(body);
      }
    }
    return found;
  }

  actions(body: number): number[] {
    const actions: number[] = [];
    for (let action = 0; action < 80; action++) {
      if (this.find(body, action, 0)) {
        actions.push(action);
      }
    }
    return actions;
  }

  async readGroup(
    body: number,
    action: number,
    direction: number
  ): Promise<{ file: LegacyAnimFile; index: number; bytes: Uint8Array } | null> {
    const found = this.find(body, action, direction);
    if (!found) {
      return null;
    }
    const index = legacyIndexFor(found.file.fileType, body, action, direction);
    return { file: found.file, index, bytes: await readMulEntry(found.file.data, found.entry) };
  }

  async read(body: number, action: number, direction: number): Promise<AnimationFrameData[] | null> {
    const found = this.find(body, action, direction);
    if (!found) {
      return null;
    }
    const bytes = await readMulEntry(found.file.data, found.entry);
    return decodeLegacyAnimationGroup(bytes, direction > 4);
  }
}
