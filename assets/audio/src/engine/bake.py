"""One-command engine bake (FEAT-120): render takes with engine-sim-render, lock levels, cut loops.

Usage (from assets/audio/src/engine/):
    python bake.py render     render all takes into raw/*.flac and write takes.csv
    python bake.py cut        cut loops from takes.csv (runs cutter.py)
    python bake.py all        render, then cut
    python bake.py sweep      wide-open dyno table, for the torque sanity check

The engine script is the one you proof in the engine-sim app, left in its proofed mode (stock IR,
your noise settings). Dry grid takes override that at render time: unit-impulse IR, noise 0,
jitter 0. Reference takes render the script as-is. So what you proofed is what gets baked.

Levels: every take renders at the same fixed leveler gain. Then ONE scale factor for the whole
dry grid puts its loudest take at TARGET_PEAK_DBFS. The reference takes use the same factor unless
that would push them past -1 dBFS; then they get their own, and the dB difference is logged.

Needs: engine-sim-render.exe in engine-sim's bin/ folder, numpy, soundfile.
"""
import csv
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINESIM = os.path.expandvars(r"%USERPROFILE%\Downloads\engine-sim\engine-sim-build_0_1_11a")
RENDER = os.path.join(ENGINESIM, "bin-autos", "engine-sim-render.exe")   # built from the v0.1.11a fork
STOCK_IR = os.path.join(ENGINESIM, "es", "sound-library", "new", "mild_exhaust_reverb.wav")
STOCK_IR_OUT = "ir/mild_exhaust_reverb_engine-sim.flac"   # the IR exactly as engine-sim applies it
PREVIEW_DIR = os.path.expandvars(r"%USERPROFILE%\Music\engine-bake-preview")  # outside the repo

ENGINE = "vulcan30"
ENGINE_MR = "engines/autos/vulcan30.mr"        # relative to engine-sim's assets/
DRY_IR = os.path.join(ENGINESIM, "assets", "engines", "autos", "dirac.wav")
DRY_IR_VOLUME = 0.01

GRID_RPM = [750, 1000, 1325, 1760, 2340, 3110, 4140, 5500]
LOADS = [("off", 0.0), ("part", 0.30), ("full", 1.0)]
REFERENCES = [("idle_free", None, 0.0), ("2340_part", 2340, 0.30), ("4140_full", 4140, 1.0)]

WARMUP_S = 5.0             # covers the renderer's 1.5 s crank + 1 s dyno ramp, then settling
SECONDS = 6.0
START_SECONDS = 8.0        # start takes record from key-on: crank, catch, flare and settle
GAIN = 1.0                 # fixed leveler gain inside the renderer
TARGET_PEAK_DBFS = -3.0
REF_CEILING_DBFS = -1.0


def wrapper_script():
    """engine-sim scripts need a main() call; write a tiny one that imports the engine."""
    path = os.path.join(ENGINESIM, "assets", "_bake_main.mr")
    with open(path, "w", newline="\n") as fh:
        fh.write('import "engine_sim.mr"\nimport "%s"\nmain()\n' % ENGINE_MR)
    return "../assets/_bake_main.mr"           # relative to bin/, where the renderer runs


