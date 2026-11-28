# 시대 전쟁 in Blender

What Blender makes for 시대 전쟁 (the user asked for the game to be redone with Blender, then for the units to be
sculpted anew). Everything here is made by scripts, with no outside models or pictures, so it can be made again at
any time.

- **The land behind the lane** (`terrain.py` → `src/assets/models/erawar/terrain.glb`, `terrain.webp`): one sheet of
  ground 180 m wide from just behind the woods to 95 m back. Rolling hills rise into a range of ridged, gullied
  peaks (Blender's fractal and ridged noise, seeded), painted by a node material that picks grass, scree, rock and
  snow by height and steepness, every border broken by noise. Cycles bakes that paint and the shade the land throws
  on itself under an even sky into one 2048×1024 picture; the sheet is then thinned to a quarter of its triangles
  where it is flat. The game draws it with one plain paint (`bakedLand` in `src/games/erawar/baked.ts`) in place of
  the instanced hills and cone peaks.
- **The units** (`units/` → `src/assets/models/erawar/units/*.glb`, read by `src/games/erawar/sculpted.ts`): every
  unit modelled anew in Blender by script. `units/lib.py` holds what they share: parts lofted from cross-sections,
  turned, or bent along curves, smoothed by Blender's subdivision, pushed by bumps (muscles) and noise (cloth folds,
  fur, mail), hard parts bevelled by Blender's bevel modifier, open shells turned outward, hard edges split; Cycles
  bakes ambient occlusion into the vertices; `write_glb` writes one primitive per game paint (quantised positions,
  normals, box-projected uvs, and per vertex two joints, the first one's weight and the baked light).
  - `person.py` → `p<era><kind>.glb` (eras 0–3, kinds 0–1; the riders and the gunner reuse them): a body with
    anatomy (torso with pectorals and shoulder blades, deltoids, biceps, knees, calves, a sculpted head with jaw,
    cheekbones, sockets, nose, lips, ears and eyes, fists with four fingers and a thumb round the grip), dressed per
    era: fur tunic, sash, bone necklace, wild hair and beard, headband and feathers; mail hauberk, tabard with a gold
    cross, pauldrons, coif and helm, or a jerkin, hood with liripipe, cape and quiver; coat with skirts and tails,
    facings, buttons, cross-belts, gaiters, tricorn or shako; fatigues with pockets, vest of pouches, pack, helmet with
    goggles, laced boots (the gunner's radio and ear-cups). Weights: torso body→chest→head, legs leg→knee, arms
    arm→elbow, skirts shared between the hips and each leg, gear on one joint.
  - `beast.py` → `b1.glb` the horse (barrel, arched neck and mane, head, eight-part legs, tail, caparison with gold
    hem and badge, saddle, chanfron, bridle) and `b0.glb` the mammoth (humped shaggy body with a hanging fringe,
    domed head, ears, tusks, wrinkled trunk, pillar legs with toenails, tail, blanket).
  - `machine.py` → `m2.glb` the field gun and `m3.glb` the tank (bevelled hard surfaces; each wheel, the turret and
    the gun on their own pivots; the tank's running tracks stay the game's own).
  The game skins each on its own jointed pivots (`skinOn` in `models.ts`), so poses, weapons in the hands, the rider
  and every animation are as before; `Kit(own, rich, false)` (and `lineup.html?blender=0`) builds the code's own.

## Making them again

1. Blender 4.2 LTS (headless is enough), e.g. the portable build from download.blender.org unpacked anywhere.
2. `tools/blender/erawar/bake-all.sh <path to blender> <work dir>` (`BAKE_SAMPLES` sets Cycles' samples for the
   units' light, 48 by default; `TERRAIN_KEEP` the share of the land's triangles kept). One unit alone:
   `blender -b --python tools/blender/erawar/units/person.py -- <out dir> 3 0` (`PREVIEW=1` also renders it with
   Cycles; `COUNT=1` lists each part's vertices).

The joints' names and places are the game's (`sculptedBody`, `sculptedBeast` and the machines' branch in
`models.ts`): change them together. Weapons, shields, the stone bag, the ammunition box, the knight's pennant and the
tank's tracks are still the code's own shapes.

`lineup.html` (`?era=0..3`, `?blender=0` for the look without Blender, `?close=1`, `?walk=0`) shows every unit of an
era side by side, lit as in the game, and `window.fps()` counts its frames; `shoot.cjs <port> <query> <out.png>`
takes its picture.
