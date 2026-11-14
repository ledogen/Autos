#!/usr/bin/env python3
# test/lib/threadcounts.py — PERF-40: one thread's retired INSTRUCTIONS, cycles and CPU time, split by core class (P / E),
# from outside the process and WITHOUT root.
#
# Why: main-thread ms/s on this Mac follows the core macOS picks, not the work (COST-MAP-2026-11 § the clock trap: the
# same drive reads 1.6–3.3× more ms when the host is quiet, because light work runs on a slow core). Instructions
# retired do not depend on the core or its clock, so they are the work measure; cycles ÷ time is the clock; the P share
# of CPU time says which cores ran it.
#
# How: proc_pidinfo(PROC_PIDTHREADCOUNTS = 34), the per-thread, per-perf-level counters xnu keeps (macOS 13+; flavor 34
# and PROC_PIDLISTTHREADIDS = 28 are in xnu's proc_info_private.h, not the SDK). Allowed for any process of the same
# user. Perf level 0 is the P cluster (sysctl hw.perflevel0.name = Performance), 1 the E cluster.
#
#   python3 -I test/lib/threadcounts.py <pid> [interval_s=0.25] [thread name=CrRendererMain]   one JSON line per interval:
#     { t (ms), P: [instructions, cycles, cpu ns], E: [...] }   cumulative since the thread began; the reader takes deltas
#   python3 -I test/lib/threadcounts.py --check                  self-check, exit 1 on failure
#
# What it cannot see: memory stalls cost time but no instructions, so a change that only adds cache misses shows in ms,
# not here; and it counts the whole thread, so a bucket's share of it (physics) is apportioned by that bucket's ms.
import ctypes as C, json, sys, threading, time

lib = C.CDLL('/usr/lib/libproc.dylib')
lib.proc_pidinfo.argtypes = [C.c_int, C.c_int, C.c_uint64, C.c_void_p, C.c_int]
LISTTHREADIDS, THREADID64INFO, THREADCOUNTS = 28, 15, 34

class TB(C.Structure): _fields_ = [('numer', C.c_uint32), ('denom', C.c_uint32)]
tb = TB(); C.CDLL('/usr/lib/libSystem.dylib').mach_timebase_info(C.byref(tb))
NS = tb.numer / tb.denom   # mach ticks → ns (125/3 on Apple Silicon)

def tids(pid):
    buf = (C.c_uint64 * 4096)(); n = lib.proc_pidinfo(pid, LISTTHREADIDS, 0, buf, C.sizeof(buf))
    return list(buf[:max(0, n) // 8])

def name(pid, tid):   # proc_threadinfo: 2 × u64 + 8 × i32, then pth_name[64]
    b = (C.c_char * 112)(); return bytes(b[48:112]).split(b'\0')[0].decode(errors='replace') if lib.proc_pidinfo(pid, THREADID64INFO, tid, b, 112) == 112 else None

def counts(pid, tid):   # proc_threadcounts: u16 len, u16, u32, then per perf level {instr, cycles, user, system (mach), energy nJ}
    b = (C.c_uint64 * 11)()
    if lib.proc_pidinfo(pid, THREADCOUNTS, tid, b, C.sizeof(b)) != 88: return None
    return {k: [b[i], b[i + 1], round((b[i + 2] + b[i + 3]) * NS)] for k, i in (('P', 1), ('E', 6))}

def find(pid, want):
    for t in tids(pid):
        if name(pid, t) == want: return t
    return None

if '--check' in sys.argv:
    import os
    me, spun, read = os.getpid(), threading.Event(), threading.Event()
    def spin():   # 0.6 s of busy CPU, then stays alive (asleep) until it has been read
        C.CDLL('/usr/lib/libSystem.dylib').pthread_setname_np(b'tc-check'); spun.set()
        t = time.time()
        while time.time() - t < 0.6: pass
        read.wait()
    th = threading.Thread(target=spin); th.start(); spun.wait(); tid = find(me, 'tc-check'); time.sleep(0.8)
    c = counts(me, tid) if tid else None
    read.set(); th.join()
    ns = c and c['P'][2] + c['E'][2]; ins = c and c['P'][0] + c['E'][0]; cyc = c and c['P'][1] + c['E'][1]
    ok = bool(c) and 0.45e9 < ns < 0.75e9 and ins > 1e8 and 0.5 < cyc / ns < 6
    print(('PASS' if ok else 'FAIL') + f'  threadcounts: {json.dumps(c)}' + (f'  ({ns / 1e6:.0f} ms CPU, {cyc / ns:.2f} GHz, {ins / cyc:.2f} IPC)' if c else ''))
    sys.exit(0 if ok else 1)

pid = int(sys.argv[1]); iv = float(sys.argv[2]) if len(sys.argv) > 2 else 0.25; want = sys.argv[3] if len(sys.argv) > 3 else 'CrRendererMain'
tid = None
while True:
    tid = tid or find(pid, want)
    c = tid and counts(pid, tid)
    if c: print(json.dumps({'t': round(time.time() * 1000), **c}), flush=True)
    elif not tids(pid): break   # the process is gone
    time.sleep(iv)
