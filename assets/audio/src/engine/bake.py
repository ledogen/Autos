"""One-command engine bake (FEAT-120): render takes with engine-sim-render, lock levels, cut loops.

Usage (from assets/audio/src/engine/):
    python bake.py render <engine>   render all takes into raw/*.flac and write takes-<engine>.csv
    python bake.py cut <engine>      cut loops (cutter.py), export the stock IR, write previews
    python bake.py all <engine>      render, then cut
    python bake.py sweep <engine>    wide-open dyno table, for the torque check
    python bake.py airsweep <engine> idle airflow -> rpm table (feeds the idle-air controller)
Engines: vulcan30, duratec23 (see ENGINES).

Each engine script is the one proofed in the engine-sim app, left in proofed mode (stock IR, the
owner's noise). Dry takes override that at render time: unit-impulse IR, noise 0, jitter 0.
Stock reference takes render the script as-is. So what was proofed is what gets baked.

Levels: every take renders at the same fixed leveler gain, then is scaled by GRID_SCALE, the
Vulcan's dry factor (x0.1852 put its 5500 full at -3 dBFS). Every engine shares it, so engines sit
at honest relative loudness. A take that would pass -1 dBFS gets its own factor (to -3 dBFS); the
dB offset is logged in raw/render_log-<engine>.json.

Needs: engine-sim-render.exe in engine-sim's bin-autos/ folder, numpy, soundfile.
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
sys.path.insert(0, HERE)
import cutter  # noqa: E402

ENGINESIM = os.path.expandvars(r"%USERPROFILE%\Downloads\engine-sim\engine-sim-build_0_1_11a")
BIN = os.path.join(ENGINESIM, "bin-autos")
RENDER = os.path.join(BIN, "engine-sim-render.exe")   # built from the v0.1.11a fork
STOCK_IR = os.path.join(ENGINESIM, "es", "sound-library", "new", "mild_exhaust_reverb.wav")
STOCK_IR_OUT = "ir/mild_exhaust_reverb_engine-sim.flac"   # the IR exactly as engine-sim applies it
PREVIEW_DIR = os.path.expandvars(r"%USERPROFILE%\Music\engine-bake-preview")  # outside the repo
DRY_IR = os.path.join(ENGINESIM, "assets", "engines", "autos", "dirac.wav")
DRY_IR_VOLUME = 0.01

VULCAN_GRID = [750, 1000, 1325, 1760, 2340, 3110, 4140, 5500]
SPARK_RESERVE = ["--spark-offset", "-8", "--spark-max", "8", "--spark-k", "0.4"]
ENGINES = {
    "vulcan30": dict(
        mr="engines/autos/vulcan30.mr",
        grid=VULCAN_GRID,
        # idle airflow -> rpm, measured with `bake.py airsweep vulcan30` (feeds the idle-air control)
        air_table="0.008:531,0.010:772,0.012:968,0.014:1125,0.016:1296,0.018:1455,0.020:1582,0.022:1691",
        # Free-running idle can't hold 750 +-10 (random combustion, 0.5): balanced dyno idle instead.
        idle="balanced",
        flare_kacc=1.0,
    ),
    "duratec23": dict(
        mr="engines/autos/duratec23.mr",
        grid=VULCAN_GRID + [6400],          # the game's I4 revs to 6450
        air_table="0.0008:446,0.0013:727,0.0018:949,0.0023:1106,0.0028:1247,0.0033:1377,0.0038:1499,0.0043:1617",
        idle="free",                        # holds 750 +-10 running free on the plate (0.99919)
        flare_kacc=0.4,
    ),
}
LOADS = [("off", 0.0), ("part", 0.30), ("full", 1.0)]
REFERENCES = [("2340_part", 2340, 0.30), ("4140_full", 4140, 1.0)]
GAME_TORQUE = {800: 140, 1500: 170, 2500: 192, 3750: 209, 4500: 204, 5250: 195, 6000: 165}

WARMUP_S = 5.0             # covers the renderer's 1.5 s crank + 1 s dyno ramp, then settling
SECONDS = 6.0
IDLE_SECONDS = 12.0        # idle takes: more audio for the cutter's best-seam search
START_SECONDS = 8.0        # start takes record from key-on: crank, catch, flare and settle
IDLE_SEEDS = 5             # idle takes: try this many seeds, keep the first with seam >= 0.95
GAIN = 1.0                 # fixed leveler gain inside the renderer
GRID_SCALE = 0.1852        # the Vulcan's dry factor (its 5500 full at -3 dBFS); shared by all engines
TARGET_PEAK_DBFS = -3.0
CEILING_DBFS = -1.0


def db(x):
    return 20 * np.log10(max(x, 1e-12))


def wrapper_script(engine):
    """engine-sim scripts need a main() call; write a tiny one that imports the engine."""
    name = "_bake_%s.mr" % engine
    with open(os.path.join(ENGINESIM, "assets", name), "w", newline="\n") as fh:
        fh.write('import "engine_sim.mr"\nimport "%s"\nmain()\n' % ENGINES[engine]["mr"])
    return "../assets/" + name                  # relative to bin-autos/, where the renderer runs


def run(args):
    res = subprocess.run([RENDER] + args, cwd=BIN, capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit("render failed: %s\n%s" % (" ".join(args), res.stderr))
    return res.stdout


def render(script, out, take, seed, trace=None):
    args = [script, "--out", out, "--throttle", str(take["throttle"]), "--warmup", str(WARMUP_S),
            "--seconds", str(take.get("seconds", SECONDS)), "--gain", str(GAIN), "--seed", str(seed)]
    args += take["args"]
    if trace:
        args += ["--rpm-trace", trace]
    if take["dry"]:
        args += ["--ir", DRY_IR, "--ir-volume", str(DRY_IR_VOLUME), "--noise", "0", "--jitter", "0"]
    return json.loads(run(args).strip().splitlines()[-1])


def plan(engine):
    cfg, takes = ENGINES[engine], []
    iac = ["--air-table", cfg["air_table"]]
    idle_args = (["--free-idle", "--idle-balanced", "--idle-target", "750"] + iac
                 if cfg["idle"] == "balanced" else ["--free-idle"])

    def add(name, load, throttle, rpm, args, dry, **kw):
        takes.append(dict(name="%s_%s" % (engine, name), load=load, throttle=throttle, rpm=rpm,
                          args=args, dry=dry, **kw))
    for rpm in cfg["grid"]:
        for load, thr in LOADS:
            add("%d_%s" % (rpm, load), load, thr, rpm, ["--rpm", str(rpm)], True)
    add("idle_free", "idle", 0.0, None, idle_args, True, seconds=IDLE_SECONDS, idle=True)
    # Starter layer (FEAT-33): starter_torque 70 lb-ft and starter_speed 500 rpm, the same in both
    # scripts. Crank = ignition off, loops. Start = ignition on, released when it catches; uncut.
    add("crank_dry", "crank", 0.0, None, ["--crank"], True)
    for k in (1, 2, 3):
        add("start_%d_dry" % k, "start", 0.0, None, ["--start"], True, seconds=START_SECONDS,
            seed=100 + k, trace=True)
    # Enriched start flare: the idle-air controller drives throttle along a scripted rpm trace.
    flare = ["--start"] + iac + ["--iac-kacc", str(cfg["flare_kacc"])] + SPARK_RESERVE
    for prof in ("warm", "cold"):
        for dry in (True, False):
            add("start_%s_%s" % (prof, "dry" if dry else "stock"), "start", 0.0, None,
                flare + ["--start-profile", prof], dry, seconds=START_SECONDS, seed=111, trace=True)
    # Stock references (script as proofed: stock IR, owner's noise).
    add("idle_free_stock", "idle", 0.0, None, idle_args, False, seconds=IDLE_SECONDS, idle=True)
    for tag, rpm, thr in REFERENCES:
        add("%s_stock" % tag, tag.split("_")[1], thr, rpm, ["--rpm", str(rpm)], False)
    add("crank_stock", "crank", 0.0, None, ["--crank"], False)
    return takes


def idle_quality(wav, trace, target=750.0):
    """Cycle-averaged rpm band over the recording and the cutter's best seam."""
    rows = [r for r in csv.DictReader(open(trace)) if float(r["time_s"]) >= WARMUP_S]
    t = np.array([float(r["time_s"]) for r in rows])
    rpm = np.array([float(r["rpm"]) for r in rows])
    n = max(1, int(round((120.0 / target) / np.median(np.diff(t)))))   # one 720-degree cycle
    avg = np.convolve(rpm, np.ones(n) / n, mode="valid")
    x, sr = sf.read(wav)
    _, info = cutter.cut_loop(x, float(rpm.mean()), sr)
    ok = abs(avg.min() - target) <= 10 and abs(avg.max() - target) <= 10 and info["seamCorr"] >= 0.95
    return dict(idleBandRpm=[round(float(avg.min()), 1), round(float(avg.max()), 1)],
                idleSeam=info["seamCorr"], idlePass=bool(ok))


