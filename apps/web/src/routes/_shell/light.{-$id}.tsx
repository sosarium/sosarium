import type { LightEntry } from '@sosarium/formats';
import { pixelsToRgba } from '@sosarium/render';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { GitHubButton } from '@/components/github-button';
import { formatIndexParam, parseIndexParam } from '@/lib/deep-link';
import { useDocumentMeta } from '@/lib/document-meta';
import { loadLight, loadLightList } from '@/lib/misc-session';
import { useSession } from '@/lib/session';
import { useUrlStateSync } from '@/lib/use-url-state';

export const Route = createFileRoute('/_shell/light/{-$id}')({
  component: LightPage
});

function LightPage() {
  const session = useSession();
  const params = Route.useParams();
  const navigate = useNavigate();
  const [list, setList] = useState<number[]>([]);
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
      void navigate({ to: '/light/{-$id}', params: { id: formatIndexParam(selected) }, replace: true });
    }
  });

  useDocumentMeta(
    selected !== null ? `Light ${formatIndexParam(selected)} — Sosarium` : 'Lights — Sosarium',
    selected !== null
      ? `Ultima Online light pattern ${formatIndexParam(selected)} — Sosarium.`
      : 'Ultima Online light pattern browser for Ultima Online client files.'
  );
  const [entry, setEntry] = useState<LightEntry | null>(null);
  const [status, setStatus] = useState('idle');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (session.status !== 'ready') {
      return;
    }
    let cancelled = false;
    setStatus('loading light…');
    loadLightList()
      .then((value) => {
        if (cancelled) {
          return;
        }
        setList(value ?? []);
        setStatus(value ? `${value.length} light entries` : 'lightidx.mul not found');
        setSelected((current) => current ?? value?.[0] ?? null);
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
    loadLight(selected).then((value) => {
      if (!cancelled) {
        setEntry(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !entry) {
      return;
    }
    canvas.width = entry.width * 4;
    canvas.height = entry.height * 4;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    const scratch = document.createElement('canvas');
    scratch.width = entry.width;
    scratch.height = entry.height;
    const scratchContext = scratch.getContext('2d');
    if (!scratchContext) {
      return;
    }
    const image = scratchContext.createImageData(entry.width, entry.height);
    image.data.set(pixelsToRgba(entry.pixels));
    scratchContext.putImageData(image, 0, 0);
    context.imageSmoothingEnabled = false;
    context.drawImage(scratch, 0, 0, canvas.width, canvas.height);
  }, [entry]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-bronze/20 px-4 py-3 min-h-14">
        <h1 className="font-serif text-xl tracking-widest text-bronze-bright uppercase">Light</h1>
        <div className="flex-1" />
        <span className="text-xs text-parchment/40">
          {status}
          {entry ? ` · ${entry.width}×${entry.height}` : ''}
        </span>
        <GitHubButton />
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="sf-opt scroll-area w-56 flex-none overflow-y-auto border-r border-bronze/20">
          {list.map((index) => (
            <button
              className={`block w-full px-3 py-1 text-left font-mono text-xs ${
                index === selected ? 'bg-bronze/20 text-bronze-bright' : 'text-parchment/60 hover:bg-bronze/10'
              }`}
              key={index}
              onClick={() => setSelected(index)}
              type="button"
            >
              light {index}
            </button>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-6">
          <canvas className="rounded border border-bronze/20" ref={canvasRef} style={{ imageRendering: 'pixelated' }} />
        </div>
      </div>
    </div>
  );
}
