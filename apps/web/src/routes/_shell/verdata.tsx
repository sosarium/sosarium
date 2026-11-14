import {
  type AnimationFrameData,
  type ArtTile,
  decodeGumpPayload,
  decodeLandTile,
  decodeLegacyAnimationGroup,
  decodeStaticArt,
  decodeTexture,
  gumpDimensions,
  LAND_COUNT,
  type MultiGroup,
  multiFormatFromLength,
  parseMultiGroup,
  parseSkill,
  type Texture
} from '@sosarium/formats';
import { pixelsToRgba } from '@sosarium/render';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { GitHubButton } from '@/components/github-button';
import { tileToCanvas } from '@/lib/art-image';
import { getArtSource } from '@/lib/art-session';
import { useDocumentMeta } from '@/lib/document-meta';
import { renderMultiComposition } from '@/lib/multi-image';
import { loadVerdata } from '@/lib/radarcol-session';
import { useSession } from '@/lib/session';

export const Route = createFileRoute('/_shell/verdata')({
  component: VerdataPage
});

interface Patch {
  file: number;
  index: number;
  lookup: number;
  length: number;
  extra: number;
}

interface Bundle {
  patches: Patch[];
  bytes: Uint8Array;
}

interface DecodedPreview {
  kind: 'gump' | 'art' | 'texture' | 'animation' | 'multi' | 'skill' | 'tiledata' | 'animdata' | 'none';
  detail: string;
  tile?: ArtTile | null;
  texture?: Texture | null;
  frames?: AnimationFrameData[] | null;
  multi?: MultiGroup | null;
}

const FAMILIES: { name: string; files: number[] }[] = [
  { name: 'Art (art.mul)', files: [3, 4] },
  { name: 'Gumps (gumpart.mul)', files: [11, 12] },
  { name: 'Textures (texmaps.mul)', files: [9, 10] },
  { name: 'TileData (tiledata.mul)', files: [30] },
  { name: 'AnimData (animdata.mul)', files: [31] },
  { name: 'Map (map0.mul)', files: [0] },
  { name: 'Statics (statics0.mul)', files: [1, 2] },
  { name: 'Animations (anim.mul)', files: [5, 6] },
  { name: 'Sounds (sound.mul)', files: [7, 8] },
  { name: 'Multi (multi.mul)', files: [13, 14] },
  { name: 'Skills (skills.mul)', files: [15, 16] }
];

function familyFor(file: number): string {
  return FAMILIES.find((family) => family.files.includes(file))?.name ?? `File ${file}`;
}

function decodeAnimIndex(index: number): { body: number; action: number; direction: number } | null {
  for (let body = 0; body < 0x800; body++) {
    const base = body < 200 ? body * 110 : body < 400 ? 22000 + (body - 200) * 65 : 35000 + (body - 400) * 175;
    const stride = body < 200 ? 110 : body < 400 ? 65 : 175;
    const offset = index - base;
    if (offset >= 0 && offset < stride) {
      return { body, action: Math.floor(offset / 5), direction: offset % 5 };
    }
  }
  return null;
}

function decodeAscii(bytes: Uint8Array, offset: number, length: number): string {
  let text = '';
  for (let i = offset; i < Math.min(offset + length, bytes.byteLength); i++) {
    const code = bytes[i] as number;
    if (code === 0) {
      break;
    }
    text += String.fromCharCode(code);
  }
  return text;
}

function decodePreview(patch: Patch, payload: Uint8Array): DecodedPreview {
  if (patch.file === 11 || patch.file === 12) {
    const dims = gumpDimensions(patch.extra);
    const tile = decodeGumpPayload(payload, dims.width, dims.height);
    return {
      kind: 'gump',
      detail: tile ? `${tile.width}×${tile.height}` : 'could not decode gump payload',
      tile
    };
  }
  if (patch.file === 3 || patch.file === 4) {
    const tile = patch.index < LAND_COUNT ? decodeLandTile(payload) : decodeStaticArt(payload);
    return {
      kind: 'art',
      detail: tile ? `${tile.width}×${tile.height}` : 'could not decode art payload',
      tile
    };
  }
  if (patch.file === 9 || patch.file === 10) {
    const texture = decodeTexture(payload, patch.extra);
    return {
      kind: 'texture',
      detail: texture ? `${texture.size}×${texture.size}` : 'could not decode texture payload',
      texture
    };
  }
  if (patch.file === 5 || patch.file === 6) {
    const decodedIndex = decodeAnimIndex(patch.index);
    const frames = decodeLegacyAnimationGroup(payload, (decodedIndex?.direction ?? 0) > 4);
    return {
      kind: 'animation',
      detail: decodedIndex
        ? `body ${decodedIndex.body} · action ${decodedIndex.action} · dir ${decodedIndex.direction} · ${frames?.length ?? 0} frames`
        : 'could not decode index',
      frames
    };
  }
  if (patch.file === 13 || patch.file === 14) {
    const format = multiFormatFromLength(patch.length);
    const multi = format ? parseMultiGroup(payload, format) : null;
    return {
      kind: 'multi',
      detail: multi
        ? `${multi.components.length} components · ${multi.width}×${multi.height}`
        : 'could not decode multi payload',
      multi
    };
  }
  if (patch.file === 15 || patch.file === 16) {
    const skill = parseSkill(payload, patch.index, patch.extra);
    return {
      kind: 'skill',
      detail: skill
        ? `${skill.name} · action ${skill.isAction ? 'yes' : 'no'} · extra ${skill.extra}`
        : 'could not decode skill payload'
    };
  }
  if (patch.file === 30) {
    return {
      kind: 'tiledata',
      detail: `record payload · ${patch.length} bytes · ${decodeAscii(payload, 0, 20)}`
    };
  }
  if (patch.file === 31) {
    return {
      kind: 'animdata',
      detail:
        payload.byteLength >= 68
          ? `frameCount ${payload[65]} · interval ${payload[66]} · start ${payload[67]}`
          : `payload ${payload.byteLength} bytes`
    };
  }
  return { kind: 'none', detail: 'no visual preview for this file type' };
}