def render(script, out, rpm=None, throttle=0.0, dry=False, mode="dyno", seed=1, trace=None,
           seconds=SECONDS):
    """mode: dyno (hold rpm), free-idle, crank (ignition off, starter held), start (catch + flare)."""
    cmd = [RENDER, script, "--out", out, "--throttle", str(throttle), "--warmup", str(WARMUP_S),
           "--seconds", str(seconds), "--gain", str(GAIN), "--seed", str(seed)]
    cmd += ["--rpm", str(rpm)] if mode == "dyno" else ["--" + mode]
    if trace:
        cmd += ["--rpm-trace", trace]
    if dry:
        cmd += ["--ir", DRY_IR, "--ir-volume", str(DRY_IR_VOLUME), "--noise", "0", "--jitter", "0"]
    res = subprocess.run(cmd, cwd=os.path.join(ENGINESIM, "bin-autos"), capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit("render failed: %s\n%s" % (" ".join(cmd), res.stderr))
    return json.loads(res.stdout.strip().splitlines()[-1])


def plan():
    takes = []
    for rpm in GRID_RPM:
        for load, thr in LOADS:
            takes.append(dict(name="%s_%d_%s" % (ENGINE, rpm, load), load=load, throttle=thr,
                              rpm=rpm, dry=True, mode="dyno", ref=False))
    takes.append(dict(name="%s_idle_free" % ENGINE, load="idle", throttle=0.0, rpm=None,
                      dry=True, mode="free-idle", ref=False))
    # Starter layer for the game (FEAT-33): starter_torque 70 lb-ft and starter_speed 500 rpm in
    # the script must not change. Crank = ignition off, loops like a grid take. Start = ignition
    # on, held until it catches, then released; reference takes for the flare shape, not loops.
    takes.append(dict(name="%s_crank_dry" % ENGINE, load="crank", throttle=0.0, rpm=None,
                      dry=True, mode="crank", ref=False))
    for k in (1, 2, 3):
        takes.append(dict(name="%s_start_%d_dry" % (ENGINE, k), load="start", throttle=0.0,
                          rpm=None, dry=True, mode="start", ref=False, seconds=START_SECONDS,
                          seed=100 + k))
    for tag, rpm, thr in REFERENCES:
        load = "idle" if rpm is None else tag.split("_")[1]
        takes.append(dict(name="%s_%s_stock" % (ENGINE, tag), load=load, throttle=thr, rpm=rpm,
                          dry=False, mode="free-idle" if rpm is None else "dyno", ref=True))
    takes.append(dict(name="%s_crank_stock" % ENGINE, load="crank", throttle=0.0, rpm=None,
                      dry=False, mode="crank", ref=True))
    return takes


def cmd_render():
    if not os.path.exists(RENDER):
        raise SystemExit("no renderer at %s (build engine-sim-render first)" % RENDER)
    script = wrapper_script()
    takes = plan()
    tmp = tempfile.mkdtemp(prefix="bake_")
    os.makedirs(os.path.join(HERE, "raw"), exist_ok=True)
    for i, t in enumerate(takes):
        t["tmp"] = os.path.join(tmp, t["name"] + ".wav")
        trace = os.path.join(HERE, "raw", t["name"] + "_rpm.csv") if t["mode"] == "start" else None
        t["info"] = render(script, t["tmp"], t["rpm"], t["throttle"], t["dry"], t["mode"],
                           seed=t.get("seed", i + 1), trace=trace,
                           seconds=t.get("seconds", SECONDS))
        extra = ("  caught %.2f s, peak %.0f rpm" % (t["info"]["caughtAtS"], t["info"]["rpmMax"])
                 if t["mode"] == "start" else "")
        print("%2d/%d %-28s rpm %7.1f  peak %6.1f dBFS%s" % (i + 1, len(takes), t["name"],
              t["info"]["rpmMean"], t["info"]["peakDbfs"], extra))

    db = lambda x: 20 * np.log10(max(x, 1e-12))
    grid_peak = max(t["info"]["peak"] for t in takes if not t["ref"])
    scale = 10 ** (TARGET_PEAK_DBFS / 20) / grid_peak
    ref_peak = max(t["info"]["peak"] for t in takes if t["ref"])
    ref_scale = scale
    if db(ref_peak * scale) > REF_CEILING_DBFS:
        ref_scale = 10 ** (TARGET_PEAK_DBFS / 20) / ref_peak
    print("level lock: grid x%.4f (%+.2f dB); references x%.4f (%+.2f dB vs grid)"
          % (scale, db(scale), ref_scale, db(ref_scale / scale)))

    rows = []
    for t in takes:
        x, sr = sf.read(t["tmp"], dtype="float64")
        x *= ref_scale if t["ref"] else scale
        rel = "raw/%s.flac" % t["name"]
        sf.write(os.path.join(HERE, rel), x, sr, format="FLAC", subtype="PCM_24")
        rpm_measured = t["info"]["rpmMean"]
        target = t["rpm"] or (round(t["info"]["starterRpm"]) if t["mode"] == "crank"
                              else round(rpm_measured))
        rows.append([rel, t["load"], t["throttle"], target, round(rpm_measured, 1)])
        os.remove(t["tmp"])

    with open(os.path.join(HERE, "takes.csv"), "w", newline="\n") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(["file", "load", "throttle", "rpm_target", "rpm_displayed"])
        w.writerows(rows)
    log = dict(engine=ENGINE, script=ENGINE_MR, warmup=WARMUP_S, seconds=SECONDS, gain=GAIN,
               dryIr=os.path.basename(DRY_IR), dryIrVolume=DRY_IR_VOLUME,
               gridScale=scale, gridScaleDb=db(scale), refScale=ref_scale,
               refVsGridDb=db(ref_scale / scale), takes=[t["info"] for t in takes])
    with open(os.path.join(HERE, "raw", "render_log.json"), "w", newline="\n") as fh:
        json.dump(log, fh, indent=2)
        fh.write("\n")
    print("wrote %d takes to raw/, takes.csv and raw/render_log.json" % len(takes))


def engine_sim_ir(path):
    """The IR as engine-sim's synthesizer uses it: cut after the last sample with |x| > 100
    (of 32767) and capped at 10,000 samples. Returned as float, int16 / 32767."""
    ir16, sr = sf.read(path, dtype="int16")
    loud = np.nonzero(np.abs(ir16.astype(int)) > 100)[0]
    n = min(10000, int(loud[-1]) + 1 if len(loud) else 0)
    return ir16[:n].astype(np.float64) / 32767, sr


def cmd_cut():
    subprocess.run([sys.executable, os.path.join(HERE, "cutter.py"), os.path.join(HERE, "takes.csv")],
                   check=True)
    # The stock IR exactly as engine-sim applies it. Dry loop (*) this IR = the stock sim sound,
    # at the same bake scale (both IRs render at volume 0.01), apart from the noise knobs.
    h, sr = engine_sim_ir(STOCK_IR)
    sf.write(os.path.join(HERE, STOCK_IR_OUT), h, sr, format="FLAC", subtype="PCM_16")
    # Previews: every grid loop through that IR, looped twice so the seam is audible.
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    grid = os.path.normpath(os.path.join(HERE, "..", "..", "engine"))
    peaks = {}
    for name in sorted(os.listdir(grid)):
        if not name.endswith(".flac"):
            continue
        x, sr = sf.read(os.path.join(grid, name))
        y = np.convolve(np.tile(x, 3), h)[len(x):3 * len(x)]   # middle copies: tail fully wrapped
        peaks[name] = (y, np.abs(y).max())
    norm = 10 ** (-1 / 20) / max(p for _, p in peaks.values())  # one gain for all previews
    for name, (y, _) in peaks.items():
        sf.write(os.path.join(PREVIEW_DIR, name.replace(".flac", "_stockir.flac")), y * norm, sr,
                 format="FLAC", subtype="PCM_24")
    print("wrote %s and %d previews in %s (one shared gain, %+.1f dB)"
          % (STOCK_IR_OUT, len(peaks), PREVIEW_DIR, 20 * np.log10(norm)))


def cmd_sweep():
    script = wrapper_script()
    subprocess.run([RENDER, script, "--sweep", "1000:5500:250", "--throttle", "1"],
                   cwd=os.path.join(ENGINESIM, "bin"), check=True)


if __name__ == "__main__":
    cmds = {"render": cmd_render, "cut": cmd_cut, "sweep": cmd_sweep,
            "all": lambda: (cmd_render(), cmd_cut())}
    if len(sys.argv) != 2 or sys.argv[1] not in cmds:
        print(__doc__)
        sys.exit(1)
    cmds[sys.argv[1]]()
