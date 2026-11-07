export interface BodyconvTables {
  byFileType: Map<number, Map<number, number>>;
}

export function parseBodyconvDef(text: string): BodyconvTables {
  const byFileType = new Map<number, Map<number, number>>();
  for (let fileType = 2; fileType <= 6; fileType++) {
    byFileType.set(fileType, new Map());
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#') || line.startsWith('"')) {
      continue;
    }
    const parts = line.split(/[\t ]+/).filter((part) => part.length > 0);
    const original = Number.parseInt(parts[0] as string, 10);
    if (Number.isNaN(original)) {
      continue;
    }

    for (let column = 1; column <= 5; column++) {
      const parsed = parts.length > column ? Number.parseInt(parts[column] as string, 10) : -1;
      let value = Number.isNaN(parsed) ? -1 : parsed;
      if (value === -1) {
        continue;
      }
      if (column === 1 && value === 68) {
        value = 122;
      }
      const table = byFileType.get(column + 1);
      if (table && !table.has(original)) {
        table.set(original, value);
      }
    }
  }

  return { byFileType };
}

export interface ResolvedBody {
  fileType: number;
  body: number;
}

export function resolveAnimationFile(tables: BodyconvTables, body: number): ResolvedBody {
  for (let fileType = 2; fileType <= 6; fileType++) {
    const mapped = tables.byFileType.get(fileType)?.get(body);
    if (mapped === undefined) {
      continue;
    }
    return { fileType, body: mapped };
  }
  return { fileType: 1, body };
}
