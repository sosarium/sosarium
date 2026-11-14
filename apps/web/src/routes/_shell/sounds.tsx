import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { GitHubButton } from '@/components/github-button';
import { useDocumentMeta } from '@/lib/document-meta';
import { loadSounds } from '@/lib/misc-session';
import { useSession } from '@/lib/session';

export const Route = createFileRoute('/_shell/sounds')({
  component: SoundsPage
});

function SoundsPage() {
  useDocumentMeta('Sounds — Sosarium');
  const session = useSession();
  const [entries, setEntries] = useState<{ id: number; name: string; seconds: number }[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [getWav, setGetWav] = useState<((id: number) => Promise<Uint8Array | null>) | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (session.status !== 'ready') {
      return;
    }
    let cancelled = false;
    setLoaded(false);
    setStatus('loading sounds…');
    loadSounds()
      .then((value) => {
        if (cancelled) {
          return;
        }
        setEntries(value?.entries ?? null);
        setGetWav(() => value?.getWav ?? null);
        setLoaded(true);
        setStatus(
          value
            ? `${value.entries.length} sounds`
            : 'no sound data found (expected sound.mul + soundidx.mul or soundLegacyMUL.uop)'
        );
      })
      .catch((cause: unknown) => {
        setLoaded(true);
        setStatus(cause instanceof Error ? cause.message : 'load failed');
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const play = async (id: number) => {
    if (!getWav) {
      return;
    }
    const wav = await getWav(id);
    if (!wav) {
      return;
    }
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(new Uint8Array(wav).buffer);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start();
    } finally {
      void context.close();
    }
  };

  const exportWav = async (id: number, name: string) => {
    if (!getWav) {
      return;
    }
    const wav = await getWav(id);
    if (!wav) {
      return;
    }
    const url = URL.createObjectURL(new Blob([new Uint8Array(wav).buffer], { type: 'audio/wav' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name || `sound_${id}`}.wav`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const needle = search.trim().toLowerCase();
  const filtered = (entries ?? []).filter(
    (entry) => needle.length === 0 || entry.name.toLowerCase().includes(needle) || String(entry.id) === needle
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-bronze/20 px-4 py-3 min-h-14">
        <h1 className="font-serif text-xl tracking-widest text-bronze-bright uppercase">Sounds</h1>
        <input
          className="w-56 rounded border border-bronze/30 bg-ink py-1.5 px-2 text-xs text-parchment/80"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="search sound…"
          value={search}
        />
        <div className="flex-1" />
        <span className="max-w-xl text-xs text-parchment/40">{status}</span>
        <GitHubButton />
      </header>
      <div className="sf-opt scroll-area min-h-0 flex-1 overflow-y-auto">
        {!loaded ? null : entries && entries.length > 0 ? (
          <table className="w-full text-xs">
            <tbody className="text-parchment/70">
              {filtered.map((entry) => (
                <tr className="border-b border-parchment/5" key={entry.id}>
                  <td className="w-16 px-3 py-1 font-mono">{entry.id}</td>
                  <td className="px-3 py-1">{entry.name || '(unnamed)'}</td>
                  <td className="w-20 px-3 py-1 text-parchment/40">{entry.seconds.toFixed(2)}s</td>
                  <td className="w-40 px-3 py-1">
                    <button
                      className="rounded border border-bronze/30 px-2 py-0.5 text-parchment/70"
                      onClick={() => {
                        play(entry.id).catch(() => undefined);
                      }}
                      type="button"
                    >
                      Play
                    </button>
                    <button
                      className="ml-2 rounded border border-bronze/30 px-2 py-0.5 text-parchment/70"
                      onClick={() => {
                        exportWav(entry.id, entry.name).catch(() => undefined);
                      }}
                      type="button"
                    >
                      WAV
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="m-6 rounded border border-bronze/20 px-4 py-3 text-sm text-parchment/50">
            This client stores sounds in <span className="font-mono">soundLegacyMUL.uop</span> chunks with no
            <span className="font-mono"> soundidx.mul</span>, so individual sounds cannot be enumerated or played from
            here.
          </div>
        )}
      </div>
    </div>
  );
}