def cmd_render(engine):
    if not os.path.exists(RENDER):
        raise SystemExit("no renderer at %s (build engine-sim-render first)" % RENDER)
    script = wrapper_script(engine)
    takes = plan(engine)
    tmp = tempfile.mkdtemp(prefix="bake_")
    os.makedirs(os.path.join(HERE, "raw"), exist_ok=True)
    for i, t in enumerate(takes):
        t["tmp"] = os.path.join(tmp, t["name"] + ".wav")
        base_seed = t.get("seed", i + 1)
        if t.get("idle"):
            tr = os.path.join(tmp, t["name"] + "_rpm.csv")
            best = None
            for s in range(base_seed, base_seed + IDLE_SEEDS):
                info = render(script, t["tmp"], t, s, trace=tr)
                info.update(idle_quality(t["tmp"], tr), seed=s)
                if best is None or info["idleSeam"] > best[0]["idleSeam"]:
                    best = (info, open(t["tmp"], "rb").read())
                if info["idlePass"]:
                    break
            t["info"] = best[0]
            open(t["tmp"], "wb").write(best[1])
        else:
            trace = os.path.join(HERE, "raw", t["name"] + "_rpm.csv") if t.get("trace") else None
            t["info"] = render(script, t["tmp"], t, base_seed, trace=trace)
            t["info"]["seed"] = base_seed
        extra = ""
        if t["load"] == "start":
            extra = "  caught %.2f s, max %.0f rpm" % (t["info"]["caughtAtS"], t["info"]["rpmMax"])
        if t.get("idle"):
            extra = "  idle %s, seam %.3f, seed %d%s" % (t["info"]["idleBandRpm"], t["info"]["idleSeam"],
                    t["info"]["seed"], "" if t["info"]["idlePass"] else "  <-- FAILS 750+-10 / 0.95")
        print("%2d/%d %-30s rpm %7.1f  peak %6.1f dBFS%s" % (i + 1, len(takes), t["name"],
              t["info"]["rpmMean"], t["info"]["peakDbfs"], extra), flush=True)

    rows, own = [], []
    for t in takes:
        peak = t["info"]["peak"]
        scale = GRID_SCALE
        if db(peak * GRID_SCALE) > CEILING_DBFS:
            scale = 10 ** (TARGET_PEAK_DBFS / 20) / peak
            own.append("%s %+.2f dB" % (t["name"], db(scale / GRID_SCALE)))
        t["info"]["scale"] = scale
        t["info"]["offsetVsGridDb"] = round(db(scale / GRID_SCALE), 2)
        x, sr = sf.read(t["tmp"], dtype="float64")
        rel = "raw/%s.flac" % t["name"]
        sf.write(os.path.join(HERE, rel), x * scale, sr, format="FLAC", subtype="PCM_24")
        rpm_measured = t["info"]["rpmMean"]
        target = t["rpm"] or (round(t["info"]["starterRpm"]) if t["load"] == "crank"
                              else round(rpm_measured))
        rows.append([rel, t["load"], t["throttle"], target, round(rpm_measured, 1)])
        os.remove(t["tmp"])
    print("level lock: x%.4f (%+.2f dB) for every take; own factor: %s"
          % (GRID_SCALE, db(GRID_SCALE), "; ".join(own) or "none"))

    with open(os.path.join(HERE, "takes-%s.csv" % engine), "w", newline="\n") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(["file", "load", "throttle", "rpm_target", "rpm_displayed"])
        w.writerows(rows)
    log = dict(engine=engine, script=ENGINES[engine]["mr"], warmup=WARMUP_S, seconds=SECONDS,
               gain=GAIN, dryIr=os.path.basename(DRY_IR), dryIrVolume=DRY_IR_VOLUME,
               gridScale=GRID_SCALE, gridScaleDb=db(GRID_SCALE), ceilingDbfs=CEILING_DBFS,
               takes=[dict(name=t["name"], **t["info"]) for t in takes])
    with open(os.path.join(HERE, "raw", "render_log-%s.json" % engine), "w", newline="\n") as fh:
        json.dump(log, fh, indent=2)
        fh.write("\n")
    print("wrote %d takes to raw/, takes-%s.csv and raw/render_log-%s.json" % (len(takes), engine, engine))


