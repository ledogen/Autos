"""measure.py <calib-key> <crop_x0> <crop_y0> <display_scale>  < points
Each stdin line: `name u v [u v ...]` in DISPLAY coords of a crop; prints van (y, z) metres."""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from profile import CALIB, Frame

c = CALIB[sys.argv[1]]
x0, y0, k = float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
fr = Frame(c["front"], c["rear"])
for line in sys.stdin:
    t = line.split()
    if not t or t[0].startswith("#"):
        continue
    vals = list(map(float, t[1:]))
    out = []
    for i in range(0, len(vals), 2):
        y, z = fr.to_van(np.array(x0 + vals[i] * k), np.array(y0 + vals[i + 1] * k))
        out.append(f"({float(y):+.3f}, {float(z):.3f})")
    print(f"{t[0]:<14}" + " ".join(out))
