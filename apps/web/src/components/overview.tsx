import type { ClientFileEntry, ClientFlavor } from '@sosarium/core';

import { EDITORS } from '@/lib/editors';
import { useSession } from '@/lib/session';

function flavorChips(
  flavor: ClientFlavor,
  files: ClientFileEntry[],
  clientVersion: string | null
): { label: string; value: string | null }[] {
  const names = new Map(files.map((file) => [file.name.toLowerCase(), file.name]));
  const extension = (...candidates: string[]): string | null => {
    for (const candidate of candidates) {
      const actual = names.get(candidate.toLowerCase());
      if (actual) {
        const dot = actual.lastIndexOf('.');
        return dot >= 0 ? actual.slice(dot + 1).toUpperCase() : null;
      }
    }
    return null;
  };
  const cliloc = (): string | null => {
    const enu = extension('cliloc.enu');
    if (enu) {
      return enu;
    }
    for (const [lower, actual] of names) {
      if (lower.startsWith('cliloc.')) {
        return actual.slice(actual.lastIndexOf('.') + 1).toUpperCase();
      }
    }
    return null;
  };
  const generation = (value: 'mul' | 'uop' | null) => (value ? value.toUpperCase() : null);

  return [
    { label: 'Client', value: clientVersion },
    { label: 'Art', value: generation(flavor.art) },
    { label: 'Gumps', value: generation(flavor.gump) },
    { label: 'Animations', value: generation(flavor.anim) },
    { label: 'AnimData', value: extension('animdata.mul') },
    { label: 'Body defs', value: extension('body.def') },
    { label: 'Map', value: generation(flavor.map) },
    { label: 'Facets (x)', value: extension('map0xlegacymul.uop', 'map0x.mul') },
    { label: 'Statics', value: extension('staidx0.mul') },
    { label: 'TileData', value: extension('tiledata.mul') },
    { label: 'Hues', value: extension('hues.mul') },
    { label: 'Skills', value: extension('skills.mul') },
    { label: 'Skill groups', value: extension('skillgrp.mul') },
    { label: 'Multi', value: generation(flavor.multi) },
    { label: 'MultiMap', value: extension('multimap.rle', 'multimap0.mul') },
    { label: 'Radar colors', value: extension('radarcol.mul') },
    { label: 'Light', value: extension('light.mul') },
    { label: 'Textures', value: extension('texmaps.mul') },
    { label: 'Sound', value: generation(flavor.sound) },
    { label: 'Fonts', value: extension('fonts.mul') },
    { label: 'Speech', value: extension('speech.mul') },
    { label: 'CliLoc', value: cliloc() },
    { label: 'Verdata', value: extension('verdata.mul') }
  ];
}

export function Overview() {
  const session = useSession();
  const { flavor, files } = session;

  if (!flavor) {
    return null;
  }

  return (
    <div className="sf-opt scroll-area h-full overflow-y-auto p-8">
      <h1 className="font-serif text-2xl tracking-widest text-bronze-bright uppercase">Overview</h1>
      <p className="mt-1 text-sm text-parchment/50">
        {files.length} files detected{session.name ? ` in ${session.name}` : ''}
        {session.mode === 'readonly' ? ' — read-only session' : ''}
      </p>

      <h2 className="mt-8 text-xs tracking-widest text-parchment/40 uppercase">Detected client files</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {flavorChips(flavor, files, session.clientVersion).map((chip) => (
          <span
            className={`rounded border px-2 py-1 text-xs ${
              chip.value ? 'border-bronze/40 bg-bronze/10 text-bronze-bright' : 'border-parchment/10 text-parchment/30'
            }`}
            key={chip.label}
          >
            {chip.label}
            {chip.value ? <span className="text-parchment/50"> · {chip.value}</span> : null}
          </span>
        ))}
      </div>

      <p className="mt-8 text-sm text-parchment/40">
        {
          EDITORS.filter((editor) => editor.kind !== 'utility' && editor.available(flavor) && editor.status === 'ready')
            .length
        }{' '}
        editors available — pick one from the sidebar.
      </p>
    </div>
  );
}
