"""The mammoth's pictures from mammoth.py's PNGs to WebP (plain Python with Pillow):

    python3 webp.py <work dir>/tex <out dir>/tex [quality]
"""
import os, sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
q = int(sys.argv[3]) if len(sys.argv) > 3 else 82
os.makedirs(dst, exist_ok=True)
for name in sorted(os.listdir(src)):
    if name.endswith(".png"):
        im = Image.open(os.path.join(src, name)).convert("RGB")
        out = os.path.join(dst, name[:-4] + ".webp")
        im.save(out, "WEBP", quality=q, method=6)
        print(out, os.path.getsize(out))