function VerdataPage() {
  useDocumentMeta('Verdata — Sosarium');
  const session = useSession();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [status, setStatus] = useState('idle');
  const [family, setFamily] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (session.status !== 'ready') {
      return;
    }
    let cancelled = false;
    setStatus('loading verdata.mul…');
    loadVerdata()
      .then((value) => {
        if (cancelled) {
          return;
        }
        setBundle(value);
        setStatus(
          value
            ? `${value.patches.length} patches · ${value.bytes.byteLength} bytes`
            : 'verdata.mul is not present in this client'
        );
        const firstFamily = value
          ? FAMILIES.find((entry) => entry.files.some((file) => value.patches.some((patch) => patch.file === file)))
              ?.name
          : null;
        setFamily(firstFamily ?? null);
        setSelected(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setStatus(cause instanceof Error ? cause.message : 'load failed');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const families = useMemo(() => {
    if (!bundle) {
      return [];
    }
    const groups = new Map<string, number>();
    for (const patch of bundle.patches) {
      const name = familyFor(patch.file);
      groups.set(name, (groups.get(name) ?? 0) + 1);
    }
    return [...groups.entries()].map(([name, count]) => ({ name, count }));
  }, [bundle]);

  const patches = useMemo(() => {
    if (!bundle || !family) {
      return [];
    }
    return bundle.patches.filter((patch) => familyFor(patch.file) === family).sort((a, b) => a.index - b.index);
  }, [bundle, family]);

  const patch = selected !== null ? (patches[selected] ?? null) : null;
  const payload = patch && bundle ? bundle.bytes.subarray(patch.lookup, patch.lookup + patch.length) : null;

  const decoded = useMemo(() => (patch && payload ? decodePreview(patch, payload) : null), [patch, payload]);

  const patchKey = patch ? `${patch.file}:${patch.index}` : null;
  useEffect(() => {
    if (patchKey === null) {
      return;
    }
    setFrameIndex(0);
    setPlaying(false);
  }, [patchKey]);

  useEffect(() => {
    if (!playing || !decoded?.frames || decoded.frames.length < 2) {
      return;
    }
    const frames = decoded.frames;
    const timer = window.setInterval(() => {
      setFrameIndex((value) => (value + 1) % frames.length);
    }, 120);
    return () => window.clearInterval(timer);
  }, [playing, decoded]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    setNote(null);

    if (decoded?.kind === 'gump' || decoded?.kind === 'art') {
      if (decoded.tile) {
        const rendered = tileToCanvas(decoded.tile);
        canvas.width = rendered.width;
        canvas.height = rendered.height;
        context.imageSmoothingEnabled = false;
        context.drawImage(rendered, 0, 0);
      }
      return;
    }

    if (decoded?.kind === 'texture' && decoded.texture) {
      canvas.width = decoded.texture.size;
      canvas.height = decoded.texture.size;
      const image = context.createImageData(decoded.texture.size, decoded.texture.size);
      image.data.set(pixelsToRgba(decoded.texture.pixels));
      context.putImageData(image, 0, 0);
      return;
    }

    if (decoded?.kind === 'animation' && decoded.frames && decoded.frames.length > 0) {
      const frames = decoded.frames;
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
        return;
      }
      let width = 0;
      let height = 0;
      for (const frame of frames) {
        if (frame.width === 0) {
          continue;
        }
        width = Math.max(width, drawCenterX - frame.centerX + frame.width);
        height = Math.max(height, drawCenterY - frame.centerY);
      }
      const frame = frames[frameIndex % frames.length];
      if (!frame || frame.width === 0) {
        return;
      }
      canvas.width = width;
      canvas.height = height;
      context.imageSmoothingEnabled = false;
      context.drawImage(tileToCanvas(frame), drawCenterX - frame.centerX, drawCenterY - frame.centerY - frame.height);
      return;
    }

    if (decoded?.kind === 'multi' && decoded.multi) {
      const multi = decoded.multi;
      void (async () => {
        const art = await getArtSource();
        if (!art) {
          setNote('multi preview needs the art files, which this folder does not contain');
          return;
        }
        let rendered: HTMLCanvasElement | null;
        try {
          rendered = await renderMultiComposition(multi, art);
        } catch (cause) {
          setNote(cause instanceof Error ? cause.message : 'could not render this multi');
          return;
        }
        if (!rendered) {
          return;
        }
        canvas.width = rendered.width;
        canvas.height = rendered.height;
        context.imageSmoothingEnabled = false;
        context.drawImage(rendered, 0, 0);
      })();
    }
  }, [decoded, frameIndex]);

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-64 flex-none flex-col border-r border-bronze/20">
        <h2 className="border-b border-bronze/20 px-3 py-2 text-xs tracking-widest text-parchment/40 uppercase">
          Families
        </h2>
        <div className="sf-opt scroll-area flex-1 overflow-y-auto">
          {families.map((entry) => (
            <button
              className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs ${
                entry.name === family ? 'bg-bronze/20 text-bronze-bright' : 'text-parchment/60 hover:bg-bronze/10'
              }`}
              key={entry.name}
              onClick={() => {
                setFamily(entry.name);
                setSelected(null);
              }}
              type="button"
            >
              <span>{entry.name}</span>
              <span className="text-parchment/30">{entry.count}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-bronze/20 px-4 py-3 min-h-14">
          <h1 className="font-serif text-xl tracking-widest text-bronze-bright uppercase">Verdata</h1>
          <div className="flex-1" />
          <span className="text-xs text-parchment/40">{status}</span>
          <GitHubButton />
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="sf-opt scroll-area min-h-0 w-72 flex-none overflow-y-auto border-r border-bronze/20">
            <table className="w-full text-xs">
              <thead className="text-parchment/40">
                <tr>
                  <th className="text-left">file</th>
                  <th className="text-left">index</th>
                  <th className="text-left">length</th>
                </tr>
              </thead>
              <tbody className="text-parchment/70">
                {patches.map((entry, slot) => (
                  <tr
                    className={`cursor-pointer border-b border-parchment/5 ${
                      slot === selected ? 'bg-bronze/20 text-bronze-bright' : 'hover:bg-bronze/10'
                    }`}
                    key={`${entry.file}-${entry.index}-${entry.lookup}`}
                    onClick={() => setSelected(slot)}
                  >
                    <td className="px-3 py-1 font-mono">{entry.file}</td>
                    <td className="px-3 py-1 font-mono">{entry.index}</td>
                    <td className="px-3 py-1 font-mono">{entry.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {bundle === null ? (
              <div className="m-6 rounded border border-bronze/20 px-4 py-3 text-sm text-parchment/50">
                This client has no <span className="font-mono">verdata.mul</span>.
              </div>
            ) : patch ? (
              <>
                <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-bronze/20 px-4 py-2 text-xs text-parchment/50">
                  <span>
                    file {patch.file} · {familyFor(patch.file)}
                  </span>
                  <span>
                    index 0x{patch.index.toString(16).toUpperCase()} ({patch.index})
                  </span>
                  <span>lookup 0x{patch.lookup.toString(16).toUpperCase()}</span>
                  <span>length {patch.length}</span>
                  <span>extra 0x{patch.extra.toString(16).toUpperCase()}</span>
                  {decoded?.detail ? <span className="text-bronze-bright/80">{decoded.detail}</span> : null}
                </div>
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
                    <div
                      className="rounded border border-bronze/20"
                      style={{
                        backgroundImage:
                          'linear-gradient(45deg, #1a1613 25%, transparent 25%), linear-gradient(-45deg, #1a1613 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1613 75%), linear-gradient(-45deg, transparent 75%, #1a1613 75%)',
                        backgroundSize: '16px 16px',
                        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0'
                      }}
                    >
                      <canvas className="block" ref={canvasRef} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 border-t border-bronze/20 px-4 py-2 text-xs text-parchment/50">
                    {decoded?.kind === 'animation' && (decoded.frames?.length ?? 0) > 1 ? (
                      <button
                        className="rounded border border-bronze/30 px-2 py-1"
                        onClick={() => setPlaying((value) => !value)}
                        type="button"
                      >
                        {playing ? 'Stop' : 'Play'}
                      </button>
                    ) : null}
                    {note ? <span className="text-bronze-bright/70">{note}</span> : null}
                  </div>
                </div>
              </>
            ) : (
              <div className="m-6 rounded border border-bronze/20 px-4 py-3 text-sm text-parchment/50">
                Select a patch to see its preview.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
