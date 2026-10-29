"""ba.py — bundle adjustment: solve all 8 board cameras AND the landmarks' 3D positions together
from the pixel picks in picks.py.  Gauge: wheelbase 125" (hubs at y = +-WB/2), hub height HUB_Z,
left/right mirror symmetry (a landmark pair shares one (x, y, z), x >= 0 on the _R side).
Writes solve.json (beside this file): cameras (C, R, f) + landmarks, and prints per-photo reprojection error.

Camera convention = Blender's: R's columns are the camera's x (right), y (up), z (back) axes in
world; p = R^T (P - C); u = W/2 + f p_x / -p_z, v = H/2 - f p_y / -p_z."""
import json
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from picks import PICKS, SIZE, CAM0

WB, HUB_Z = 3.175, 0.335

# landmark start values (x >= 0 for pairs; x is fixed 0 for the centre seam; FUEL is left-only)
LM0 = {
    "GS_TO": (0.95, 2.20, 0.95), "GS_BO": (0.95, 2.20, 0.60), "HL_TO": (0.88, 2.20, 0.90),
    "HL2_BO": (0.88, 2.20, 0.65), "WS_B": (0.85, 1.58, 1.38), "WS_T": (0.75, 1.15, 1.85),
    "HOOD_FO": (0.85, 2.15, 1.12), "MIR_C": (1.12, 1.12, 1.44), "MK_F": (1.0, 2.06, 0.94),
    "MK_R": (1.0, -2.47, 0.99), "WIN_RT": (0.98, 0.63, 1.79), "WIN_RB": (0.99, 0.63, 1.36),
    "TL_TO": (0.95, -2.72, 1.05), "TL_BO": (0.95, -2.72, 0.75), "RD_T": (0.70, -2.55, 1.85),
    "RD_B": (0.70, -2.72, 0.62), "RD_CT": (0.0, -2.55, 1.85), "RD_CB": (0.0, -2.72, 0.62),
    "FUEL": (-1.0, -2.29, 1.03),
}
CENTRE = {"RD_CT", "RD_CB"}


def rodrigues(w):
    t = np.linalg.norm(w)
    if t < 1e-12:
        return np.eye(3)
    k = w / t
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + np.sin(t) * K + (1 - np.cos(t)) * K @ K


def look_at(C, target):
    z = np.asarray(C, float) - target
    z /= np.linalg.norm(z)
    x = np.cross([0, 0, 1], z)
    x /= np.linalg.norm(x)
    y = np.cross(z, x)
    return np.stack([x, y, z], 1)


class Problem:
    def __init__(self, photos):
        self.photos = photos
        self.lm_names = sorted(LM0)
        # parameter layout: per camera [C(3), w(3), logf(1)], then landmarks, then hub x (front, rear)
        self.R0 = {}
        x = []
        for p in photos:
            C = np.array(CAM0[p], float)
            self.R0[p] = look_at(C, np.array([0, 0, 1.0]))
            x += list(C) + [0, 0, 0] + [np.log(1.6 * SIZE[p][0])]
        self.lm_slot = {}
        for n in self.lm_names:
            self.lm_slot[n] = len(x)
            x += [LM0[n][1], LM0[n][2]] if n in CENTRE else list(LM0[n])
        self.hub_slot = len(x)
        x += [0.88, 0.88, 0.80, 0.80, HUB_Z]       # hubcap x F/R, tread-centre x F/R, hub z
        self.x = np.array(x)
        # a pick with u = None constrains v only (a far tyre's bottom, its centre hidden)
        self.obs = [(p, k, np.array([np.nan if uv[0] is None else uv[0], uv[1]], float))
                    for p in photos for k, uv in PICKS[p].items()]

    def point(self, x, key):
        if key.startswith("hub") or key.startswith("TYRE"):
            tyre = key.startswith("TYRE")
            ax = key[5] if tyre else key[3]
            xs = x[self.hub_slot + (0 if ax == "F" else 1) + (2 if tyre else 0)]
            y = WB / 2 if ax == "F" else -WB / 2
            return np.array([xs if key.endswith("_R") else -xs, y, 0.0 if tyre else x[self.hub_slot + 4]])
        if key in CENTRE:
            s = self.lm_slot[key]
            return np.array([0.0, x[s], x[s + 1]])
        if key == "FUEL":
            s = self.lm_slot[key]
            return x[s:s + 3].copy()
        name, side = key.rsplit("_", 1)
        s = self.lm_slot[name]
        P = x[s:s + 3].copy()
        if side == "L":
            P[0] = -P[0]
        return P

    def cam(self, x, p):
        i = self.photos.index(p) * 7
        C = x[i:i + 3]
        R = self.R0[p] @ rodrigues(x[i + 3:i + 6])
        return C, R, np.exp(x[i + 6])

    def project(self, x, p, P):
        C, R, f = self.cam(x, p)
        q = (P - C) @ R
        W, H = SIZE[p]
        return np.array([W / 2 + f * q[0] / -q[2], H / 2 - f * q[1] / -q[2]])

    def residual(self, x):
        return np.nan_to_num(np.concatenate([self.project(x, p, self.point(x, k)) - uv
                                             for p, k, uv in self.obs]))

    def fold(self):
        """Fold the rotation deltas into R0 (keeps the small-angle parametrisation well-conditioned)."""
        for p in self.photos:
            i = self.photos.index(p) * 7
            self.R0[p] = self.R0[p] @ rodrigues(self.x[i + 3:i + 6])
            self.x[i + 3:i + 6] = 0


