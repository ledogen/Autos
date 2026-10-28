---
id: BUG-97
type: bug
status: open
severity: minor
opened: 2026-10-26
source: BUG-90 vertical-curvature scan (test/vertical-curvature.mjs) — needs an owner ruling before any fix
---

# BUG-97: Junction-zone wheel-track sags (0.03–0.10 /m), pinned by a ceiling gate

## What
The BUG-90 tripwire drives every run on three wheel tracks (−2.5, 0, +2.5 m) and every deg-2
connector, measuring κ = the change of grade over one 2.85 m wheelbase. After the BUG-90 fixes it
still finds **200 spots over 0.03 /m within 40 m of a node** (8 windows, ~245 km; main had 226),
mostly a SAG on ONE wheel track, 3–25 m from the node, 0.03–0.10 /m. Worst: seed 20 (−1448.5, 674.9)
0.097 /m; seed 20 (−195.3, 238.1) 0.085; dip-1 world (248.6, 1062.6) 0.083. `--report` lists them all.

## Why it is not just fixed
The owner's two reference points: dip 3 (junction-blend sag, 0.021 /m, taken at speed) is "fun and
fair"; dip 2 (0.074 /m at fun speed, ~+4 g) is unacceptable. These sit between, and at JUNCTION speed
(~12 m/s) a 0.08 /m sag is ~+1.2 g. Whether that is fair is a design call (n=1 is not calibration).

## Owner question
Are one-wheel-track sags of 0.03–0.10 /m within ~25 m of a junction acceptable at junction speed?
- Yes → leave them; the ceiling stays as a regression guard.
- No → find the mechanism (the FEAT-82 hold/recovery and pad-plane camber hand-off are the suspects;
  one-track = a camber change, not a grade change) and lower `CEIL.junction` / `JN_KMAX` as it falls.

## Acceptance
- [ ] Owner ruling on the question above.
- [ ] If "no": mechanism found, fixed at the source, gate ceiling lowered to the new count.
