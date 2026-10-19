"""Seamless engine-loop cutter for the engine-sim bake (FEAT-120).

Usage (from assets/audio/src/engine/):
    python cutter.py --selftest      synthetic check, no files needed
    python cutter.py takes-<engine>.csv <engine>   cut every take listed for that engine

takes.csv columns: file,load,throttle,rpm_target,rpm_displayed
    file           raw take relative to this folder, e.g. raw/vulcan30_2340_part.flac
    load           off | part | full | idle | crank | motor | start | shutoff
    throttle       0..1
    rpm_target     grid rpm (idle: the rpm it settled at; crank: the starter speed)
    rpm_displayed  rpm measured during the take (by engine-sim-render, or read off the sim)

Outputs (paths relative to this folder):
    dry takes        -> ../../engine/<name>.flac, listed in ../../engine/manifest-<engine>.json
    *_stock takes    -> ../engine-muffler-reference/<name>.flac (not in the manifest)
    load "start" or "shutoff" -> ../engine-start-reference/<name>.flac, copied through uncut (not loops,
                        not in the manifest): key-on, crank, catch, flare and settle

All takes must share one sample rate; the manifest records it.
A loop is a whole number of 4-stroke cycles. One cycle = 2 revs, so T = 120 / rpm seconds.
"""
import csv
import json
import os
import sys

import numpy as np
import soundfile as sf

SR = 48000              # self-test rate only; real takes keep their own rate
LOOP_TARGET_S = 2.0     # loop length to aim for
START_S = 1.0           # loop starts this far into the take
SEARCH_FRAC = 0.05      # autocorrelation search: +-5 % around 120/rpm
END_TUNE_S = 0.002      # end-point fine tune: +-2 ms
XFADE_S = 0.010         # seam crossfade length


def ncorr(a, b):
    """Normalised correlation of two equal-length arrays (1 = identical shape)."""
    d = np.sqrt(np.dot(a, a) * np.dot(b, b))
    return float(np.dot(a, b) / d) if d > 0 else 0.0


def parabolic_peak(scores, i):
    """Sub-sample offset of a peak at index i, from a parabola through 3 points."""
    if i <= 0 or i >= len(scores) - 1:
        return 0.0
    y0, y1, y2 = scores[i - 1], scores[i], scores[i + 1]
    den = y0 - 2 * y1 + y2
    return 0.5 * (y0 - y2) / den if den != 0 else 0.0


def best_lag(x, start, win, lo, hi):
    """Lag in [lo, hi] samples where x best matches itself shifted. Returns float lag."""
    a = x[start:start + win]
    lags = np.arange(lo, hi + 1)
    scores = np.array([ncorr(a, x[start + L:start + L + win]) for L in lags])
    i = int(np.argmax(scores))
    return lags[i] + parabolic_peak(scores, i), float(scores[i])


def refine_period(x, rpm_guess, sr=SR, frac=SEARCH_FRAC):
    """True cycle period in samples (float), from autocorrelation."""
    t0 = 120.0 * sr / rpm_guess
    start = int(0.5 * sr)
    win = int(max(2 * t0, 0.25 * sr))
    # Coarse: one cycle, +-5 %.
    lag1, _ = best_lag(x, start, win, int(t0 * (1 - frac)), int(t0 * (1 + frac)) + 1)
    # Fine: many cycles apart, +-1/4 cycle, divides the integer-sample error by m.
    m = int((len(x) - start - win - lag1 / 4) / lag1) - 1
    m = min(max(m, 1), 40)
    c = lag1 * m
    lagm, score = best_lag(x, start, win, int(c - lag1 / 4), int(c + lag1 / 4) + 1)
    return lagm / m, score


