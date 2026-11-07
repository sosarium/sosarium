import { BlobByteSource, readUopContainer } from '@sosarium/core';
import { packArtMul, packGumpMul, packMapMul } from '@sosarium/formats';
import { useEffect, useState } from 'react';

import { findFile } from '@/lib/file-access';
import { useSession } from '@/lib/session';
import { readSessionBytes, writeSessionBytes } from '@/plugins/shared/session';

interface PackJob {
  label: string;
  output: string;
  run: () => Promise<{ bytes: number; entries: number }>;
}

export function PackPanel() {
  const session = useSession();
  const [status, setStatus] = useState<string | null>(null);
  const [packJobs, setPackJobs] = useState<PackJob[]>([]);
  const [busy, setBusy] = useState(false);
  const canWrite = session.mode === 'readwrite';

  useEffect(() => {
    if (session.status !== 'ready') {
      setPackJobs([]);
      return;
    }
    const jobs: PackJob[] = [];

    const artIdx = findFile(session, 'artidx.mul');
    const artMul = findFile(session, 'art.mul');
    if (artIdx && artMul) {
      jobs.push({
        label: 'art.mul → artLegacyMUL.uop',
        output: 'artLegacyMUL.uop',
        run: async () => {
          const idx = await readSessionBytes(session, artIdx);
          const mul = await readSessionBytes(session, artMul);
          if (!idx || !mul) {
            throw new Error('could not read art.mul/artidx.mul');
          }
          const bytes = await packArtMul({ idx, mul });
          await writeSessionBytes(session, 'artLegacyMUL.uop', bytes);
          const container = await readUopContainer(new BlobByteSource(new Blob([new Uint8Array(bytes).buffer])));
          return { bytes: bytes.byteLength, entries: container.entryCount };
        }
      });
    }

    const gumpIdx = findFile(session, 'gumpidx.mul');
    const gumpMul = findFile(session, 'gumpart.mul');
    if (gumpIdx && gumpMul) {
      jobs.push({
        label: 'gumpart.mul → gumpartLegacyMUL.uop',
        output: 'gumpartLegacyMUL.uop',
        run: async () => {
          const idx = await readSessionBytes(session, gumpIdx);
          const mul = await readSessionBytes(session, gumpMul);
          if (!idx || !mul) {
            throw new Error('could not read gumpart.mul/gumpidx.mul');
          }
          const bytes = await packGumpMul({ idx, mul });
          await writeSessionBytes(session, 'gumpartLegacyMUL.uop', bytes);
          const container = await readUopContainer(new BlobByteSource(new Blob([new Uint8Array(bytes).buffer])));
          return { bytes: bytes.byteLength, entries: container.entryCount };
        }
      });
    }

    for (let facet = 0; facet <= 5; facet++) {
      const name = findFile(session, `map${facet}.mul`);
      if (!name) {
        continue;
      }
      jobs.push({
        label: `map${facet}.mul → map${facet}LegacyMUL.uop`,
        output: `map${facet}LegacyMUL.uop`,
        run: async () => {
          const mul = await readSessionBytes(session, name);
          if (!mul) {
            throw new Error(`could not read map${facet}.mul`);
          }
          const bytes = await packMapMul(mul, facet);
          await writeSessionBytes(session, `map${facet}LegacyMUL.uop`, bytes);
          const container = await readUopContainer(new BlobByteSource(new Blob([new Uint8Array(bytes).buffer])));
          return { bytes: bytes.byteLength, entries: container.entryCount };
        }
      });
    }

    setPackJobs(jobs);
  }, [session]);

  const runPack = async (job: PackJob) => {
    setBusy(true);
    setStatus(`packing ${job.label}…`);
    try {
      const result = await job.run();
      setStatus(`packed ${job.output} · ${result.entries} entries · ${result.bytes} bytes (verified by re-reading)`);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'pack failed');
    } finally {
      setBusy(false);
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
          <p className="text-parchment/50">
            Converts legacy .mul file sets found in the open folder into UOP containers, then re-reads the written file
            to verify the entry count.
          </p>
          {packJobs.length === 0 ? (
            <p className="text-parchment/40">
              No legacy .mul sets detected in this session (this client already ships everything as UOP).
            </p>
          ) : (
            packJobs.map((job) => (
              <div className="flex items-center gap-3 rounded border border-bronze/20 px-3 py-2" key={job.output}>
                <span className="font-mono text-parchment/70">{job.label}</span>
                <div className="flex-1" />
                <button
                  className="rounded border border-bronze/30 px-2 py-1 text-parchment/70 disabled:opacity-40"
                  disabled={busy || !canWrite}
                  onClick={() => {
                    runPack(job).catch(() => undefined);
                  }}
                  type="button"
                >
                  Pack
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
