"""profile.py <calib-key> — the body-paint silhouette of a SIDE photo in van metres.

A side photo whose image plane is parallel to the van's flank is a similarity transform of the
flank: rotate so the hub line is level, scale so the hubs are WB apart.  y forward (+ = nose),
z up from the ground under the tyres."""
import sys
import math
import numpy as np
sys.path.insert(0, __file__.rsplit("/", 1)[0])
import img
from mask import blue

WB = 3.175          # 125" wheelbase, confirmed by tyre size (110" would make a 0.58 m tyre)
HUB_Z = 0.335       # hub height over the ground (loaded tyre radius)

# hub centres in ORIGINAL pixels, read off gridded zoom crops; nose_left: the nose points to -u
CALIB = {
    "L": dict(photo=f"{img.WIP}/ref/board/side-L-003.jpg", front=(328.8, 940.5), rear=(1510.0, 969.5)),
    "R": dict(photo=f"{img.WIP}/ref/board/side-R-009.jpg", front=(1776.5, 960.0), rear=(595.5, 942.0)),
}


class Frame:
    def __init__(self, front, rear):
        self.F = np.array(front)
        R = np.array(rear)
        d = self.F - R                       # rear -> front, in pixels
        self.L = np.linalg.norm(d)
        self.e = d / self.L                  # unit "forward" in the image
        self.n = np.array([self.e[1], -self.e[0]])
        if self.n[1] > 0:                    # n must point image-UP (v decreases)
            self.n = -self.n
        self.s = WB / self.L                 # metres per pixel

    def to_van(self, u, v):
        d = np.stack([u - self.F[0], v - self.F[1]], -1)
        return WB / 2 + d @ self.e * self.s, HUB_Z + d @ self.n * self.s

    def to_px(self, y, z):
        p = self.F + (y - WB / 2) / self.s * self.e + (z - HUB_Z) / self.s * self.n
        return p


if __name__ == "__main__":
    c = CALIB[sys.argv[1]]
    fr = Frame(c["front"], c["rear"])
    print(f"scale {fr.s*1000:.3f} mm/px, hub line tilt {math.degrees(math.atan2(fr.e[1], -fr.e[0])):.2f} deg")
    a = img.load(c["photo"])
    m = blue(a)
    vs, us = np.nonzero(m)
    y, z = fr.to_van(us.astype(float), vs.astype(float))
    print("TOP (y -> highest paint z)")
    for yc in np.arange(-2.7, 2.75, 0.1):
        k = np.abs(y - yc) < 0.02
        if k.sum() > 5:
            print(f"  y {yc:+.2f}  z {np.percentile(z[k], 99.8):.3f}")
    for name, fn, sgn in (("NOSE (z -> most forward paint y)", np.max, 1), ("TAIL (z -> most rearward paint y)", np.min, -1)):
        print(name)
        for zc in np.arange(0.2, 2.2, 0.05):
            k = np.abs(z - zc) < 0.01
            if k.sum() > 5:
                print(f"  z {zc:.2f}  y {sgn * np.percentile(sgn * y[k], 99.8):+.3f}")
    print("extent y %.3f..%.3f  z %.3f..%.3f" % (np.percentile(y, 0.02), np.percentile(y, 99.98),
                                                  np.percentile(z, 0.02), np.percentile(z, 99.98)))
