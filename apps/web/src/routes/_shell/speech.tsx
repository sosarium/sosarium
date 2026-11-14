import type { SpeechEntry } from '@sosarium/formats';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

import { GitHubButton } from '@/components/github-button';
import { useDocumentMeta } from '@/lib/document-meta';
import { useSession } from '@/lib/session';
import { loadSpeech, saveSpeech } from '@/lib/text-session';

export const Route = createFileRoute('/_shell/speech')({
  component: SpeechPage
});

function SpeechPage() {
  useDocumentMeta('Speech — Sosarium');
  const session = useSession();
  const [entries, setEntries] = useState<SpeechEntry[]>([]);
  const [edits, setEdits] = useState<Map<number, string>>(new Map());
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [keyword, setKeyword] = useState('');
  const [addId, setAddId] = useState('0');
  const [status, setStatus] = useState('idle');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (session.status !== 'ready') {
      setEntries([]);
      return;
    }
    let cancelled = false;
    setStatus('loading speech.mul…');
    loadSpeech()
      .then((value) => {
        if (cancelled) {
          return;
        }
        setEntries(value ?? []);
        setEdits(new Map());
        setStatus(value ? `${value.length} keywords` : 'speech.mul not found');
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

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries
      .map((entry, index) => ({ ...entry, index, keyword: edits.get(index) ?? entry.keyword }))
      .filter((entry) => needle.length === 0 || entry.keyword.includes(needle));
  }, [entries, edits, search]);

  const dirty = edits.size > 0;

  const save = async () => {
    setSaveMsg(null);
    try {
      const merged = entries.map((entry, index) => ({ ...entry, keyword: edits.get(index) ?? entry.keyword }));
      const name = await saveSpeech(merged);
      setEntries(merged);
      setEdits(new Map());
      setSaveMsg(`saved ${name}`);
    } catch (cause) {
      setSaveMsg(cause instanceof Error ? cause.message : 'save failed');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-bronze/20 px-4 py-3 min-h-14">
        <h1 className="font-serif text-xl tracking-widest text-bronze-bright uppercase">Speech</h1>
        <input
          className="w-56 rounded border border-bronze/30 bg-ink py-1.5 px-2 text-xs text-parchment/80"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="search keyword…"
          value={search}
        />
        <div className="flex-1" />
        <span className="text-xs text-parchment/40">
          {status}
          {search.trim() ? ` · ${matches.length} matches` : ''}
          {saveMsg ? ` · ${saveMsg}` : ''}
        </span>
        <button
          className={`rounded border px-3 py-1.5 text-xs tracking-widest uppercase ${
            dirty && session.mode === 'readwrite'
              ? 'border-bronze text-bronze-bright'
              : 'border-bronze/20 text-parchment/30'
          }`}
          disabled={!dirty || session.mode !== 'readwrite'}
          onClick={() => {
            save().catch(() => undefined);
          }}
          type="button"
        >
          Save
        </button>
        <GitHubButton />
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="sf-opt scroll-area min-h-0 flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <tbody className="text-parchment/70">
              {matches.map((entry) => (
                <tr
                  className={`cursor-pointer border-b border-parchment/5 ${
                    entry.index === selected ? 'bg-bronze/20 text-bronze-bright' : 'hover:bg-bronze/10'
                  }`}
                  key={`${entry.index}:${entry.id}`}
                  onClick={() => {
                    setSelected(entry.index);
                    setKeyword(entry.keyword);
                  }}
                >
                  <td className="w-20 px-3 py-1 font-mono">{entry.id}</td>
                  <td className="px-3 py-1">{entry.keyword}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="w-80 flex-none border-l border-bronze/20 p-3 text-xs">
          <h2 className="text-xs tracking-widest text-parchment/40 uppercase">Edit keyword</h2>
          <input
            className="mt-2 w-full rounded border border-bronze/30 bg-ink px-2 py-1 text-parchment/80"
            onChange={(event) => setKeyword(event.target.value)}
            value={keyword}
          />
          <button
            className="mt-2 rounded border border-bronze/30 px-2 py-1 text-parchment/70 disabled:opacity-40"
            disabled={selected === null}
            onClick={() => {
              if (selected === null) {
                return;
              }
              setEdits(new Map(edits).set(selected, keyword));
              setSaveMsg(`order ${selected} updated`);
            }}
            type="button"
          >
            Apply
          </button>

          <h2 className="mt-4 text-xs tracking-widest text-parchment/40 uppercase">Add keyword</h2>
          <div className="mt-2 flex items-center gap-2">
            <input
              className="w-16 rounded border border-bronze/30 bg-ink px-2 py-1 text-parchment/80"
              onChange={(event) => setAddId(event.target.value)}
              value={addId}
            />
            <button
              className="rounded border border-bronze/30 px-2 py-1 text-parchment/70"
              onClick={() => {
                const id = Number.parseInt(addId, 10);
                if (Number.isNaN(id) || keyword.trim().length === 0) {
                  return;
                }
                setEntries([...entries, { id, keyword }]);
                setSaveMsg(`keyword "${keyword}" added`);
              }}
              type="button"
            >
              Add
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