def rising_zero_crossing(x, near, span):
    """Index of the rising zero crossing closest to `near`, within +-span samples."""
    lo, hi = max(1, near - span), min(len(x) - 1, near + span)
    seg = x[lo - 1:hi]
    idx = np.where((seg[:-1] < 0) & (seg[1:] >= 0))[0] + lo
    if len(idx) == 0:
        return near
    return int(idx[np.argmin(np.abs(idx - near))])


def cut_loop(audio, rpm_guess, sr=SR):
    """Cut one seamless loop; if the seam is poor, retry with a tight +-1 % period search around
    the measured rpm (slow, rippling cranks can snag a wrong repeat in the +-5 % search)."""
    loop, info = _cut_loop(audio, rpm_guess, sr, SEARCH_FRAC)
    if info["seamCorr"] < 0.8:
        loop2, info2 = _cut_loop(audio, rpm_guess, sr, 0.01)
        if info2["seamCorr"] > info["seamCorr"]:
            return loop2, info2
    return loop, info


def _cut_loop(audio, rpm_guess, sr, frac):
    """Cut one seamless loop. audio: (n,) or (n, ch). Returns (loop, info dict)."""
    mono = audio if audio.ndim == 1 else audio.mean(axis=1)
    period, score = refine_period(mono, rpm_guess, sr, frac)
    rpm = 120.0 * sr / period
    k = max(1, round(LOOP_TARGET_S * sr / period))
    tune = int(END_TUNE_S * sr)
    w = max(int(XFADE_S * sr), int(period / 4))
    # Try every whole-cycle start from START_S on and keep the best seam. With random combustion
    # (light-load idle especially), some windows wrap far better than others.
    best = None
    first = int(START_S * sr)
    for c in range(0, 10 ** 6):
        s0 = first + int(round(c * period))
        s = rising_zero_crossing(mono, s0, int(period / 2))
        e0 = s + int(round(k * period))
        if e0 + tune + w > len(mono):
            break
        head = mono[s:s + w]
        ends = np.arange(e0 - tune, e0 + tune + 1)
        e = int(ends[np.argmax([ncorr(head, mono[j:j + w]) for j in ends])])
        corr = ncorr(head, mono[e:e + w])
        if best is None or corr > best[2]:
            best = (s, e, corr)
    if best is None:
        raise ValueError("take too short for a %d-cycle loop starting at %.2f s" % (k, first / sr))
    s, e, seam_corr = best

    loop = audio[s:e].copy()
    f = int(XFADE_S * sr)
    th = np.linspace(0, np.pi / 2, f)
    fade_in, fade_out = np.sin(th), np.cos(th)
    if audio.ndim > 1:
        fade_in, fade_out = fade_in[:, None], fade_out[:, None]
    # Head becomes: what really follows the tail (audio after e), fading into the loop's own head.
    loop[:f] = audio[e:e + f] * fade_out + audio[s:s + f] * fade_in

    return loop, {
        "rpmMeasured": round(float(rpm), 1),
        "cycles": int(k),
        "samples": int(e - s),
        "rpmLoop": round(120.0 * sr * k / (e - s), 1),  # rpm implied by the loop's exact length
        "periodCorr": round(score, 4),
        "seamCorr": round(seam_corr, 4),
        "startS": round(s / sr, 3),
    }


def synth_take(rpm, seconds=6.0, sr=SR, seed=1):
    """Fake V6: 6 firing pulses per cycle, each cylinder a little different, plus noise."""
    rng = np.random.default_rng(seed)
    n = int(seconds * sr)
    t = np.arange(n) / sr
    cyc = 120.0 / rpm
    out = np.zeros(n)
    gains = 1 + 0.15 * rng.standard_normal(6)
    for c in range(6):
        t_fire = np.arange(c * cyc / 6, seconds, cyc)
        for tf in t_fire:
            i = int(tf * sr)
            m = min(n - i, int(0.02 * sr))
            tt = t[i:i + m] - t[i]
            out[i:i + m] += gains[c] * np.exp(-tt * 300) * np.sin(2 * np.pi * (180 + 40 * c) * tt)
    out += 0.02 * rng.standard_normal(n)
    return 0.5 * out / np.abs(out).max()


