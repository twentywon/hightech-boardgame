#!/usr/bin/env bash
# Rebuilds what Blender makes for 시대 전쟁 (see README.md here):
#   tools/blender/erawar/bake-all.sh <blender> <work dir> [port of a running `npx vite`, default 4321]
# 1. export.cjs: the game's own units as GLBs (from the dev page export.html);
# 2. ao.py: Cycles bakes each unit's shade into its vertices -> src/assets/models/erawar/ao/u<era><kind>.json;
# 3. terrain.py: the land behind the lane -> src/assets/models/erawar/terrain.glb and terrain.webp.
set -euo pipefail
BLENDER="$1"; WORK="$2"; PORT="${3:-4321}"; HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../../.."
ASSETS="$ROOT/src/assets/models/erawar"
mkdir -p "$WORK/units" "$WORK/land" "$ASSETS/ao"
node "$HERE/export.cjs" "$WORK/units" "$PORT"
for era in 0 1 2 3; do
  for kind in 0 1 2; do
    "$BLENDER" -b --python "$HERE/ao.py" -- "$WORK/units/u$era$kind.glb" "$ASSETS/ao/u$era$kind.json" 2>&1 | grep -E "DONE|Error|Traceback" || true
  done
done
TERRAIN_KEEP="${TERRAIN_KEEP:-0.25}" "$BLENDER" -b --python "$HERE/terrain.py" -- "$WORK/land" 2048 2>&1 | grep -E "TRIANGLES|DONE|Error|Traceback" || true
cp "$WORK/land/terrain.glb" "$ASSETS/terrain.glb"
python3 -c "import sys; from PIL import Image; Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2], 'WEBP', quality=86, method=6)" "$WORK/land/terrain.png" "$ASSETS/terrain.webp"
