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
  - `horse.py` → `b1.glb` and `tex/horse.webp`, `horse_n.webp`: the knight's horse, made as the mammoth is (it uses
    `mammoth.py`'s helpers). Its skin is melted from metaballs along a horse's lines (a long head with jowls, eyes,
    deep nostrils and the line of the lips, cupped ears, an arched neck rising from the withers, a deep chest and a
    sloping shoulder, a dipped back and a rounded croup, slim legs with knees, hocks, fetlocks and pasterns on horn
    hooves), muscled where a horse is (crest, shoulder and arm, forearm, quarters, gaskin, the tendons down the
    cannons), coloured a bay (darker along the top, black from the knees and hocks down, a dark muzzle, a white blaze).
    The mane (falling to the near side), the forelock and the tail grow as ~900 locks of black strands. The shell
    (skin and hair melted, ~16k triangles) wears the baked colour, relief and shade at 2048 px. The tack is the
    game's to paint: a caparison of the side's colour draped over the back and hanging in folds, gold-hemmed with a
    gold boss on each flank; a saddle with pommel and cantle; a bridle (noseband, browband, crownpiece,
    throatlatch, cheekpieces) with iron bits. The bits' places go in the GLB; the game draws the reins itself, from
    the bits to the knight's other fist (`reins` in `models.ts`), skinned to the head and the fist.
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
  (the peasant's and the ranger's) or, in the gunpowder and modern eras, in uniforms made from that body (`uniform.py`), credited in `public/models-license.txt`.
  - `tex.py` (plain Python, Pillow): the packs' colour maps at 1024 px, the peasant's dark browns lifted a little,
    his pale shirt and his sleeves (`masks.py` finds where the sleeves are on the picture) dyed in each side's colour
    (`peasant0`/`peasant1`) and in olive drab (`peasantOlive`), the ranger's greens turned to each side's colour, the
    base body's black shorts to hide browns (`skinHide`).
  - `uniform.py` (Blender): the gunpowder era's long coat and the modern era's combat uniform, both original, made
    from the base body itself: a copy with its head (and, under the coat, its hands) cut away, its surface smoothed
    where cloth hangs loose (so no muscle shows through) and its toes run together into shoes and boots, then every
    vertex pushed out along its normal by what covers it (`STANDOFF`: coat, breeches, gaiters and shoes, turned-back
    cuffs; jacket, trousers bloused over the boot tops, boots, gloves). It keeps the body's skin weights (so it bends
    with him at every joint) and his uvs, squeezed into the lower four fifths of one 1024 px picture; the coat's
    skirts (`tails`: open at the front, flaring, lined, swinging with the thighs) take the top fifth. Run alone it
    paints the pictures: the copy's triangles rasterised in uv space into a map of where each texel lies on the body
    (its position, normal and bones), and the paint worked out from that, so seams, pockets, buttons, cuffs and
    camouflage blotches fall where they belong and run on across the uv islands: `coat0`/`coat1` (each side's coat
    with the other side's colour on its cuffs, collar and lapels, a cream waistcoat, white breeches, black gaiters
    with buttons, shoes with buckles; turnbacks, pocket flaps and the back vent on the skirts; `coat0p`/`coat1p`, the
    broad areas alone, are what the processor's figure's vertex colours are sampled from) and `combat` (an original
    four-colour woodland camouflage of warped noise blotches, a buttoned placket, chest, sleeve and cargo pockets with
    flaps, seams, a webbing belt, laced boots, gloves). The cross-belts, the plate vest and the armband are sized to
    the cloth's girth where they sit (`girth`).
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
   `blender -b --python tools/blender/erawar/units/horse.py -- <out dir> <work dir>` (then `webp.py`); one person:
   `blender -b --python tools/blender/erawar/assets/people.py -- <packs dir> <work dir> <out dir> 3 0` (after
   `masks.py` and `tex.py`; `AO_SAMPLES` sets Cycles' samples, 48 by default).

The joints' names and places are the game's (the machines' branch in `models.ts`; the people's, the mammoth's and the
horse's come with them in their GLBs): change them together. The stone bag, the ammunition box, the knight's pennant and the tank's tracks are
still the code's own shapes; the machines and weapons are still Blender-sculpted (the CC0 packs on Google
Drive could not be fetched: its quota refused every file). Subdivided parts are thinned by Blender's decimation (`DECIMATE`, 0.5 by default) so
that a full lane draws as fast as the code's units did.

`lineup.html` (`?era=0..3`, `?blender=0` for the look without Blender, `?close=1`, `?walk=0`, `?kind=2&cam=head|profile|near|saddle` for the mount close) shows every unit of an
era side by side, lit as in the game, and `window.fps()` counts its frames; `shoot.cjs <port> <query> <out.png>`
takes its picture.
