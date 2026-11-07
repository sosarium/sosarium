# [Sosarium](https://sosarium.com)

A viewer and editor for Ultima Online 2D client files (art, gumps, animations, maps, tiledata, hues, and more), running entirely in the browser.

Everything runs client-side: point Sosarium at your game files folder, files are read locally through the File System Access API, parsed and rendered in the browser, and saved back to the same folder. Nothing is uploaded anywhere.

## Editors

| Editor             | Reads                                                               | Writes                                    | Notes                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art (land & items) | MUL + UOP                                                           | MUL + UOP                                 | tile grid, detail, PNG import/export                                                                                                                                   |
| Gumps              | MUL + UOP                                                           | MUL + UOP                                 | grid, detail, PNG import/export                                                                                                                                        |
| Animations         | MUL (`anim*.mul`) + `AnimationFrame*.uop` + `AnimationSequence.uop` | MUL + UOP + `animdata.mul`                | player, frame strip, frame import/export, animdata fields, defrag-safe rewrites                                                                                        |
| TileData           | `tiledata.mul` (old/new layouts)                                    | `tiledata.mul`                            | sortable/filterable list, flag editor, byte-exact re-serialise                                                                                                         |
| Hues               | `hues.mul`                                                          | `hues.mul`                                | group list, 32-colour editor, shared hue ramp                                                                                                                          |
| Map                | `map*LegacyMUL.uop`, `staidx`/`statics`, `radarcol.mul`             | UOP + `staidx`/`statics` + `radarcol.mul` | named facets (Felucca…TerMuur), drag-pan, wheel zoom (2×–16×), whole-facet overview minimap, land/static editing, region copy, radar recolor, statics rebuild (defrag) |
| Facets             | `map*LegacyMUL.uop`, `staidx`/`statics`, `radarcol.mul`             | —                                         | full-facet scrollable maps (1×/2×/4× px per tile), named facets, statics overlay, minimap jump, coordinate jump                                                        |
| Multis             | `multi.mul`/`multi.idx`                                             | `multi.mul`/`multi.idx`                   | isometric art composition, component editing, `Multimap.rle` view + PNG conversion                                                                                     |
| CliLoc             | `Cliloc.*` (plain + mythic-compressed)                              | `Cliloc.*`                                | search, edit, add, CSV export; saves recompress with the ported mythic codec                                                                                           |
| Sounds             | `sound.mul`/`soundidx.mul` (16-byte index) or `soundLegacyMUL.uop`  | —                                         | per-sound enumeration, WebAudio playback, WAV export                                                                                                                   |
| Light              | `light.mul`/`lightidx.mul`                                          | —                                         | viewer                                                                                                                                                                 |
| Textures           | `texmaps.mul`/`texidx.mul`                                          | —                                         | viewer (64² / 128²)                                                                                                                                                    |
| Fonts              | `fonts.mul`                                                         | —                                         | ASCII glyph renderer (10 fonts)                                                                                                                                        |
| Speech             | `speech.mul`                                                        | —                                         | keyword table, search                                                                                                                                                  |
| Skills             | `skills.mul`/`skills.idx`                                           | —                                         | searchable skill list                                                                                                                                                  |
| Skill groups       | `skillgrp.mul` (+ `skills.mul` for names)                           | `skillgrp.mul`                            | expandable group sections, drag & drop skill assignment (in-group order is session-only), rename/add/remove/reorder groups                                             |

## Plugins

Extras live in a plugin system. The manager is at `/plugins`; every enabled plugin gets its own entry in the sidebar's Plugins section and a page at `/plugins/<id>`. Enable state is kept in `localStorage` under `sosarium.plugins`.

Plugins are compiled into the bundle and registered in `apps/web/src/plugins/registry.ts`. A plugin is a folder under `apps/web/src/plugins/<id>/index.tsx` exporting a manifest and a DOM renderer:

    export const manifest = { id, name, description, version, author, defaultEnabled };
    export function render(root, api) {
      // build DOM inside root
      return () => { /* optional cleanup */ };
    }

The second argument is the contract with the open client folder: `api.files.list()`, `find(name)`, `read(name)` (bytes), `write(name, bytes)` (read-write sessions only) and `canWrite()`, plus `api.session` for name/mode/files. Format parsers and serializers are exposed as `api.formats` and `api.core`, and the tile renderer as `api.images.tileToCanvas`. `apps/web/src/plugins/sample/` is a runnable reference implementation (disabled by default). Pack, Compare and MassImport ship as three separate built-in plugins, each with its own page and enable toggle.

## Layout

```txt
apps/web             TanStack Start application (splash, editors)
packages/core        Binary IO, MUL/UOP containers, mythic codec, hashing
packages/formats     Per-format readers/writers (art, gumps, animations, map, tiledata, hues, multi, text, misc, packer, compare)
packages/render      Pixel conversions (A1R5G5B5, RGB555) and hue math
```

## Development

```bash
bun install
bun run dev       # http://localhost:3000
bun run check     # lint + typecheck + test
bun run build
```

## Credits

Format knowledge and behaviour were ported from a C# reference implementation of UOFiddler released under the Beerware license; no original assets are redistributed. `Animationlist.xml` and `Multilist.xml` are derived into bundled name tables under that license. See more: [UOFiddler](https://github.com/polserver/UOFiddler)

## License

MIT license
