import { useState } from 'react';

import { imageFileToTile } from '@/lib/art-image';
import { getArtSource, saveArtSource } from '@/lib/art-session';
import { getGumpSource, saveGumpSource } from '@/lib/gumps-session';
import { useSession } from '@/lib/session';

interface ImportReport {
  file: string;
  status: 'imported' | 'skipped' | 'error';
  detail: string;
}

export function ImportPanel() {
  const session = useSession();
  const [status, setStatus] = useState<string | null>(null);
  const [reports, setReports] = useState<ImportReport[]>([]);
  const [importTarget, setImportTarget] = useState<'art' | 'gumps'>('art');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const canWrite = session.mode === 'readwrite';

  const runImport = async (files: FileList) => {
    setBusy(true);
    setReports([]);
    const results: ImportReport[] = [];
    try {
      const source = importTarget === 'art' ? await getArtSource() : await getGumpSource();
      if (!source) {
        throw new Error(`${importTarget} source is not available in this session`);
      }
      for (const file of Array.from(files)) {
        const base = file.name.replace(/\.[^.]+$/, '');
        const parsed = /^0x[0-9a-f]+$/i.test(base) ? Number.parseInt(base, 16) : Number.parseInt(base, 10);
        if (Number.isNaN(parsed) || parsed < 0) {
          results.push({ file: file.name, status: 'skipped', detail: 'filename must be an id (1234 or 0x4D2)' });
          continue;
        }
        const tile = await imageFileToTile(file);
        if (!tile) {
          results.push({ file: file.name, status: 'error', detail: 'could not decode the image' });
          continue;
        }
        if (importTarget === 'art') {
          const art = source as NonNullable<Awaited<ReturnType<typeof getArtSource>>>;
          art.writeStatic(parsed, tile);
        } else {
          const gumps = source as NonNullable<Awaited<ReturnType<typeof getGumpSource>>>;
          gumps.write(parsed, tile);
        }
        results.push({
          file: file.name,
          status: 'imported',
          detail: `id ${parsed} · ${tile.width}×${tile.height}`
        });
      }
      setReports(results);
      setStatus(`${results.filter((entry) => entry.status === 'imported').length} imported — save to write them`);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'import failed');
    } finally {
      setBusy(false);
    }
  };

  const saveImports = async () => {
    setSaving(true);
    try {
      if (importTarget === 'art') {
        const source = await getArtSource();
        if (!source) {
          throw new Error('art source missing');
        }
        await saveArtSource(source);
      } else {
        const source = await getGumpSource();
        if (!source) {
          throw new Error('gump source missing');
        }
        await saveGumpSource(source);
      }
      setStatus(`saved ${importTarget} changes`);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-bronze/20 px-4 py-2">
        <div className="flex-1" />
        <span className="max-w-xl text-xs text-parchment/40">{status ?? '\u00A0'}</span>
        {!canWrite ? <span className="text-xs text-parchment/30">read-only session</span> : null}
      </div>

      <div className="sf-opt scroll-area min-h-0 flex-1 overflow-y-auto p-4 text-xs">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <select
              className="field-select rounded border border-bronze/30 bg-ink py-1.5 pl-2 text-parchment/80"
              onChange={(event) => setImportTarget(event.target.value as 'art' | 'gumps')}
              value={importTarget}
            >
              <option value="art">static art</option>
              <option value="gumps">gumps</option>
            </select>
            <span className="text-parchment/40">PNG files named after their id (1234.png or 0x4D2.png)</span>
            <div className="flex-1" />
            <button
              className="rounded border border-bronze/30 px-3 py-1.5 text-parchment/70 disabled:opacity-40"
              disabled={saving || !canWrite || reports.filter((entry) => entry.status === 'imported').length === 0}
              onClick={() => {
                saveImports().catch(() => undefined);
              }}
              type="button"
            >
              Save imports
            </button>
          </div>
          <input
            accept="image/png"
            multiple
            onChange={(event) => {
              const files = event.target.files;
              if (files && files.length > 0) {
                runImport(files).catch(() => undefined);
              }
              event.target.value = '';
            }}
            type="file"
          />
          {busy ? <p className="text-parchment/40">importing…</p> : null}
          {reports.length > 0 ? (
            <table className="w-full">
              <thead className="text-parchment/40">
                <tr>
                  <th className="text-left">file</th>
                  <th className="text-left">status</th>
                  <th className="text-left">detail</th>
                </tr>
              </thead>
              <tbody className="text-parchment/70">
                {reports.map((report) => (
                  <tr key={`${report.file}-${report.status}`}>
                    <td className="font-mono">{report.file}</td>
                    <td>{report.status}</td>
                    <td className="text-parchment/50">{report.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </div>
  );
}
