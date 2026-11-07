import type { AnimdataEntry } from '@sosarium/formats';

interface AnimdataBarProps {
  animdataEntry: AnimdataEntry | null;
  animdataId: number | null;
  canWrite: boolean;
  saveMessage: string | null;
  updateAnimdata: (field: 'frameCount' | 'frameInterval' | 'frameStart', value: number) => void;
}

export function AnimdataBar({ animdataEntry, animdataId, canWrite, saveMessage, updateAnimdata }: AnimdataBarProps) {
  return (
    <div className="flex flex-none flex-wrap items-center gap-3 border-t border-bronze/20 px-4 py-2 text-xs text-parchment/50">
      <span className="tracking-widest text-parchment/40 uppercase">AnimData</span>
      {animdataEntry && animdataId !== null ? (
        <>
          <label className="flex items-center gap-1.5">
            frames
            <input
              className="w-14 rounded border border-bronze/30 bg-ink px-1.5 py-0.5 text-parchment/80"
              max={255}
              min={0}
              onChange={(event) => updateAnimdata('frameCount', Number(event.target.value))}
              type="number"
              value={animdataEntry.frameCount}
            />
          </label>
          <label className="flex items-center gap-1.5">
            interval
            <input
              className="w-14 rounded border border-bronze/30 bg-ink px-1.5 py-0.5 text-parchment/80"
              max={255}
              min={0}
              onChange={(event) => updateAnimdata('frameInterval', Number(event.target.value))}
              type="number"
              value={animdataEntry.frameInterval}
            />
          </label>
          <label className="flex items-center gap-1.5">
            start
            <input
              className="w-14 rounded border border-bronze/30 bg-ink px-1.5 py-0.5 text-parchment/80"
              max={255}
              min={0}
              onChange={(event) => updateAnimdata('frameStart', Number(event.target.value))}
              type="number"
              value={animdataEntry.frameStart}
            />
          </label>
          <span className="text-parchment/30">id {animdataId}</span>
        </>
      ) : (
        <span className="text-parchment/30">no entries for id {animdataId} — legacy animation data only</span>
      )}
      {!canWrite ? <span className="ml-auto text-parchment/30">read-only session</span> : null}
      {saveMessage ? <span className="ml-auto text-bronze-bright/80">{saveMessage}</span> : null}
    </div>
  );
}