def engine_sim_ir(path):
    """The IR as engine-sim's synthesizer uses it: cut after the last sample with |x| > 100
    (of 32767) and capped at 10,000 samples. Returned as float, int16 / 32767."""
    ir16, sr = sf.read(path, dtype="int16")
    loud = np.nonzero(np.abs(ir16.astype(int)) > 100)[0]
    n = min(10000, int(loud[-1]) + 1 if len(loud) else 0)
    return ir16[:n].astype(np.float64) / 32767, sr


def cmd_cut(engine):
    subprocess.run([sys.executable, os.path.join(HERE, "cutter.py"),
                    os.path.join(HERE, "takes-%s.csv" % engine), engine], check=True)
    # The stock IR exactly as engine-sim applies it. Dry loop (*) this IR = the stock sim sound,
    # at the same bake scale (both IRs render at volume 0.01), apart from the noise knobs.
    h, sr = engine_sim_ir(STOCK_IR)
    sf.write(os.path.join(HERE, STOCK_IR_OUT), h, sr, format="FLAC", subtype="PCM_16")
    # Previews: every loop of this engine through that IR, twice round so the seam is audible.
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    grid = os.path.normpath(os.path.join(HERE, "..", "..", "engine"))
    peaks = {}
    for name in sorted(os.listdir(grid)):
        if not (name.startswith(engine + "_") and name.endswith(".flac")):
            continue
        x, sr = sf.read(os.path.join(grid, name))
        y = np.convolve(np.tile(x, 3), h)[len(x):3 * len(x)]   # middle copies: tail fully wrapped
        peaks[name] = (y, np.abs(y).max())
    norm = 10 ** (-1 / 20) / max(p for _, p in peaks.values())  # one gain for all previews
    for name, (y, _) in peaks.items():
        sf.write(os.path.join(PREVIEW_DIR, name.replace(".flac", "_stockir.flac")), y * norm, sr,
                 format="FLAC", subtype="PCM_24")
    print("wrote %s and %d previews in %s (one shared gain, %+.1f dB)"
          % (STOCK_IR_OUT, len(peaks), PREVIEW_DIR, db(norm)))


