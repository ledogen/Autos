#!/usr/bin/env python3
# test/lib/ioreport.py — PERF-40: CPU / GPU / DRAM power and the GPU clock on Apple Silicon, WITHOUT root.
#
# Reads the IOReport counters powermetrics reads: the "Energy Model" group's CPU Energy, GPU Energy and DRAM channels
# (energy since the last sample → watts), and the "GPU Stats / GPU Performance States" residency (the share of time
# in each P-state; weighted by pmgr's `voltage-states9` frequency table → the mean active clock). The table matched the
# owner's powermetrics output exactly (338 / 618 / 796 / … / 1470 MHz on the M4, 2026-11-12).
#
#   python3 -I test/lib/ioreport.py [interval_s=1] [count=0 → forever]   one JSON line per interval:
#     { t (ms), cpuW, gpuW, aneW, dramW, gpuBusy (% of time not OFF), gpuMHz (mean while active) }
#   python3 -I test/lib/ioreport.py --check                                self-check, exit 1 on failure
#
# The comparison metric for GPU load is ACTIVE CYCLES, gpuBusy × gpuMHz: the GPU lowers its clock as its load drops, so
# GPU ms per frame stays near the frame budget whatever changes, and GPU watts swing ±50 % over 6 s at a steady state.
# macOS-only, Apple Silicon only; libIOReport is a private framework (no headers), so the signatures are declared here.
import ctypes as C, ctypes.util, json, sys, time

cf = C.CDLL(ctypes.util.find_library('CoreFoundation'))
ior = C.CDLL('/usr/lib/libIOReport.dylib')
V, P = C.c_void_p, C.c_char_p
for fn, res, args in [
    ('CFStringCreateWithCString', V, [V, P, C.c_uint32]), ('CFStringGetCString', C.c_bool, [V, C.c_char_p, C.c_long, C.c_uint32]),
    ('CFDictionaryGetValue', V, [V, V]), ('CFArrayGetCount', C.c_long, [V]), ('CFArrayGetValueAtIndex', V, [V, C.c_long]),
    ('CFRelease', None, [V]), ('CFDictionaryCreateMutableCopy', V, [V, C.c_long, V])]:
    f = getattr(cf, fn); f.restype = res; f.argtypes = args
for fn, res, args in [
    ('IOReportCopyChannelsInGroup', V, [V, V, C.c_uint64, C.c_uint64, C.c_uint64]),
    ('IOReportMergeChannels', None, [V, V, V]),
    ('IOReportCreateSubscription', V, [V, V, C.POINTER(V), C.c_uint64, V]),
    ('IOReportCreateSamples', V, [V, V, V]), ('IOReportCreateSamplesDelta', V, [V, V, V]),
    ('IOReportChannelGetGroup', V, [V]), ('IOReportChannelGetSubGroup', V, [V]), ('IOReportChannelGetChannelName', V, [V]),
    ('IOReportChannelGetUnitLabel', V, [V]), ('IOReportSimpleGetIntegerValue', C.c_int64, [V, C.c_int32]),
    ('IOReportStateGetCount', C.c_int32, [V]), ('IOReportStateGetNameForIndex', V, [V, C.c_int32]),
    ('IOReportStateGetResidency', C.c_int64, [V, C.c_int32])]:
    f = getattr(ior, fn); f.restype = res; f.argtypes = args

UTF8 = 0x08000100
S = lambda s: cf.CFStringCreateWithCString(None, s.encode(), UTF8)
def pystr(r):
    if not r: return ''
    b = C.create_string_buffer(256); cf.CFStringGetCString(r, b, 256, UTF8); return b.value.decode()

chans = ior.IOReportCopyChannelsInGroup(S('Energy Model'), None, 0, 0, 0)
ior.IOReportMergeChannels(chans, ior.IOReportCopyChannelsInGroup(S('GPU Stats'), S('GPU Performance States'), 0, 0, 0), None)
want = cf.CFDictionaryCreateMutableCopy(None, 0, chans)
subbed = V()
sub = ior.IOReportCreateSubscription(None, want, C.byref(subbed), 0, None)
KEY = S('IOReportChannels')
SCALE = {'mJ': 1e-3, 'uJ': 1e-6, 'nJ': 1e-9}

