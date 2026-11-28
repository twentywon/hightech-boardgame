"""
A Cycles picture of some of 시대 전쟁's units side by side (see ../README.md):

    blender -b --python beauty.py -- <out.png> [samples]
"""
import math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from lib import *  # noqa
import person, beast, machine

argv = sys.argv[sys.argv.index("--") + 1 :]
out = argv[0]
samples = int(argv[1]) if len(argv) > 1 else 64
reset()
groups = []
for era, kind, z in ((0, 0, -1.5), (1, 0, -0.75), (2, 0, 0.0), (3, 0, 0.75), (1, 1, 1.5)):
    groups.append((person.build(era, kind), (0.0, 0.0, z)))
groups.append((beast.horse(), (-1.6, 0.0, -0.3)))
groups.append((machine.tank(), (-2.0, 0.0, 2.4)))
everything = []
for parts, (dx, dy, dz) in groups:
    for p in parts:
        p.finish()
        p.obj.location = tuple(g2b(np.array([dx, dy, dz])))
        everything.append(p)
render(out, everything, eye=(7.6, 2.3, 2.2), look=(-0.7, 0.75, 0.45), size=(1600, 900), samples=samples)
print("DONE", out)
