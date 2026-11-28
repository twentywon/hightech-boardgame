#!/usr/bin/env bash
# Rebuilds what Blender makes for 시대 전쟁 (see README.md here):
#   tools/blender/erawar/bake-all.sh <blender> <work dir> [<packs dir>]
# 1. units/beast.py, machine.py, weapon.py: the mounts, machines and weapons, sculpted and skinned, with Cycles'
#    baked light -> src/assets/models/erawar/units/b0/b1.glb, m2/m3.glb, w<era><kind>.glb;
# 2. terrain.py: the land behind the lane -> src/assets/models/erawar/terrain.glb and terrain.webp;
# 3. with <packs dir> (Quaternius' two CC0 packs unzipped, see README.md): assets/masks.py, tex.py, people.py: the
#    people -> src/assets/models/erawar/people/a<era><kind>(l).glb and tex/*.webp.
set -euo pipefail
BLENDER="$1"; WORK="$2"; HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../../.."
ASSETS="$ROOT/src/assets/models/erawar"
mkdir -p "$WORK/units" "$WORK/land" "$ASSETS/units"
for script in beast machine weapon; do
  "$BLENDER" -b --python "$HERE/units/$script.py" -- "$WORK/units" 2>&1 | grep -E "DONE|Error|Traceback" || true
done
cp "$WORK/units/"*.glb "$ASSETS/units/"
TERRAIN_KEEP="${TERRAIN_KEEP:-0.25}" "$BLENDER" -b --python "$HERE/terrain.py" -- "$WORK/land" 2048 2>&1 | grep -E "TRIANGLES|DONE|Error|Traceback" || true
cp "$WORK/land/terrain.glb" "$ASSETS/terrain.glb"
python3 -c "import sys; from PIL import Image; Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2], 'WEBP', quality=86, method=6)" "$WORK/land/terrain.png" "$ASSETS/terrain.webp"
if [ $# -ge 3 ]; then
  PACKS="$3"; mkdir -p "$WORK/people" "$WORK/pictures" "$ASSETS/people/tex"
  "$BLENDER" -b --python "$HERE/assets/masks.py" -- "$PACKS" "$WORK/pictures" 2>&1 | grep -E "MASK|Error|Traceback" || true
  python3 "$HERE/assets/tex.py" "$PACKS" "$WORK/pictures" "$ASSETS/people/tex"
  "$BLENDER" -b --python "$HERE/assets/people.py" -- "$PACKS" "$WORK/pictures" "$WORK/people" 2>&1 | grep -E "DONE|Error|Traceback" || true
  cp "$WORK/people/"*.glb "$ASSETS/people/"
fi
