---
id: FEAT-95
type: feature
status: done
severity: major
opened: 2026-10-01
updated: 2026-10-01
relates: FEAT-75, FEAT-61, FEAT-45
---

# FEAT-95: Crash-calm chase cam + reverse view

## Problem (owner, 2026-10-01)

1. In a big crash (flips, rolls) the chase-cam motion is unbearable and nauseating.
2. Reversing, the camera stays behind the truck instead of swinging round to show where you're going.

## Root cause (src/camera.js follow branch, pre-fix)

- The camera's heading WAS the body's yaw: the ground-plane projection of the long axis. Near
  nose-vertical (end-over-end, nose-first drops) that projection shrinks to nothing and its angle is
  noise; past vertical it is 180° away. The goal point jumped, and the position lerp went straight at
  it — a chord through the truck.
- The aim was a hard `lookAt` on the truck from 6.5 m — every tumble whipped the view 1:1.
- Headless measurement (scripted 3 s tumble at ~7 rad/s): old peak view turn rate **120 rad/s** (a
  one-frame 2 rad snap); new **2.0 rad/s**.

## Owner decisions (2026-10-01)

- Crash: **damped follow only** first (no special crash mode). If that is not enough, fall back to
  **steady witness**: on tumble detect freeze heading, pull back a few metres, soft-follow position,
  re-acquire behind ~1 s after settling.
- Reverse trigger: **backward speed** (with hysteresis), not gear.
- Normal heading: **body, lagged** (not velocity).
- Hood cam: **leave as-is** (rolls 1:1 with the body).

## Implemented (damped follow)

- Own heading `camYaw`, steered to body heading (+π in reverse) along the shortest arc: stiffness
  10 s⁻¹ scaled by (horizontal projection length)², capped at 2 rad/s. Goal placed from `camYaw`, so a
  heading change is an arc around the truck.
- Aim slerped toward the lookAt: 10 s⁻¹, capped 2.5 rad/s.
- Pitch-follow clamped ±0.6 rad and mirrored in reverse view.
- Reverse view: enter < −1.8 m/s along body forward, exit > +0.5 m/s.
- Drag/aim, camp focus and hood all keep `camYaw` synced so handbacks swing along an arc.
- Hairpin (0.8 rad/s yaw) trailing angle: old ~8°, new ~11°.

### Round 2 (owner, 2026-10-01: crashes fine; swing 4× snappier; more chassis lock)

- Crash calm = the RATE CAPS (unchanged 2.0 / 2.5 rad/s); chassis lock = the STIFFNESSES — separate
  knobs. Yaw 10 → 25 s⁻¹, aim 10 → 20 s⁻¹, and position error split in the heading frame: sideways
  20 s⁻¹, fore-aft/vertical stay 5 s⁻¹ (still trails under acceleration).
- Reverse/forward swing runs every limit ×4 (CHASE_SWING_BOOST) until camYaw lands: 180° in ~0.4 s
  (was ~1.6 s). Boost only while the truck is upright (up·Y > 0.8) and yaw rate < 1.5 rad/s; any
  non-calm frame cancels the swing for good, so a crash that slides backward stays on crash caps.
- Headless: slalom trailing 8.8° → 3.8°, hairpin 8.7° → 3.4°; tumble view rate still ≤ 2.5 rad/s.

### Round 3 (owner, 2026-10-01: "too much chassis lock" — tune back to the pre-FEAT-95 feel)

- Root cause of the over-lock: the stiff SIDEWAYS position spring. The old camera's world-space
  position lerp (5 s⁻¹) trails along the travelled path by ~v/5 m, which is what blends the view
  toward the velocity vector at speed and in slides. Restored the plain world-space lerp.
- Heading and aim are now PURE RATE LIMITERS (no springs): camYaw steps to the body heading by at
  most 2.0 rad/s × horiz², aim by at most 2.5 rad/s. The old camera had an instant heading and rigid
  aim, so this is the old camera wherever the caps don't bite.
- Headless feel diff vs HEAD (scratch harness: straight → turn-in at ~0.8 g → hold → exit, with
  suspension bob; 5/15/30 m/s × 0/20/40° slip): max ≤ 0.04 m / 0.3° (the one non-zero cell is
  5 m/s 40°, where the turn-in flick touches the 2 rad/s cap). Round-2 springs were 2–6° off,
  round-1 springs up to 14.5° off.
- Crash: tumble view rate ≤ 2.5 rad/s (old 120); tumble-while-sliding-back ≤ 2.6 (old 28).
  Swing still ~0.4 s.

## Acceptance

- [x] Owner drives it: crashes no longer nauseating (else → steady witness fallback).
- [x] Reversing swings the view to the front; driving forward swings it back.
- [x] Normal driving matches the pre-FEAT-95 chassis/velocity blend.
- [x] Crashes still calm with the rate-limiter-only design.

## Resolution (2026-10-01)

Owner signed off after round 3. Damped follow (pure rate limiters) was enough — the steady-witness /
crash-detect lock fallback was NOT needed and is not built.
