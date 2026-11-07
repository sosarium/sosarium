interface PeSection {
  virtualAddress: number;
  virtualSize: number;
  rawPointer: number;
  rawSize: number;
}

interface PeLayout {
  sections: PeSection[];
  resourceBase: number;
  resourceSize: number;
}

function readU16(view: DataView, offset: number): number | null {
  return offset + 2 <= view.byteLength ? view.getUint16(offset, true) : null;
}

function readU32(view: DataView, offset: number): number | null {
  return offset + 4 <= view.byteLength ? view.getUint32(offset, true) : null;
}

function readWString(bytes: Uint8Array, offset: number, maxChars?: number): string {
  let text = '';
  const limit = maxChars ?? Math.floor((bytes.byteLength - offset) / 2);
  for (let i = 0; i < limit; i++) {
    const index = offset + i * 2;
    if (index + 1 >= bytes.byteLength) {
      break;
    }
    const code = (bytes[index] as number) | ((bytes[index + 1] as number) << 8);
    if (code === 0) {
      break;
    }
    text += String.fromCharCode(code);
  }
  return text;
}

function align4(value: number): number {
  return (value + 3) & ~3;
}

function parsePeLayout(view: DataView): PeLayout | null {
  if (readU16(view, 0) !== 0x5a4d) {
    return null;
  }
  const peOffset = readU32(view, 0x3c);
  if (peOffset === null || readU32(view, peOffset) !== 0x00004550) {
    return null;
  }
  const coffOffset = peOffset + 4;
  const sectionCount = readU16(view, coffOffset + 2);
  const optionalSize = readU16(view, coffOffset + 16);
  if (sectionCount === null || optionalSize === null) {
    return null;
  }
  const optionalOffset = coffOffset + 20;
  const magic = readU16(view, optionalOffset);
  if (magic !== 0x10b && magic !== 0x20b) {
    return null;
  }
  const dataDirectoryOffset = optionalOffset + (magic === 0x10b ? 96 : 112);
  const resourceRva = readU32(view, dataDirectoryOffset + 2 * 8);
  const resourceSize = readU32(view, dataDirectoryOffset + 2 * 8 + 4);
  if (resourceRva === null || resourceSize === null || resourceRva === 0 || resourceSize === 0) {
    return null;
  }

  const sections: PeSection[] = [];
  const sectionOffset = optionalOffset + optionalSize;
  for (let i = 0; i < sectionCount; i++) {
    const base = sectionOffset + i * 40;
    const virtualSize = readU32(view, base + 8);
    const virtualAddress = readU32(view, base + 12);
    const rawSize = readU32(view, base + 16);
    const rawPointer = readU32(view, base + 20);
    if (virtualSize === null || virtualAddress === null || rawSize === null || rawPointer === null) {
      return null;
    }
    sections.push({ virtualAddress, virtualSize, rawPointer, rawSize });
  }

  const rvaToOffset = (rva: number): number | null => {
    for (const section of sections) {
      const size = Math.max(section.virtualSize, section.rawSize);
      if (rva >= section.virtualAddress && rva < section.virtualAddress + size) {
        const delta = rva - section.virtualAddress;
        if (delta >= section.rawSize) {
          return null;
        }
        return section.rawPointer + delta;
      }
    }
    return null;
  };

  const resourceBase = rvaToOffset(resourceRva);
  if (resourceBase === null) {
    return null;
  }
  return { sections, resourceBase, resourceSize };
}

