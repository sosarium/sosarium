import type { AnimationFrameData } from './frames';
import type { LegacyAnimationSource, LegacyAnimFile } from './legacy';
import type { AnimationUopFile, AnimationUopSource } from './uop';

export type AnimationKind = 'uop' | 'legacy';

export class AnimationSource {
  private readonly uopSource: AnimationUopSource | null;
  private readonly legacySource: LegacyAnimationSource | null;

  constructor(uopSource: AnimationUopSource | null, legacySource: LegacyAnimationSource | null) {
    this.uopSource = uopSource;
    this.legacySource = legacySource;
  }

  get kindLabel(): string {
    if (this.uopSource && this.legacySource) {
      return 'UOP + MUL';
    }
    if (this.uopSource) {
      return 'UOP';
    }
    return this.legacySource ? 'MUL' : 'none';
  }

  bodies(): number[] {
    const set = new Set<number>(this.uopSource?.bodies() ?? []);
    for (const body of this.legacySource?.bodies() ?? []) {
      set.add(body);
    }
    return [...set].sort((a, b) => a - b);
  }

  actions(body: number): number[] {
    const set = new Set<number>(this.uopSource?.actions(body) ?? []);
    for (const action of this.legacySource?.actions(body) ?? []) {
      set.add(action);
    }
    return [...set].sort((a, b) => a - b);
  }

  kind(body: number): AnimationKind | null {
    if ((this.uopSource?.actions(body).length ?? 0) > 0) {
      return 'uop';
    }
    return this.legacySource?.has(body, 0, 0) ? 'legacy' : null;
  }

  has(body: number, action: number): boolean {
    return (this.uopSource?.has(body, action) ?? false) || (this.legacySource?.has(body, action, 0) ?? false);
  }

  uop(): AnimationUopSource | null {
    return this.uopSource;
  }

  legacy(): LegacyAnimationSource | null {
    return this.legacySource;
  }

  readActionEntry(
    body: number,
    action: number
  ): Promise<{ file: AnimationUopFile; hash: bigint; bytes: Uint8Array } | null> {
    return this.uopSource?.readActionEntry(body, action) ?? Promise.resolve(null);
  }

  readGroup(
    body: number,
    action: number,
    direction: number
  ): Promise<{ file: LegacyAnimFile; index: number; bytes: Uint8Array } | null> {
    return this.legacySource?.readGroup(body, action, direction) ?? Promise.resolve(null);
  }

  async read(body: number, action: number, direction: number): Promise<AnimationFrameData[] | null> {
    const uopFrames = await this.uopSource?.read(body, action, direction);
    if (uopFrames && uopFrames.length > 0) {
      return uopFrames;
    }
    return (await this.legacySource?.read(body, action, direction)) ?? null;
  }
}
