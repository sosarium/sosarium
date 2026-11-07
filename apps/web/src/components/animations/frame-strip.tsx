import type { AnimationFrameData } from '@sosarium/formats';

import { tileToCanvas } from '@/lib/art-image';

interface FrameStripProps {
  strip: { key: string; index: number; frame: AnimationFrameData }[];
  frames: AnimationFrameData[] | null;
  frameIndex: number;
  onSelect: (index: number) => void;
}

export function FrameStrip({ strip, frames, frameIndex, onSelect }: FrameStripProps) {
  return (
    <div className="flex flex-none items-end gap-1 overflow-x-auto border-t border-bronze/20 px-4 py-3">
      {strip.map((entry) => (
        <button
          className={`shrink-0 rounded border p-1 ${
            entry.index === frameIndex ? 'border-bronze bg-bronze/20' : 'border-parchment/10 hover:border-bronze/40'
          }`}
          key={entry.key}
          onClick={() => onSelect(entry.index)}
          type="button"
        >
          <canvas
            className="block max-h-16 max-w-16"
            ref={(element) => {
              if (!element || entry.frame.width === 0) {
                return;
              }
              const context = element.getContext('2d');
              if (!context) {
                return;
              }
              element.width = entry.frame.width;
              element.height = entry.frame.height;
              context.imageSmoothingEnabled = false;
              context.drawImage(tileToCanvas(entry.frame), 0, 0);
            }}
          />
        </button>
      ))}
      {frames && frames.length === 0 ? <span className="text-xs text-parchment/40">No frames.</span> : null}
    </div>
  );
}
