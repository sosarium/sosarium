import type { Texture } from '@sosarium/formats';
import { pixelsToRgba } from '@sosarium/render';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { GitHubButton } from '@/components/github-button';
import { formatIndexParam, parseIndexParam } from '@/lib/deep-link';
import { useDocumentMeta } from '@/lib/document-meta';
import { loadTexture, loadTextureList } from '@/lib/misc-session';
import { useSession } from '@/lib/session';
import { useUrlStateSync } from '@/lib/use-url-state';

export const Route = createFileRoute('/_shell/textures/{-$id}')({
  component: TexturesPage
});

function TexturesPage() {
  const session = useSession();
  const params = Route.useParams();
  const navigate = useNavigate();
  const [list, setList] = useState<{ index: number; size: 64 | 128 }[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  useUrlStateSync({
    apply: () => {
      const parsed = parseIndexParam(params.id);
      if (parsed !== null) {
        setSelected(parsed);
      }
    },
    paramKey: (params.id ?? '').toLowerCase(),
    stateKey: selected === null ? '' : formatIndexParam(selected).toLowerCase(),
    sync: () => {
      if (selected === null) {
        return;
      }
      void navigate({ to: '/textures/{-$id}', params: { id: formatIndexParam(selected) }, replace: true });
    }
  });

  useDocumentMeta(
    selected !== null ? `Texture ${formatIndexParam(selected)} — Sosarium` : 'Textures — Sosarium',
    selected !== null
      ? `Ultima Online terrain texture ${formatIndexParam(selected)} — Sosarium.`
      : 'Ultima Online terrain texture browser for Ultima Online client files.'
  );
  const [texture, setTexture] = useState<Texture | null>(null);
  const [status, setStatus] = useState('idle');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (session.status !== 'ready') {
      return;
    }
    let cancelled = false;
    setStatus('loading textures…');
    loadTextureList()
      .then((value) => {
        if (cancelled) {
          return;
        }
        setList(value ?? []);
        setStatus(value ? `${value.length} textures` : 'texidx.mul not found');
        setSelected((current) => current ?? value?.[0]?.index ?? null);
      })
      .catch((cause: unknown) => setStatus(cause instanceof Error ? cause.message : 'load failed'));
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (selected === null) {
      return;
    }
    let cancelled = false;
    loadTexture(selected).then((value) => {
      if (!cancelled) {
        setTexture(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !texture) {
      return;
    }
    canvas.width = texture.size;
    canvas.height = texture.size;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    const image = context.createImageData(texture.size, texture.size);
    image.data.set(pixelsToRgba(texture.pixels));
    context.putImageData(image, 0, 0);
  }, [texture]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-bronze/20 px-4 py-3 min-h-14">
        <h1 className="font-serif text-xl tracking-widest text-bronze-bright uppercase">Textures</h1>
        <div className="flex-1" />
        <span className="text-xs text-parchment/40">{status}</span>
        <GitHubButton />
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="sf-opt scroll-area w-64 flex-none overflow-y-auto border-r border-bronze/20">
          {list.map((entry) => (
            <button
              className={`flex w-full items-center justify-between px-3 py-1 text-left text-xs ${
                entry.index === selected ? 'bg-bronze/20 text-bronze-bright' : 'text-parchment/60 hover:bg-bronze/10'
              }`}
              key={entry.index}
              onClick={() => setSelected(entry.index)}
              type="button"
            >
              <span className="font-mono">{entry.index}</span>
              <span className="text-parchment/30">{entry.size}</span>
            </button>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <canvas className="rounded border border-bronze/20" ref={canvasRef} style={{ imageRendering: 'pixelated' }} />
        </div>
      </div>
    </div>
  );
}