def lm(prob, mask=None, iters=200, lam=1e-2):
    n = len(prob.x)
    free = np.ones(n, bool) if mask is None else mask
    r = prob.residual(prob.x)
    cost = r @ r
    for it in range(iters):
        J = np.zeros((len(r), n))
        for j in np.nonzero(free)[0]:
            h = 1e-6 * max(1.0, abs(prob.x[j]))
            xp = prob.x.copy()
            xp[j] += h
            J[:, j] = (prob.residual(xp) - r) / h
        A = J.T @ J
        g = J.T @ r
        while True:
            Ad = A + lam * np.diag(np.diag(A) + 1e-9)
            step = np.zeros(n)
            step[free] = -np.linalg.solve(Ad[np.ix_(free, free)], g[free])
            xn = prob.x + step
            rn = prob.residual(xn)
            cn = rn @ rn
            if cn < cost:
                prob.x, r, lam = xn, rn, max(lam / 3, 1e-9)
                prob.fold()
                r = prob.residual(prob.x)
                done = (cost - cn) < 1e-9 * cost
                cost = cn
                break
            lam *= 4
            if lam > 1e9:
                return cost
        if done:
            break
    return cost


def report(prob):
    r = prob.residual(prob.x).reshape(-1, 2)
    out = {}
    for p in prob.photos:
        k = [i for i, o in enumerate(prob.obs) if o[0] == p]
        e = np.linalg.norm(r[k], axis=1)
        worst = prob.obs[k[int(np.argmax(e))]][1]
        C, R, f = prob.cam(prob.x, p)
        print(f"  {p:<11} rms {np.sqrt((e**2).mean()):5.1f}px  max {e.max():5.1f} ({worst})  "
              f"cam ({C[0]:+.2f},{C[1]:+.2f},{C[2]:+.2f}) f {f:.0f}px ({f / SIZE[p][0] * 36:.0f}mm-eq)")
        out[p] = dict(C=C.tolist(), R=R.tolist(), f=float(f), W=SIZE[p][0], H=SIZE[p][1])
    return out


if __name__ == "__main__":
    photos = list(PICKS)
    prob = Problem(photos)
    n = len(prob.x)
    cam_only = np.zeros(n, bool)
    cam_only[:7 * len(photos)] = True
    c = lm(prob, cam_only)
    print(f"cameras-only cost {c:.0f}")
    c = lm(prob)
    print(f"joint cost {c:.0f}  ({len(prob.obs)} picks, {n} unknowns)")
    cams = report(prob)
    lms = {}
    print("landmarks (x, y, z) m:")
    for nme in prob.lm_names:
        P = prob.point(prob.x, nme + ("" if nme in CENTRE or nme == "FUEL" else "_R"))
        lms[nme] = P.tolist()
        print(f"  {nme:<8} ({P[0]:+.3f}, {P[1]:+.3f}, {P[2]:.3f})")
    hub = prob.x[prob.hub_slot:prob.hub_slot + 5]
    print(f"  hubcap x  front {hub[0]:.3f}  rear {hub[1]:.3f}   tread x  front {hub[2]:.3f}  rear {hub[3]:.3f}"
          f"   hub z {hub[4]:.3f}")
    # per-pick residuals, worst first
    r = prob.residual(prob.x).reshape(-1, 2)
    e = np.linalg.norm(r, axis=1)
    print("worst picks:")
    for i in np.argsort(-e)[:12]:
        print(f"  {prob.obs[i][0]:<11} {prob.obs[i][1]:<10} {e[i]:5.1f}px  d=({r[i][0]:+.0f},{r[i][1]:+.0f})")
    json.dump(dict(cameras=cams, landmarks=lms, hub_x=hub.tolist()),
              open(__file__.rsplit("/", 1)[0] + "/solve.json", "w"), indent=1)