# GPU P-state frequencies (MHz): ioreg's pmgr "voltage-states9" (freq Hz, voltage) pairs, le32 — the table powermetrics uses.
import subprocess, re
def gpu_freqs():
    out = subprocess.run(['ioreg', '-r', '-d', '1', '-w', '0', '-n', 'pmgr'], capture_output=True, text=True).stdout
    m = re.search(r'"voltage-states9" = <([0-9a-f]+)>', out)
    if not m: return []
    b = bytes.fromhex(m.group(1)); vals = [int.from_bytes(b[i:i + 4], 'little') for i in range(0, len(b), 4)]
    return [vals[i] / 1e6 for i in range(0, len(vals), 2) if vals[i]]
FREQS = gpu_freqs()

def sample(): return ior.IOReportCreateSamples(sub, subbed, None)
CHECK = '--check' in sys.argv
args = [a for a in sys.argv[1:] if not a.startswith('--')]
iv = float(args[0]) if args else (0.5 if CHECK else 1.0)
n = int(args[1]) if len(args) > 1 else (2 if CHECK else 0)
rows = []
prev, tprev, k = sample(), time.time(), 0
while n == 0 or k < n:
    time.sleep(iv)
    cur, t = sample(), time.time()
    d = ior.IOReportCreateSamplesDelta(prev, cur, None)
    arr = cf.CFDictionaryGetValue(d, KEY); dt = t - tprev
    out = {'t': round(t * 1000), 'cpuW': 0.0, 'gpuW': 0.0, 'aneW': 0.0, 'dramW': 0.0}
    for i in range(cf.CFArrayGetCount(arr)):
        ch = cf.CFArrayGetValueAtIndex(arr, i)
        grp, name = pystr(ior.IOReportChannelGetGroup(ch)), pystr(ior.IOReportChannelGetChannelName(ch))
        if grp == 'Energy Model':
            unit = pystr(ior.IOReportChannelGetUnitLabel(ch)).strip()
            w = ior.IOReportSimpleGetIntegerValue(ch, 0) * SCALE.get(unit, 1e-3) / dt
            if name == 'CPU Energy': out['cpuW'] += w
            elif name == 'GPU Energy': out['gpuW'] += w
            elif name == 'ANE': out['aneW'] += w
            elif name == 'DRAM': out['dramW'] += w
        elif grp == 'GPU Stats' and name == 'GPUPH':
            cnt = ior.IOReportStateGetCount(ch); res = [ior.IOReportStateGetResidency(ch, j) for j in range(cnt)]
            names = [pystr(ior.IOReportStateGetNameForIndex(ch, j)) for j in range(cnt)]
            tot = sum(res) or 1
            act = [(nm, r) for nm, r in zip(names, res) if nm not in ('OFF', 'IDLE', 'DOWN')]
            a = sum(r for _, r in act)
            out['gpuBusy'] = round(100 * a / tot, 1)
            if FREQS and a:
                f = [FREQS[min(j, len(FREQS) - 1)] for j in range(len(act))]
                out['gpuMHz'] = round(sum(fi * r for fi, (_, r) in zip(f, act)) / a)
    for k2 in ('cpuW', 'gpuW', 'aneW', 'dramW'): out[k2] = round(out[k2], 3)
    rows.append(out)
    if not CHECK: print(json.dumps(out), flush=True)
    cf.CFRelease(d); cf.CFRelease(prev); prev, tprev, k = cur, t, k + 1
if CHECK:
    r = rows[-1]
    ok = len(FREQS) >= 4 and r['cpuW'] > 0 and r['gpuW'] >= 0 and 'gpuBusy' in r and (r.get('gpuMHz') is None or FREQS[0] <= r['gpuMHz'] <= FREQS[-1] + 1)
    print(('PASS' if ok else 'FAIL') + f"  ioreport: {json.dumps(r)}  ({len(FREQS)} GPU P-states, {FREQS[0]:.0f}–{max(FREQS):.0f} MHz)")
    sys.exit(0 if ok else 1)
