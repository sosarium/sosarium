import type { ClientFlavor } from '@sosarium/core';

export interface EditorDef {
  id: string;
  label: string;
  route: string;
  kind?: 'utility';
  available: (flavor: ClientFlavor) => boolean;
  status: 'ready' | 'planned';
}

export const EDITORS: EditorDef[] = [
  {
    id: 'art',
    label: 'Art',
    route: '/art',
    available: (flavor) => Boolean(flavor.art),
    status: 'ready'
  },
  {
    id: 'gumps',
    label: 'Gumps',
    route: '/gumps',
    available: (flavor) => Boolean(flavor.gump),
    status: 'ready'
  },
  {
    id: 'animations',
    label: 'Animations',
    route: '/animations',
    available: (flavor) => Boolean(flavor.anim) || flavor.animData,
    status: 'ready'
  },
  {
    id: 'tiledata',
    label: 'TileData',
    route: '/tiledata',
    available: (flavor) => flavor.tiledata,
    status: 'ready'
  },
  {
    id: 'hues',
    label: 'Hues',
    route: '/hues',
    available: (flavor) => flavor.hues,
    status: 'ready'
  },
  {
    id: 'map',
    label: 'Map',
    route: '/map',
    available: (flavor) => Boolean(flavor.map) && flavor.statics,
    status: 'ready'
  },
  {
    id: 'facets',
    label: 'Facets',
    route: '/facets',
    available: (flavor) => Boolean(flavor.map) && flavor.statics,
    status: 'ready'
  },
  {
    id: 'multis',
    label: 'Multis',
    route: '/multis',
    available: (flavor) => Boolean(flavor.multi),
    status: 'ready'
  },
  {
    id: 'cliloc',
    label: 'CliLoc',
    route: '/cliloc',
    available: (flavor) => flavor.cliloc,
    status: 'ready'
  },
  {
    id: 'sounds',
    label: 'Sounds',
    route: '/sounds',
    available: (flavor) => Boolean(flavor.sound),
    status: 'ready'
  },
  {
    id: 'light',
    label: 'Light',
    route: '/light',
    available: (flavor) => flavor.light,
    status: 'ready'
  },
  {
    id: 'textures',
    label: 'Textures',
    route: '/textures',
    available: (flavor) => flavor.textures,
    status: 'ready'
  },
  {
    id: 'fonts',
    label: 'Fonts',
    route: '/fonts',
    available: (flavor) => flavor.fonts,
    status: 'ready'
  },
  {
    id: 'speech',
    label: 'Speech',
    route: '/speech',
    available: (flavor) => flavor.speech,
    status: 'ready'
  },
  {
    id: 'skillgroups',
    label: 'Skill groups',
    route: '/skillgroups',
    available: (flavor) => flavor.skills && flavor.skillGroups,
    status: 'ready'
  },
  {
    id: 'skills',
    label: 'Skills',
    route: '/skills',
    available: (flavor) => flavor.skills && flavor.skillGroups,
    status: 'ready'
  },
  {
    id: 'radarcol',
    label: 'Radar colors',
    route: '/radarcol',
    available: (flavor) => flavor.radarcol,
    status: 'ready'
  },
  {
    id: 'options',
    label: 'Options',
    route: '/options',
    kind: 'utility',
    available: () => true,
    status: 'ready'
  },
  {
    id: 'plugins',
    label: 'Plugins',
    route: '/plugins',
    kind: 'utility',
    available: () => true,
    status: 'ready'
  },
  {
    id: 'verdata',
    label: 'Verdata',
    route: '/verdata',
    available: (flavor) => flavor.verdata,
    status: 'ready'
  }
];
