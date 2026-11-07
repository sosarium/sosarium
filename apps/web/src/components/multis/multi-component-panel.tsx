import type { MultiComponent } from '@sosarium/formats';

export function formatHex(value: number): string {
  return `0x${value.toString(16).toUpperCase()}`;
}

type ComponentForm = Record<'id' | 'x' | 'y' | 'z', string>;

interface MultiComponentPanelProps {
  form: ComponentForm;
  setForm: (form: ComponentForm) => void;
  applyEdit: (mutate: (components: MultiComponent[]) => MultiComponent[]) => void;
  parseField: (value: string) => number;
  setSaveMsg: (message: string) => void;
  current: MultiComponent | null;
  componentIndex: number;
  setComponentIndex: (index: number) => void;
  componentCount: number;
  componentRows: { component: MultiComponent; slot: number; rowKey: string }[];
}

export function MultiComponentPanel({
  form,
  setForm,
  applyEdit,
  parseField,
  setSaveMsg,
  current,
  componentIndex,
  setComponentIndex,
  componentCount,
  componentRows
}: MultiComponentPanelProps) {
  return (
    <aside className="flex w-96 flex-none flex-col border-l border-bronze/20">
      <div className="border-b border-bronze/20 p-3 text-xs">
        <h2 className="mb-1 text-xs tracking-widest text-parchment/40 uppercase">Component edit</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            className="w-20 rounded border border-bronze/30 bg-ink px-2 py-1 text-parchment/80"
            onChange={(event) => setForm({ ...form, id: event.target.value })}
            value={form.id}
          />
          <input
            className="w-12 rounded border border-bronze/30 bg-ink px-1.5 py-1 text-parchment/80"
            onChange={(event) => setForm({ ...form, x: event.target.value })}
            value={form.x}
          />
          <input
            className="w-12 rounded border border-bronze/30 bg-ink px-1.5 py-1 text-parchment/80"
            onChange={(event) => setForm({ ...form, y: event.target.value })}
            value={form.y}
          />
          <input
            className="w-12 rounded border border-bronze/30 bg-ink px-1.5 py-1 text-parchment/80"
            onChange={(event) => setForm({ ...form, z: event.target.value })}
            value={form.z}
          />
          <button
            className="rounded border border-bronze/30 px-2 py-1 text-parchment/70"
            onClick={() => {
              applyEdit((components) => [
                ...components,
                {
                  id: parseField(form.id),
                  x: parseField(form.x),
                  y: parseField(form.y),
                  z: parseField(form.z),
                  flags: 1,
                  unk1: 0
                }
              ]);
              setSaveMsg('component added');
            }}
            type="button"
          >
            Add
          </button>
          <button
            className="rounded border border-bronze/30 px-2 py-1 text-parchment/70 disabled:opacity-40"
            disabled={!current}
            onClick={() => {
              applyEdit((components) =>
                components.map((component, index) =>
                  index === componentIndex
                    ? {
                        ...component,
                        id: parseField(form.id),
                        x: parseField(form.x),
                        y: parseField(form.y),
                        z: parseField(form.z)
                      }
                    : component
                )
              );
              setSaveMsg(`component ${componentIndex} updated`);
            }}
            type="button"
          >
            Update
          </button>
          <button
            className="rounded border border-bronze/30 px-2 py-1 text-parchment/70 disabled:opacity-40"
            disabled={!current}
            onClick={() => {
              applyEdit((components) => components.filter((_, index) => index !== componentIndex));
              setComponentIndex(0);
              setSaveMsg(`component ${componentIndex} removed`);
            }}
            type="button"
          >
            Delete
          </button>
        </div>
        <p className="mt-1 text-[10px] text-parchment/30">id / x / y / z · select a component row below</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <h2 className="border-b border-bronze/20 px-3 py-2 text-xs tracking-widest text-parchment/40 uppercase">
          Components ({componentCount})
        </h2>
        <div className="sf-opt scroll-area min-h-0 flex-1 overflow-y-auto px-3 py-2 text-xs">
          <table className="w-full">
            <thead className="text-parchment/40">
              <tr>
                <th className="text-left">#</th>
                <th className="text-left">id</th>
                <th className="text-left">x</th>
                <th className="text-left">y</th>
                <th className="text-left">z</th>
                <th className="text-left">flags</th>
              </tr>
            </thead>
            <tbody className="text-parchment/70">
              {componentRows.map(({ component, slot, rowKey }) => (
                <tr
                  className={slot === componentIndex ? 'bg-bronze/20' : ''}
                  key={rowKey}
                  onClick={() => {
                    setComponentIndex(slot);
                    setForm({
                      id: formatHex(component.id),
                      x: String(component.x),
                      y: String(component.y),
                      z: String(component.z)
                    });
                  }}
                >
                  <td>{slot}</td>
                  <td className="font-mono">{formatHex(component.id)}</td>
                  <td>{component.x}</td>
                  <td>{component.y}</td>
                  <td>{component.z}</td>
                  <td>{component.flags}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </aside>
  );
}
