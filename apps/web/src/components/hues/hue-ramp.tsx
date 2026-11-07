import { expand5To8, hueColorToCss, rgb8ToHue5 } from '@sosarium/formats';

const SLOT_IDS = Array.from({ length: 32 }, (_, slot) => slot);

export interface HueRampProps {
  colors: Uint16Array;
  editable?: boolean;
  onChange?: (slot: number, color: number) => void;
}

function toHexColor(color: number): string {
  const r = expand5To8((color >> 10) & 0x1f);
  const g = expand5To8((color >> 5) & 0x1f);
  const b = expand5To8(color & 0x1f);
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function HueRamp({ colors, editable, onChange }: HueRampProps) {
  return (
    <div className="grid grid-cols-8 gap-1">
      {SLOT_IDS.map((slot) => {
        const color = colors[slot] ?? 0;
        const style = { background: hueColorToCss(color) };
        const title = `${slot}: ${toHexColor(color)}`;
        if (editable && onChange) {
          return (
            <label
              className="relative block h-7 w-7 cursor-pointer rounded border border-black/40 hover:ring-1 hover:ring-bronze"
              key={`swatch-${slot}`}
              style={style}
              title={title}
            >
              <input
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                onChange={(event) => {
                  const value = event.target.value;
                  const r = Number.parseInt(value.slice(1, 3), 16);
                  const g = Number.parseInt(value.slice(3, 5), 16);
                  const b = Number.parseInt(value.slice(5, 7), 16);
                  onChange(slot, rgb8ToHue5(r, g, b));
                }}
                type="color"
                value={toHexColor(color)}
              />
            </label>
          );
        }
        return (
          <span
            className="block h-7 w-7 rounded border border-black/40"
            key={`swatch-${slot}`}
            style={style}
            title={title}
          />
        );
      })}
    </div>
  );
}
