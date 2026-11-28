# 시대 전쟁 in Blender

What Blender makes for 시대 전쟁 (the user asked for the game to be redone with Blender). Everything here is made by
scripts, with no outside models or pictures, so it can be made again at any time.

- **The land behind the lane** (`terrain.py` → `src/assets/models/erawar/terrain.glb`, `terrain.webp`): one sheet of
  ground 180 m wide from just behind the woods to 95 m back. Rolling hills rise into a range of ridged, gullied
  peaks (Blender's fractal and ridged noise, seeded), painted by a node material that picks grass, scree, rock and
  snow by height and steepness, every border broken by noise. Cycles bakes that paint and the shade the land throws
  on itself under an even sky into one 2048×1024 picture; the sheet is then thinned to a quarter of its triangles
  where it is flat. The game draws it with one plain paint (`bakedLand` in `src/games/erawar/baked.ts`) in place of
  the instanced hills and cone peaks.
- **The units' shade** (`export.html`/`export.ts`/`export.cjs` → `ao.py` → `src/assets/models/erawar/ao/u<era><kind>.json`):
  the game's own unit templates are exported as GLB from a dev page; Cycles bakes ambient occlusion into each mesh's
  vertices (each jointed group pulled away from the others, so that a moving arm leaves no shade on the body; both
  sides of every face, the lighter kept). The game multiplies that light into each part's paint as a vertex colour
  (`Shade` in `baked.ts`), so shapes, paints and animation are the game's own and only the shade is Blender's.

## Making them again

1. Blender 4.2 LTS (headless is enough), e.g. the portable build from download.blender.org unpacked anywhere.
2. In the repository: `npx vite --port 4321` (the export page needs the dev server).
3. `CHROMIUM_PATH=/opt/pw-browsers/chromium tools/blender/erawar/bake-all.sh <path to blender> <work dir> 4321`
   (`BAKE_SAMPLES` sets Cycles' samples, 96 by default; `TERRAIN_KEEP` the share of the land's triangles kept).

Rebuild the units' shade whenever their shapes change in `models.ts`, `sculpt.ts` or `beasts.ts`: a mesh whose
vertices no longer match its bake is simply drawn without it.

`lineup.html` (`?era=0..3`, `?blender=0` for the look without Blender, `?close=1`, `?walk=0`) shows every unit of an
era side by side, lit as in the game, and `window.fps()` counts its frames; `shoot.cjs <port> <query> <out.png>`
takes its picture.
