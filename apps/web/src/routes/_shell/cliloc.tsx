import type { ClilocFile } from '@sosarium/formats';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { GitHubButton } from '@/components/github-button';
import { useSession } from '@/lib/session';
import { listClilocLocales, loadCliloc, saveCliloc } from '@/lib/text-session';

export const Route = createFileRoute('/_shell/cliloc')({
  component: ClilocPage
});

const ROW_HEIGHT = 26;

function ClilocPage() {
  const session = useSession();
  const [locale, setLocale] = useState('enu');
  const [file, setFile] = useState<ClilocFile | null>(null);
  const [edits, setEdits] = useState<Map<number, { text: string; flag: number }>>(new Map());
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [added, setAdded] = useState<{ number: number; flag: number; text: string }[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [form, setForm] = useState({ number: '1000000', flag: '0', text: '' });
  const [status, setStatus] = useState('idle');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState({ top: 0, height: 0 });

  const locales = useMemo(() => listClilocLocales(session), [session]);

  useEffect(() => {
    if (session.status !== 'ready') {
      setFile(null);
      return;
    }
    const available = listClilocLocales(session);
    if (available.length > 0 && !available.some((entry) => entry.locale === locale)) {
      setLocale(available[0]?.locale ?? 'enu');
      return;
    }
    let cancelled = false;
    setStatus('loading cliloc…');
    loadCliloc(locale)
      .then((value) => {
        if (cancelled) {
          return;
        }
        setFile(value);
        setEdits(new Map());
        setRemoved(new Set());
        setAdded([]);
        setSelected(value?.entries[0]?.number ?? null);
        setStatus(value ? `${value.entries.length} entries${value.compressed ? ' · compressed' : ''}` : 'not found');
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setStatus(cause instanceof Error ? cause.message : 'load failed');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session, locale]);

  const matches = useMemo(() => {
    if (!file) {
      return [];
    }
    const needle = search.trim().toLowerCase();
    const list = file.entries.filter((entry) => !removed.has(entry.number));
    return needle.length === 0 ? list : list.filter((entry) => entry.text.toLowerCase().includes(needle));
  }, [file, search, removed]);

  const entriesByNumber = useMemo(() => new Map((file?.entries ?? []).map((entry) => [entry.number, entry])), [file]);

  useEffect(() => {
    const element = listRef.current;
    if (!element) {
      return;
    }
    const measure = () => setList({ top: element.scrollTop, height: element.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  const firstRow = Math.max(0, Math.floor(list.top / ROW_HEIGHT) - 4);
  const lastRow = Math.min(matches.length - 1, Math.ceil((list.top + list.height) / ROW_HEIGHT) + 4);
  const visible = matches.slice(firstRow, lastRow + 1);

  const current = useMemo(() => {
    if (!file || selected === null) {
      return null;
    }
    const edit = edits.get(selected);
    const entry = entriesByNumber.get(selected) ?? null;
    return entry ? { ...entry, text: edit?.text ?? entry.text, flag: edit?.flag ?? entry.flag } : null;
  }, [entriesByNumber, file, selected, edits]);

  const dirty = edits.size > 0 || removed.size > 0 || added.length > 0;

  const save = async () => {
    if (!file) {
      return;
    }
    setSaveMsg(null);
    try {
      const entries = file.entries
        .filter((entry) => !removed.has(entry.number))
        .map((entry) => {
          const edit = edits.get(entry.number);
          return edit ? { ...entry, ...edit } : entry;
        })
        .concat(added);
      const name = await saveCliloc({ ...file, entries });
      setFile({ ...file, entries });
      setEdits(new Map());
      setRemoved(new Set());
      setAdded([]);
      setSaveMsg(`saved ${name}`);
    } catch (cause) {
      setSaveMsg(cause instanceof Error ? cause.message : 'save failed');
    }
  };

  const exportCsv = () => {
    if (!file) {
      return;
    }
    const lines = ['Number;Flag;Text'];
    for (const entry of file.entries) {
      const edit = edits.get(entry.number);
      const text = (edit?.text ?? entry.text).replace(/;/g, ',');
      lines.push(`${entry.number};${edit?.flag ?? entry.flag};${text}`);
    }
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `Cliloc.${locale}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-bronze/20 px-4 py-3 min-h-14">
        <h1 className="font-serif text-xl tracking-widest text-bronze-bright uppercase">Cliloc</h1>
        <select
          className="field-select rounded border border-bronze/30 bg-ink py-1.5 pl-2 text-xs text-parchment/80"
          onChange={(event) => setLocale(event.target.value)}
          value={locale}
        >
          {locales.map((entry) => (
            <option key={entry.locale} value={entry.locale}>
              {entry.name}
            </option>
          ))}
          {locales.length === 0 ? <option value="enu">Cliloc.enu</option> : null}
        </select>
        <input
          className="w-64 rounded border border-bronze/30 bg-ink px-2 py-1.5 text-xs text-parchment/80"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="search text…"
          value={search}
        />
        <button
          className="rounded border border-bronze/30 px-3 py-1.5 text-xs text-parchment/70"
          onClick={exportCsv}
          type="button"
        >
          Export CSV
        </button>
        <div className="flex-1" />
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
        <div
          className="sf-opt scroll-area min-h-0 flex-1 overflow-y-auto text-xs"
          onScroll={(event) => {
            const top = event.currentTarget.scrollTop;
            setList((current) => ({ ...current, top }));
          }}
          ref={listRef}
        >
          <div style={{ height: matches.length * ROW_HEIGHT, position: 'relative' }}>
            {visible.map((entry, offset) => {
              const edit = edits.get(entry.number);
              return (
                <button
                  className={`absolute left-0 flex w-full items-center border-b border-parchment/5 text-left ${
                    entry.number === selected
                      ? 'bg-bronze/20 text-bronze-bright'
                      : 'text-parchment/70 hover:bg-bronze/10'
                  }`}
                  key={entry.number}
                  onClick={() => {
                    setSelected(entry.number);
                    setForm({
                      number: String(entry.number),
                      flag: String(edit?.flag ?? entry.flag),
                      text: edit?.text ?? entry.text
                    });
                  }}
                  style={{ height: ROW_HEIGHT, top: (firstRow + offset) * ROW_HEIGHT }}
                  type="button"
                >
                  <span className="w-24 shrink-0 px-3 font-mono">{entry.number}</span>
                  <span className="min-w-0 truncate px-3">{edit?.text ?? entry.text}</span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="flex w-96 flex-none flex-col border-l border-bronze/20 p-3 text-xs">
          <h2 className="text-xs tracking-widest text-parchment/40 uppercase">Entry</h2>
          {current ? (
            <>
              <label className="mt-2 flex items-center gap-2">
                number
                <input
                  className="w-32 rounded border border-bronze/30 bg-ink px-2 py-1 text-parchment/60"
                  readOnly
                  value={current.number}
                />
              </label>
              <label className="mt-2 flex items-center gap-2">
                flag
                <input
                  className="w-20 rounded border border-bronze/30 bg-ink px-2 py-1 text-parchment/80"
                  onChange={(event) => setForm({ ...form, flag: event.target.value })}
                  value={form.flag}
                />
              </label>
              <textarea
                className="mt-2 h-40 w-full rounded border border-bronze/30 bg-ink px-2 py-1 text-parchment/80"
                onChange={(event) => setForm({ ...form, text: event.target.value })}
                value={form.text}
              />
              <div className="mt-2 flex gap-2">
                <button
                  className="rounded border border-bronze/30 px-2 py-1 text-parchment/70"
                  onClick={() => {
                    setEdits(
                      new Map(edits).set(current.number, { text: form.text, flag: Number.parseInt(form.flag, 10) || 0 })
                    );
                    setSaveMsg(`entry ${current.number} updated`);
                  }}
                  type="button"
                >
                  Apply
                </button>
                <button
                  className="rounded border border-bronze/30 px-2 py-1 text-parchment/70"
                  onClick={() => {
                    setRemoved(new Set(removed).add(current.number));
                    const next = new Map(edits);
                    next.delete(current.number);
                    setEdits(next);
                    setSaveMsg(`entry ${current.number} removed`);
                  }}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </>
          ) : (
            <p className="mt-2 text-parchment/40">select an entry</p>
          )}

          <h2 className="mt-4 text-xs tracking-widest text-parchment/40 uppercase">Add entry</h2>
          <input
            className="mt-2 w-32 rounded border border-bronze/30 bg-ink px-2 py-1 text-parchment/80"
            onChange={(event) => setForm({ ...form, number: event.target.value })}
            value={form.number}
          />
          <button
            className="mt-2 rounded border border-bronze/30 px-2 py-1 text-parchment/70"
            onClick={() => {
              const number = Number.parseInt(form.number, 10);
              if (Number.isNaN(number)) {
                return;
              }
              setAdded([...added, { number, flag: Number.parseInt(form.flag, 10) || 0, text: form.text }]);
              setSaveMsg(`entry ${number} added`);
            }}
            type="button"
          >
            Add
          </button>
          {added.length > 0 ? <p className="mt-2 text-parchment/40">{added.length} pending addition(s)</p> : null}
        </aside>
      </div>

      <footer className="mt-auto flex min-h-11 items-center justify-between gap-4 border-t border-bronze/20 px-4 py-1.5 text-xs text-parchment/40">
        <span className="truncate">
          {status}
          {search.trim() ? ` · ${matches.length} shown` : ''}
        </span>
        <span className="truncate">{saveMsg ?? ''}</span>
      </footer>
    </div>
  );
}
