export interface MultiComponent {
  id: number;
  x: number;
  y: number;
  z: number;
  flags: number;
  unk1: number;
}

export interface MultiGroup {
  components: MultiComponent[];
  minX: number;
  minY: number;
  width: number;
  height: number;
  maxHeight: number;
}

export const MULTI_COMPONENT_NEW = 16;
export const MULTI_COMPONENT_OLD = 12;
export const MAXIMUM_MULTI_INDEX = 0x2710;

export function multiFormatFromLength(length: number): 'new' | 'old' | null {
  if (length <= 0) {
    return null;
  }
  if (length % MULTI_COMPONENT_NEW === 0) {
    return 'new';
  }
  if (length % MULTI_COMPONENT_OLD === 0) {
    return 'old';
  }
  return null;
}

export function boundsFor(components: MultiComponent[]): Omit<MultiGroup, 'components'> {
  if (components.length === 0) {
    return { minX: 0, minY: 0, width: 0, height: 0, maxHeight: 0 };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;
  for (const component of components) {
    minX = Math.min(minX, component.x);
    minY = Math.min(minY, component.y);
    maxX = Math.max(maxX, component.x);
    maxY = Math.max(maxY, component.y);
    maxHeight = Math.max(maxHeight, component.z);
  }
  return { minX, minY, width: maxX - minX + 1, height: maxY - minY + 1, maxHeight };
}

export function parseMultiGroup(bytes: Uint8Array, format: 'new' | 'old'): MultiGroup {
  const size = format === 'new' ? MULTI_COMPONENT_NEW : MULTI_COMPONENT_OLD;
  const count = Math.floor(bytes.byteLength / size);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const components: MultiComponent[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * size;
    components[i] = {
      id: view.getUint16(base, true),
      x: view.getInt16(base + 2, true),
      y: view.getInt16(base + 4, true),
      z: view.getInt16(base + 6, true),
      flags: view.getInt32(base + 8, true),
      unk1: format === 'new' ? view.getInt32(base + 12, true) : 0
    };
  }
  return { components, ...boundsFor(components) };
}

export function serializeMultiGroup(group: MultiGroup, format: 'new' | 'old'): Uint8Array {
  const size = format === 'new' ? MULTI_COMPONENT_NEW : MULTI_COMPONENT_OLD;
  const bytes = new Uint8Array(group.components.length * size);
  const view = new DataView(bytes.buffer);
  group.components.forEach((component, i) => {
    const base = i * size;
    view.setUint16(base, component.id & 0xffff, true);
    view.setInt16(base + 2, component.x, true);
    view.setInt16(base + 4, component.y, true);
    view.setInt16(base + 6, component.z, true);
    view.setInt32(base + 8, component.flags, true);
    if (format === 'new') {
      view.setInt32(base + 12, component.unk1, true);
    }
  });
  return bytes;
}

export type GroupedMultiTiles = (MultiComponent[] | undefined)[][];

export function groupToTiles(group: MultiGroup): GroupedMultiTiles {
  const grid: GroupedMultiTiles = Array.from(
    { length: group.width },
    () => new Array(group.height).fill(undefined) as (MultiComponent[] | undefined)[]
  );
  for (const component of group.components) {
    const x = component.x - group.minX;
    const y = component.y - group.minY;
    if (x < 0 || y < 0 || x >= group.width || y >= group.height) {
      continue;
    }
    const cell = grid[x]?.[y];
    if (cell) {
      cell.push(component);
    } else if (grid[x]) {
      grid[x][y] = [component];
    }
  }
  return grid;
}
