"""mask.py <photo> <out.png>  — paint-blue mask (the van's body colour) for silhouette reads."""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit("/", 1)[0])
import img


def blue(a):
    r, g, b = (a[..., i].astype(int) for i in range(3))
    return (b > r + 45) & (b > g + 12) & (b > 70)


if __name__ == "__main__":
    a = img.load(sys.argv[1])
    m = blue(a)
    out = a // 3
    out[m] = (80, 160, 255)
    img.save(out, sys.argv[2])