def cmd_sweep(engine):
    out = run([wrapper_script(engine), "--sweep", "750:6500:250", "--throttle", "1"])
    print(out.strip())
    r, t = np.array([tuple(map(float, l.split(",")[:2])) for l in out.split()[1:]]).T
    print("vs the game's curve:")
    for g, gt in GAME_TORQUE.items():
        s = np.interp(g, r, t)
        print("  %5d rpm  game %4d  sim %6.1f N-m  %+5.1f %%" % (g, gt, s, 100 * (s - gt) / gt))


def cmd_airsweep(engine):
    a = [float(p.split(":")[0]) for p in ENGINES[engine]["air_table"].split(",")]
    print(run([wrapper_script(engine), "--air-sweep", "%g:%g:9" % (max(a), min(a)),   # rich to lean
               "--noise", "0", "--jitter", "0", "--ir", DRY_IR, "--seed", "25", "--seconds", "60",
               "--out", os.path.join(tempfile.gettempdir(), "airsweep.wav")]).strip())


if __name__ == "__main__":
    cmds = {"render": cmd_render, "cut": cmd_cut, "sweep": cmd_sweep, "airsweep": cmd_airsweep,
            "all": lambda e: (cmd_render(e), cmd_cut(e))}
    if len(sys.argv) != 3 or sys.argv[1] not in cmds or sys.argv[2] not in ENGINES:
        print(__doc__)
        sys.exit(1)
    cmds[sys.argv[1]](sys.argv[2])
