# 시대 전쟁 in Blender

What Blender makes for 시대 전쟁 (the user asked for the game to be redone with Blender, then for the units to be
sculpted anew, then for artist-made models). Everything here is made by scripts, so it can be made again at any time;
the people start from free (CC0) artist-made models, the rest from nothing.

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
  - `beast.py` → `b1.glb` the horse (barrel, arched neck and mane, head, eight-part legs, tail, caparison with gold
    hem and badge, saddle, chanfron, bridle).
  - `mammoth.py` → `b0.glb` and `tex/mammoth.webp`, `mammoth_n.webp` (`webp.py` makes the WebPs from its PNGs): the
    woolly mammoth, made the way a game artist would. Its skin is one body melted from Blender's metaballs (a high
    domed skull, a hump over the shoulders, a back sloping to the rump, pillar legs on flat round soles, a trunk
    narrowing to its two-fingered tip, small ears, a short tail), ringed along the trunk and wrinkled at the knees,
    with spiral tusks and toenails. On it grow ~6000 locks (~80,000 strands, ~1M triangles), each a clump of fine
    ribbons spread at the root and drawn together at the tip, bending under their weight, kept out of the skin:
    longest on the flanks, the throat (a beard) and the belly where they hang to a ragged fringe a little above the
    knees, shorter on the legs (the soles bare), a tuft on the crown and at the tail, a little on the upper trunk;
    each lock between a dark brown and a ginger, dark at the root and paler at the tip. The game draws a shell
    instead: the skin swollen by its short hair and a tube round every long lock, melted together (voxel remesh),
    thinned to ~9000 triangles, laid out flat on a much smoothed copy (so its pieces are big), and Cycles bakes the
    hair's colour, its relief (tangent normal map) and the shade the locks throw on one another (AO) from the strands
    onto it, at twice the size and halved. The eyes, a blanket of the side's colour hemmed in gold draped over the
    hair, and the joints' places (where the rider sits too) go in the GLB; the game skins it as the people
    (`skinArtist`), with the relief where a graphics card draws and the picture's colours in the vertices where the
    processor does. No free (CC0) mammoth could be had (Quaternius' animal packs have none, OpenGameArt's one elephant
    is a crude block).
  - `machine.py` → `m2.glb` the field gun and `m3.glb` the tank (bevelled hard surfaces; each wheel, the turret and
    the gun on their own pivots; the tank's running tracks stay the game's own).
  - `weapon.py` → `w<era><kind>.glb`: club, sling, spear, sword and kite shield, longbow, lance, musket (with the
    fusilier's bayonet), rifle and machine gun, each modelled in the frame of the pivot that holds it and drawn there
    as plain (unskinned) meshes (`sculptedWeapon` in `models.ts`).
  The game skins each on its own jointed pivots (`skinOn` in `models.ts`), so poses, weapons in the hands, the rider
  and every animation are as before; `Kit(own, rich, false)` (and `lineup.html?blender=0`) builds the code's own.

- **The people** (`assets/` → `src/assets/models/erawar/people/a<era><kind>.glb`, `a<era><kind>l.glb` and `tex/*.webp`,
  read by `artistPerson` in `sculpted.ts`, skinned by `artistBody`/`skinArtist` in `models.ts`): Quaternius' CC0
  Universal Base Characters (the body, head, eyes, brows, hair, beard) in his Modular Character Outfits - Fantasy
  (the peasant's and the ranger's), credited in `public/models-license.txt`.
  - `tex.py` (plain Python, Pillow): the packs' colour maps at 1024 px, the peasant's dark browns lifted a little,
    his pale shirt and his sleeves (`masks.py` finds where the sleeves are on the picture) dyed in each side's colour
    (`peasant0`/`peasant1`) and in olive drab (`peasantOlive`), the ranger's greens turned to each side's colour, the
    base body's black shorts to hide browns (`skinHide`).
  - `people.py` (Blender): per era and kind (`DRESS`) the body, hair and outfit on one armature; the arms posed down
    from the packs' T and applied; under clothes only the head and neck of the body kept; what the packs lack added
    (a hide wrap and band, a sash; a nasal helm with a plume; a tricorn with lace and white cross-belts; a modern
    helmet, a plate vest with pouches and an armband); thinned by decimation to ~10k triangles (`a…glb`, drawn with
    the pictures) and ~3.5k (`a…l.glb`, for the processor's draw: the pictures' colours in the vertices); Cycles' AO
    baked into the vertices. Before the arms come down each hand is closed (`curl_hands`, `DRESS[...]["hands"]`): a fist
    round what it holds, or at rest a little curled; the swordsman's left arm is raised (`SHIELD_ARM`), its forearm
    across the front, and the shield's place and axes on that forearm go into the GLB (`shield`, `shieldBasis`), where
    `artistBody` straps it. The hand pivots are the fists' middles (the four fingers' loops).
    Its bones are mapped onto the game's joints (`JOINT`, `bone_joint`: pelvis → body, thighs → legs, calves, feet and
    toes (`ball_leaf` too) → knees, spine and clavicles → chest, neck and head → head, upper arms → arms, forearms,
    hands and fingers → elbows); each vertex keeps the two strongest. The joints' places (the posed bones' heads, in the game's
    frame, scaled 0.707 so the 1.81 m body stands 1.28 m) go in the GLB, and `artistBody` puts its pivots there.

## Making them again

1. Blender 4.2 LTS (headless is enough), e.g. the portable build from download.blender.org unpacked anywhere.
   For the people, the two packs' free "Standard" zips from quaternius.itch.io (`universal-base-characters`,
   `modular-character-outfits-fantasy`), unzipped side by side in one folder (`<packs dir>`).
2. `tools/blender/erawar/bake-all.sh <path to blender> <work dir> [<packs dir>]` (`BAKE_SAMPLES` sets Cycles' samples for the
   units' light, 48 by default; `TERRAIN_KEEP` the share of the land's triangles kept). One unit alone:
   `blender -b --python tools/blender/erawar/units/beast.py -- <out dir>`; one person:
   `blender -b --python tools/blender/erawar/assets/people.py -- <packs dir> <work dir> <out dir> 3 0` (after
   `masks.py` and `tex.py`; `AO_SAMPLES` sets Cycles' samples, 48 by default).

The joints' names and places are the game's (`sculptedBeast` and the machines' branch in `models.ts`; the people's
come with them): change them together. The stone bag, the ammunition box, the knight's pennant and the tank's tracks are
still the code's own shapes; the mounts, machines and weapons are still Blender-sculpted (the CC0 packs on Google
Drive could not be fetched: its quota refused every file). Subdivided parts are thinned by Blender's decimation (`DECIMATE`, 0.5 by default) so
that a full lane draws as fast as the code's units did.

`lineup.html` (`?era=0..3`, `?blender=0` for the look without Blender, `?close=1`, `?walk=0`, `?kind=2&cam=head|profile|near` for the mammoth close) shows every unit of an
era side by side, lit as in the game, and `window.fps()` counts its frames; `shoot.cjs <port> <query> <out.png>`
takes its picture.