def selftest():
    for rpm_true in (750, 2340, 5500):
        x = synth_take(rpm_true)
        guess = rpm_true * 1.03  # sim display is only approximate
        loop, info = cut_loop(x, guess)
        period = 120.0 * SR / rpm_true
        expect = info["cycles"] * period
        assert abs(info["rpmMeasured"] - rpm_true) / rpm_true < 0.001, info
        assert abs(info["samples"] - expect) <= END_TUNE_S * SR, (info, expect)
        assert abs(info["samples"] / SR - LOOP_TARGET_S) < period / SR, info
        print("ok  %4d rpm -> %s" % (rpm_true, info))
    print("self-check passed")


def main(csv_path, engine):
    root = os.path.dirname(os.path.abspath(csv_path))           # assets/audio/src/engine
    grid_dir = os.path.normpath(os.path.join(root, "..", "..", "engine"))
    ref_dir = os.path.normpath(os.path.join(root, "..", "engine-muffler-reference"))
    os.makedirs(grid_dir, exist_ok=True)
    os.makedirs(ref_dir, exist_ok=True)
    entries, rate = [], None
    with open(csv_path, newline="") as fh:
        rows = [r for r in csv.DictReader(fh) if r["rpm_displayed"].strip()]  # skip unrecorded rows
    for row in rows:
        src = os.path.join(root, row["file"])
        if not src.lower().endswith(".flac"):
            raise ValueError("%s: takes must be FLAC (git refuses WAV under assets/audio)" % row["file"])
        audio, sr = sf.read(src, always_2d=False)
        if audio.ndim > 1:
            audio = audio.mean(axis=1)   # one exhaust outlet: mono
        if rate is None:
            rate = sr
        elif sr != rate:
            raise ValueError("%s is %d Hz, earlier takes are %d Hz" % (row["file"], sr, rate))
        name = os.path.basename(row["file"])
        if row["load"] in ("start", "shutoff"):
            start_dir = os.path.normpath(os.path.join(root, "..", "engine-start-reference"))
            os.makedirs(start_dir, exist_ok=True)
            sf.write(os.path.join(start_dir, name), audio, sr, format="FLAC", subtype="PCM_24")
            print("%-32s copied uncut (%.2f s)" % ("start " + name, len(audio) / sr))
            continue
        loop, info = cut_loop(audio, float(row["rpm_displayed"]), sr)
        is_ref = name[:-len(".flac")].endswith("_stock")
        out_dir = ref_dir if is_ref else grid_dir
        sf.write(os.path.join(out_dir, name), loop, sr, format="FLAC", subtype="PCM_24")
        peak = 20 * np.log10(np.abs(audio).max() + 1e-12)
        flags = ("  <-- check seam" if info["seamCorr"] < 0.8 else "") + \
                ("  <-- peak above -1 dBFS" if peak > -1 else "")
        print("%-32s %s peak %.1f dBFS%s" % (("ref " if is_ref else "") + name, info, peak, flags))
        if not is_ref:
            entries.append({
                "file": name,
                "load": row["load"],
                "throttle": float(row["throttle"]),
                "rpmTarget": float(row["rpm_target"]),
                "rpmDisplayed": float(row["rpm_displayed"]),
                **info,
                "peakDbfs": round(float(peak), 2),
            })
    manifest = "manifest-%s.json" % engine
    with open(os.path.join(grid_dir, manifest), "w", newline="\n") as fh:
        json.dump({"engine": engine, "sampleRate": rate, "loops": entries}, fh, indent=2)
        fh.write("\n")
    print("wrote %s with %d grid loops" % (manifest, len(entries)))


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--selftest":
        selftest()
    elif len(sys.argv) == 3:
        main(sys.argv[1], sys.argv[2])
    else:
        print(__doc__)
        sys.exit(1)
