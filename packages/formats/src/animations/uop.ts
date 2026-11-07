import { hashFileName, type UopContainer, type UopEntry } from '@sosarium/core';

import { type AnimationFrameData, decodeUopAnimationEntry } from './frames';
import { MAX_ANIMATION_BODIES } from './legacy';
import { MAX_ANIM_ACTIONS, parseAnimationSequence } from './sequence';

export interface AnimationUopFile {
  name: string;
  container: UopContainer;
  readEntry: (entry: UopEntry) => Promise<Uint8Array>;
}

export function animationFrameName(body: number, action: number): string {
  return `build/animationlegacyframe/${String(body).padStart(6, '0')}/${String(action).padStart(2, '0')}.bin`;
}

export function animationSequenceName(body: number): string {
  return `build/animationsequence/${String(body).padStart(8, '0')}.bin`;
}

export class AnimationUopSource {
  private readonly frames = new Map<bigint, { file: AnimationUopFile; entry: UopEntry }>();
  private readonly sequences = new Map<number, number[]>();
  private readonly framesByBody = new Map<number, number[]>();
  private readonly sequenceFile: AnimationUopFile | null;
  private readonly byFile: { file: AnimationUopFile; entries: Map<bigint, UopEntry> }[] = [];

  constructor(files: AnimationUopFile[], sequenceFile: AnimationUopFile | null) {
    this.sequenceFile = sequenceFile;

    for (const file of files) {
      const fileEntries = new Map<bigint, UopEntry>();
      this.byFile.push({ file, entries: fileEntries });
      for (let body = 0; body < MAX_ANIMATION_BODIES; body++) {
        for (let action = 0; action < MAX_ANIM_ACTIONS; action++) {
          const hash = hashFileName(animationFrameName(body, action));
          const entry = file.container.byIdentifier.get(hash);
          if (!entry) {
            continue;
          }
          this.frames.set(hash, { file, entry });
          fileEntries.set(hash, entry);
          const actions = this.framesByBody.get(body);
          if (actions) {
            actions.push(action);
          } else {
            this.framesByBody.set(body, [action]);
          }
        }
      }
    }
  }

  async loadSequences(): Promise<void> {
    const file = this.sequenceFile;
    if (!file) {
      return;
    }
    for (let body = 0; body < MAX_ANIMATION_BODIES; body++) {
      const entry = file.container.byIdentifier.get(hashFileName(animationSequenceName(body)));
      if (!entry) {
        continue;
      }
      try {
        const data = await file.readEntry(entry);
        this.sequences.set(body, parseAnimationSequence(data));
      } catch {
        // a malformed sequence entry only loses its action aliases
      }
    }
  }

  bodies(): number[] {
    return [...this.framesByBody.keys()].sort((a, b) => a - b);
  }

  actions(body: number): number[] {
    return this.framesByBody.get(body) ?? [];
  }

  has(body: number, action: number): boolean {
    const resolved = this.sequences.get(body)?.[action] ?? action;
    return this.frames.has(hashFileName(animationFrameName(body, resolved)));
  }

  sequenceReplacements(body: number): number[] | undefined {
    return this.sequences.get(body);
  }

  entriesForFile(file: AnimationUopFile): Map<bigint, UopEntry> | null {
    return this.byFile.find((entry) => entry.file === file)?.entries ?? null;
  }

  files(): AnimationUopFile[] {
    return this.byFile.map((entry) => entry.file);
  }

  resolvedAction(body: number, action: number): number {
    return this.sequences.get(body)?.[action] ?? action;
  }

  async readActionEntry(
    body: number,
    action: number
  ): Promise<{ file: AnimationUopFile; hash: bigint; bytes: Uint8Array } | null> {
    const resolved = this.resolvedAction(body, action);
    const hash = hashFileName(animationFrameName(body, resolved));
    const found = this.frames.get(hash);
    if (!found) {
      return null;
    }
    return { file: found.file, hash, bytes: await found.file.readEntry(found.entry) };
  }

  async read(body: number, action: number, direction: number): Promise<AnimationFrameData[] | null> {
    const resolved = this.sequences.get(body)?.[action] ?? action;
    const found = this.frames.get(hashFileName(animationFrameName(body, resolved)));
    if (!found) {
      return null;
    }
    const data = await found.file.readEntry(found.entry);
    const readDirection = direction <= 4 ? direction : direction - (direction - 4) * 2;
    return decodeUopAnimationEntry(data, readDirection, direction > 4);
  }
}
