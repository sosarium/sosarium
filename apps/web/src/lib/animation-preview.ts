import type { AnimationFrameData, AnimationSource } from '@sosarium/formats';

import type { PreviewLoader } from '@/components/thumbnail-list';

import { tileToCanvas } from './art-image';

const PREVIEW_CONCURRENCY = 4;

export function animationDetails(frames: AnimationFrameData[]) {
  let drawCenterX = Number.NEGATIVE_INFINITY;
  let drawCenterY = Number.NEGATIVE_INFINITY;
  for (const frame of frames) {
    if (frame.width === 0) {
      continue;
    }
    drawCenterX = Math.max(drawCenterX, frame.centerX);
    drawCenterY = Math.max(drawCenterY, frame.centerY + frame.height);
  }
  if (!Number.isFinite(drawCenterX)) {
    return null;
  }
  let width = 0;
  let height = 0;
  for (const frame of frames) {
    if (frame.width === 0) {
      continue;
    }
    width = Math.max(width, drawCenterX - frame.centerX + frame.width);
    height = Math.max(height, drawCenterY - frame.centerY - frame.height + frame.height);
  }
  return { drawCenterX, drawCenterY, width, height };
}

export function createPreviewLoader(source: AnimationSource): PreviewLoader {
  const cache = new Map<number, Promise<HTMLCanvasElement | null>>();
  let active = 0;
  const pending: (() => void)[] = [];

  const schedule = (task: () => Promise<HTMLCanvasElement | null>): Promise<HTMLCanvasElement | null> =>
    new Promise((resolve) => {
      const start = () => {
        active++;
        task()
          .then(resolve, (cause: unknown) => {
            console.warn('animation preview failed', cause);
            resolve(null);
          })
          .finally(() => {
            active--;
            pending.shift()?.();
          });
      };
      if (active < PREVIEW_CONCURRENCY) {
        start();
      } else {
        pending.push(start);
      }
    });

  return (body) => {
    const cached = cache.get(body);
    if (cached) {
      return cached;
    }
    const promise = schedule(async () => {
      const actions = source.actions(body);
      if (actions.length === 0) {
        return null;
      }
      const frames = await source.read(body, actions[0] as number, 0);
      const frame = (frames ?? []).find((candidate) => candidate.width > 0);
      return frame ? tileToCanvas(frame) : null;
    });
    cache.set(body, promise);
    return promise;
  };
}
