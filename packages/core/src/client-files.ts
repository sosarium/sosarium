export interface ClientFileEntry {
  name: string;
  size: number;
  lastModified: number;
}

export type FileGeneration = 'mul' | 'uop' | null;

export interface ClientFlavor {
  clientExe: boolean;
  art: FileGeneration;
  gump: FileGeneration;
  anim: FileGeneration;
  animData: boolean;
  animDefs: boolean;
  bodyDefs: boolean;
  map: FileGeneration;
  mapX: boolean;
  statics: boolean;
  tiledata: boolean;
  hues: boolean;
  skills: boolean;
  skillGroups: boolean;
  multi: FileGeneration;
  multiMap: boolean;
  radarcol: boolean;
  light: boolean;
  textures: boolean;
  sound: FileGeneration;
  fonts: boolean;
  speech: boolean;
  cliloc: boolean;
  verdata: boolean;
}

export function detectClientFlavor(names: Iterable<string>): ClientFlavor {
  const set = new Set<string>();
  for (const name of names) {
    set.add(name.toLowerCase());
  }

  const has = (name: string) => set.has(name);
  const hasAll = (...names: string[]) => names.every(has);
  const hasPrefix = (prefix: string, suffix = '') =>
    [...set].some((name) => name.startsWith(prefix) && name.endsWith(suffix));

  return {
    clientExe: has('client.exe'),
    art: hasAll('art.mul', 'artidx.mul') ? 'mul' : has('artlegacymul.uop') ? 'uop' : null,
    gump: hasAll('gumpart.mul', 'gumpidx.mul') ? 'mul' : has('gumpartlegacymul.uop') ? 'uop' : null,
    anim: hasAll('anim.mul', 'anim.idx') ? 'mul' : hasPrefix('animationframe', '.uop') ? 'uop' : null,
    animData: has('animdata.mul'),
    animDefs: hasPrefix('anim', '.def'),
    bodyDefs: has('body.def'),
    map: has('map0.mul') ? 'mul' : has('map0legacymul.uop') ? 'uop' : null,
    mapX: has('map0xlegacymul.uop'),
    statics: hasAll('staidx0.mul', 'statics0.mul'),
    tiledata: has('tiledata.mul'),
    hues: has('hues.mul'),
    skills: has('skills.mul'),
    skillGroups: has('skillgrp.mul'),
    multi: hasAll('multi.mul', 'multi.idx') ? 'mul' : has('multicollection.uop') ? 'uop' : null,
    multiMap: has('multimap.rle') || has('multimap0.mul'),
    radarcol: has('radarcol.mul'),
    light: hasAll('light.mul', 'lightidx.mul'),
    textures: hasAll('texmaps.mul', 'texidx.mul'),
    sound: hasAll('sound.mul', 'soundidx.mul') ? 'mul' : has('soundlegacymul.uop') ? 'uop' : null,
    fonts: has('fonts.mul'),
    speech: has('speech.mul'),
    cliloc: hasPrefix('cliloc.'),
    verdata: has('verdata.mul')
  };
}

export function isUoClientFolder(flavor: ClientFlavor): boolean {
  return Boolean(
    flavor.art ||
      flavor.gump ||
      flavor.anim ||
      flavor.map ||
      flavor.tiledata ||
      flavor.hues ||
      flavor.skills ||
      flavor.sound ||
      flavor.fonts ||
      flavor.cliloc ||
      flavor.statics
  );
}
