"""crop.py <photo> <x0> <y0> <w> <h> <out.png> [zoom] [step]
Crop a region (ORIGINAL pixel coords), grid it (yellow every step, red every 2*step), zoom by
nearest-neighbour.  Grid lines sit at absolute coordinates, so a point read off the crop is a
photo coordinate."""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit("/", 1)[0])
import img

p, x0, y0, w, h, out = sys.argv[1], *map(int, sys.argv[2:6]), sys.argv[6]
zoom = int(sys.argv[7]) if len(sys.argv) > 7 else 1
step = int(sys.argv[8]) if len(sys.argv) > 8 else 50
a = img.load(p)[y0:y0 + h, x0:x0 + w].copy()
if zoom > 1:
    a = np.repeat(np.repeat(a, zoom, 0), zoom, 1)
    big = img.grid(np.zeros_like(a), x0 * zoom, y0 * zoom, step * zoom, 2 * step * zoom)
    m = big.any(axis=2)
    a[m] = big[m]
else:
    img.grid(a, x0, y0, step, 2 * step)
img.save(a, out)
print(out, a.shape)
