export interface TileFlagDef {
  name: string;
  value: bigint;
}

export const TILE_FLAGS: TileFlagDef[] = [
  { name: 'Background', value: 0x00000001n },
  { name: 'Weapon', value: 0x00000002n },
  { name: 'Transparent', value: 0x00000004n },
  { name: 'Translucent', value: 0x00000008n },
  { name: 'Wall', value: 0x00000010n },
  { name: 'Damaging', value: 0x00000020n },
  { name: 'Impassable', value: 0x00000040n },
  { name: 'Wet', value: 0x00000080n },
  { name: 'Unknown1', value: 0x00000100n },
  { name: 'Surface', value: 0x00000200n },
  { name: 'Bridge', value: 0x00000400n },
  { name: 'Generic', value: 0x00000800n },
  { name: 'Window', value: 0x00001000n },
  { name: 'NoShoot', value: 0x00002000n },
  { name: 'ArticleA', value: 0x00004000n },
  { name: 'ArticleAn', value: 0x00008000n },
  { name: 'ArticleThe', value: 0x00010000n },
  { name: 'Foliage', value: 0x00020000n },
  { name: 'PartialHue', value: 0x00040000n },
  { name: 'NoHouse', value: 0x00080000n },
  { name: 'Map', value: 0x00100000n },
  { name: 'Container', value: 0x00200000n },
  { name: 'Wearable', value: 0x00400000n },
  { name: 'LightSource', value: 0x00800000n },
  { name: 'Animation', value: 0x01000000n },
  { name: 'HoverOver', value: 0x02000000n },
  { name: 'NoDiagonal', value: 0x04000000n },
  { name: 'Armor', value: 0x08000000n },
  { name: 'Roof', value: 0x10000000n },
  { name: 'Door', value: 0x20000000n },
  { name: 'StairBack', value: 0x40000000n },
  { name: 'StairRight', value: 0x80000000n },
  { name: 'AlphaBlend', value: 0x0100000000n },
  { name: 'UseNewArt', value: 0x0200000000n },
  { name: 'ArtUsed', value: 0x0400000000n },
  { name: 'Unused8', value: 0x0800000000n },
  { name: 'NoShadow', value: 0x1000000000n },
  { name: 'PixelBleed', value: 0x2000000000n },
  { name: 'PlayAnimOnce', value: 0x4000000000n },
  { name: 'MultiMovable', value: 0x10000000000n },
  { name: 'Unused10', value: 0x20000000000n },
  { name: 'Unused11', value: 0x40000000000n },
  { name: 'Unused12', value: 0x80000000000n },
  { name: 'Unused13', value: 0x100000000000n },
  { name: 'Unused14', value: 0x200000000000n },
  { name: 'Unused15', value: 0x400000000000n },
  { name: 'Unused16', value: 0x800000000000n },
  { name: 'Unused17', value: 0x1000000000000n },
  { name: 'Unused18', value: 0x2000000000000n },
  { name: 'Unused19', value: 0x4000000000000n },
  { name: 'Unused20', value: 0x8000000000000n },
  { name: 'Unused21', value: 0x10000000000000n },
  { name: 'Unused22', value: 0x20000000000000n },
  { name: 'Unused23', value: 0x40000000000000n },
  { name: 'Unused24', value: 0x80000000000000n },
  { name: 'Unused25', value: 0x100000000000000n },
  { name: 'Unused26', value: 0x200000000000000n },
  { name: 'Unused27', value: 0x400000000000000n },
  { name: 'Unused28', value: 0x800000000000000n },
  { name: 'Unused29', value: 0x1000000000000000n },
  { name: 'Unused30', value: 0x2000000000000000n },
  { name: 'Unused31', value: 0x4000000000000000n },
  { name: 'Unused32', value: 0x8000000000000000n }
];

export function decodeFlags(flags: bigint): string[] {
  const names: string[] = [];
  for (const flag of TILE_FLAGS) {
    if ((flags & flag.value) !== 0n) {
      names.push(flag.name);
    }
  }
  return names;
}

export function encodeFlagNames(names: Iterable<string>): bigint {
  const wanted = new Set(names);
  let flags = 0n;
  for (const flag of TILE_FLAGS) {
    if (wanted.has(flag.name)) {
      flags |= flag.value;
    }
  }
  return flags;
}
