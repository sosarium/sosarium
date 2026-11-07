import {
  columnFilteringFeature,
  createColumnHelper,
  globalFilteringFeature,
  rowSortingFeature,
  tableFeatures,
  useTable
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useState } from 'react';

export interface IndexTableRow {
  index: number;
  name: string;
}

export interface IndexTableProps {
  rows: IndexTableRow[];
  selected: number | null;
  onSelect: (index: number) => void;
  isModified: (index: number) => boolean;
}

const features = tableFeatures({ rowSortingFeature, globalFilteringFeature, columnFilteringFeature });
const helper = createColumnHelper<typeof features, IndexTableRow>();

const columns = helper.columns([
  helper.accessor('index', {
    header: 'ID',
    cell: (info) => `0x${info.getValue().toString(16).toUpperCase().padStart(4, '0')}`
  }),
  helper.accessor('name', { header: 'Name' })
]);

function formatIndex(index: number): string {
  return `0x${index.toString(16).toUpperCase().padStart(4, '0')}`;
}

export function IndexTable({ rows, selected, onSelect, isModified }: IndexTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState('');

  const table = useTable({
    features,
    columns,
    data: rows,
    state: { globalFilter: filter },
    onGlobalFilterChange: (updater) => {
      setFilter(typeof updater === 'function' ? (updater as (value: string) => string)(filter) : updater);
    },
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue ?? '')
        .trim()
        .toLowerCase();
      if (!query) {
        return true;
      }
      const original = row.original;
      return (
        original.name.toLowerCase().includes(query) ||
        formatIndex(original.index).toLowerCase().includes(query) ||
        String(original.index) === query
      );
    },
    initialState: { sorting: [{ id: 'index', desc: false }] }
  });

  const tableRows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 28,
    overscan: 12,
    getItemKey: (index) => tableRows[index]?.id ?? index
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-bronze/20 px-3 py-2">
        <input
          className="w-full rounded border border-bronze/30 bg-ink px-2 py-1.5 text-xs text-parchment/80 placeholder:text-parchment/30"
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by name or id…"
          value={filter}
        />
        <span className="shrink-0 text-xs text-parchment/40">{tableRows.length} rows</span>
      </div>

      <div className="flex border-b border-bronze/10 px-3 py-1.5 text-[10px] tracking-widest text-parchment/40 uppercase">
        {table.getHeaderGroups()[0]?.headers.map((header) => (
          <button
            className="flex-1 cursor-pointer text-left uppercase hover:text-parchment/70"
            key={header.id}
            onClick={header.column.getToggleSortingHandler()}
            type="button"
          >
            <table.FlexRender header={header} />
            {header.column.getIsSorted() === 'asc' ? ' ▲' : header.column.getIsSorted() === 'desc' ? ' ▼' : ''}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        <div className="sf-opt scroll-area h-full overflow-auto" ref={scrollRef}>
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = tableRows[item.index];
              if (!row) {
                return null;
              }
              const modified = isModified(row.original.index);
              return (
                <button
                  className={`absolute left-0 flex w-full items-center gap-2 px-3 text-left text-xs ${
                    selected === row.original.index
                      ? 'bg-bronze/25 text-bronze-bright'
                      : 'text-parchment/75 hover:bg-bronze/10'
                  }`}
                  data-index={item.index}
                  key={row.id}
                  onClick={() => onSelect(row.original.index)}
                  ref={virtualizer.measureElement}
                  style={{ height: 28, transform: `translateY(${item.start}px)` }}
                  type="button"
                >
                  {modified ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-bronze" /> : null}
                  {row.getAllCells().map((cell) => (
                    <span className="min-w-0 flex-1 truncate" key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