function findVersionResource(view: DataView, layout: PeLayout): { offset: number; size: number } | null {
  const base = layout.resourceBase;
  const limit = Math.min(base + layout.resourceSize, view.byteLength);

  const findEntry = (directoryOffset: number, wanted: number | null, depth: number): number | null => {
    if (depth > 3 || directoryOffset + 16 > limit) {
      return null;
    }
    const named = view.getUint16(directoryOffset + 12, true);
    const ids = view.getUint16(directoryOffset + 14, true);
    const entriesOffset = directoryOffset + 16;
    for (let i = 0; i < named + ids; i++) {
      const entry = entriesOffset + i * 8;
      if (entry + 8 > limit) {
        return null;
      }
      const nameOrId = view.getUint32(entry, true);
      const target = view.getUint32(entry + 4, true);
      const isSubdirectory = (target & 0x80000000) !== 0;
      const targetOffset = base + (target & 0x7fffffff);
      if (wanted === null || nameOrId === wanted) {
        if (isSubdirectory) {
          return findEntry(targetOffset, null, depth + 1);
        }
        return target & 0x7fffffff;
      }
    }
    return null;
  };

  const dataEntryOffset = findEntry(base, 16, 0);
  if (dataEntryOffset === null) {
    return null;
  }
  const entryOffset = base + dataEntryOffset;
  if (entryOffset + 8 > limit) {
    return null;
  }
  const dataRva = view.getUint32(entryOffset, true);
  const size = view.getUint32(entryOffset + 4, true);
  for (const section of layout.sections) {
    const address = section.virtualAddress;
    const sectionSize = Math.max(section.virtualSize, section.rawSize);
    if (dataRva >= address && dataRva < address + sectionSize) {
      const delta = dataRva - address;
      if (delta >= section.rawSize) {
        return null;
      }
      return { offset: section.rawPointer + delta, size };
    }
  }
  return null;
}

function normalizeVersionString(value: string): string | null {
  const parts = value
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.length > 4) {
    return null;
  }
  if (!parts.every((part) => /^\d{1,5}$/.test(part))) {
    return null;
  }
  return parts.join('.');
}

function parseVersionInfo(bytes: Uint8Array, base: number, end: number): string | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let stringVersion: string | null = null;
  let fixedVersion: string | null = null;

  const visit = (offset: number, depth: number) => {
    if (depth > 6 || offset + 6 > end) {
      return;
    }
    const length = readU16(view, offset);
    const valueLength = readU16(view, offset + 2);
    const valueType = readU16(view, offset + 4);
    if (length === null || valueLength === null || valueType === null || length < 6) {
      return;
    }
    const nodeEnd = Math.min(offset + length, end);
    const key = readWString(bytes, offset + 6);
    if (!key) {
      return;
    }
    const valueOffset = align4(offset + 6 + (key.length + 1) * 2);

    if (key === 'VS_VERSION_INFO') {
      if (valueLength >= 52 && readU32(view, valueOffset) === 0xfeef04bd) {
        const ms = readU32(view, valueOffset + 8);
        const ls = readU32(view, valueOffset + 12);
        if (ms !== null && ls !== null) {
          fixedVersion = `${ms >>> 16}.${ms & 0xffff}.${ls >>> 16}.${ls & 0xffff}`;
        }
      }
      let child = align4(valueOffset + valueLength);
      while (child + 6 <= nodeEnd) {
        visit(child, depth + 1);
        const childLength = readU16(view, child);
        if (!childLength) {
          break;
        }
        child = align4(child + childLength);
      }
      return;
    }

    if (key === 'StringFileInfo' || /^[0-9a-fA-F]{8}$/.test(key)) {
      let child = valueOffset;
      while (child + 6 <= nodeEnd) {
        visit(child, depth + 1);
        const childLength = readU16(view, child);
        if (!childLength) {
          break;
        }
        child = align4(child + childLength);
      }
      return;
    }

    if (key === 'FileVersion' && valueLength > 0 && stringVersion === null) {
      const value = readWString(bytes, valueOffset, valueLength);
      stringVersion = normalizeVersionString(value);
    }
  };

  visit(base, 0);
  return stringVersion ?? fixedVersion;
}

export function detectClientVersion(bytes: Uint8Array): string | null {
  try {
    if (bytes.byteLength < 0x40) {
      return null;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const layout = parsePeLayout(view);
    if (!layout) {
      return null;
    }
    const resource = findVersionResource(view, layout);
    if (!resource || resource.offset + 6 > bytes.byteLength) {
      return null;
    }
    return parseVersionInfo(bytes, resource.offset, Math.min(resource.offset + resource.size, bytes.byteLength));
  } catch {
    return null;
  }
}
