---
id: FEAT-87
type: feature
status: completed
closed: 2026-10-01
severity: major
opened: 2026-09-25
source: owner, FEAT-67 planning pass 2026-09-25 — split out of FEAT-67 (was its Phase C)
relates: FEAT-67 (bonus gates this makes visible), FEAT-53 (rank thresholds), SM-1 sleepiness bar
        (the visual precedent)
invariants: SM-INV-3, SM-INV-4
amends: design-amendments-2026-08-17.md §3 — "glanceable and peripheral" relaxed near boundaries
---

# FEAT-87: Live rank timer — a scrolling bar that makes you sweat the S line

## Request

During a mission, a **scrolling bar** in the style of the sleepiness indicator. The run starts in **S**;
the bar shows each threshold ahead — S→A, A→B, B→C, C→D — scrolling toward the marker as time passes.

It should be **dramatic and somewhat flashy**. The player should sweat as the S→A line approaches when
they are chasing an S-only bonus, and there is a **clear visual moment exactly when that bonus is
lost** (the offer's gate rank lapses). Same pressure, heavier, at the **C→D** line: D is "you were slow"
and earns no bonus.

## Rulings (2026-10-01, on first build)

- **Not on screen until it matters.** The bar first pops up **15 s** before the S→A line (first
  cut 30 s, re-ruled the same day) and stays to the end of the job. The player only gets useful
  data from it when the mission is almost over, so before that it is absent, not merely calm.
- **Top-centre**, popping up where the mission readout sits ("leave the green circle to start"),
  not with the wallet.
- **The targets get the bar.** A–D must hold at least half the visible bar — "S reads as huge and
  A>B>… seem like tiny targets to hit". Met with geometry, not a non-linear axis: 6 px/s, a 40 s
  view, the pointer an eighth of the way across, so at the pop S is exactly half and the 7-second
  A/B bands are 43 px targets.
- **A `RANK:` readout** — the current letter, big, pulsing as a line nears; **when you cross one
  the old letter breaks and falls** ("something dramatic"). Second pass the same day: the shards
  fall **clean off the card**; the shake is **simple** — slow and mild leading into fast, topping
  out at **120 bpm** (2 Hz — the owner's "120Hz" was bpm; a frame-rate flip was built and removed); **no tick marks** on the strip (they
  don't line up with the transitions and distract from the moment); "RANK" indented; a general
  cosmetic pass ("juice it up a bit" — no design guide exists, so: hierarchy, gloss, inset,
  overshoot/squash easings, bright edges on the transitions only).

## Rulings (2026-09-25)

- **Calm → flashy near the edge.** The bar sits quiet and peripheral for most of the drive and
  escalates (pulse, colour shift, shake — to be designed) only as a boundary approaches. This relaxes
  the 2026-08-17 "glanceable and peripheral" constraint *near boundaries only*.
- **D is visual pressure, not a cliff.** The payout curve is unchanged (SM-INV-4): continuous, reaching
  $0 at ratio 1.15 (`payoutZero`). D never earns a bonus item.
- **The accepted offer's bonus gate is marked on the bar**, and crossing it is the "reward lost" beat.

## Constraints that still bind

- **Boundary proximity, never a running countdown** — no `3:41 remaining` string (SM-INV-3). A bar
  with marked thresholds is the intended form.
- ~~Site with the run HUD (`#run-hud`)~~ — **re-ruled 2026-10-01: top-centre, directly under the
  mission readout (where "leave the green circle to start" sits)**; still never over the road.
- Thresholds are the ones **frozen at accept** (FEAT-53), in rank colours
  (`RANK_COLOR`: D·C·B·A·S = red·orange·yellow·white·blue).

## Acceptance

- [x] Bar starts in S and scrolls the S/A/B/C/D thresholds past a fixed marker using the accepted
      offer's frozen thresholds
- [x] The accepted offer's bonus gate is visibly marked; crossing it plays a distinct "bonus lost" beat
- [x] Escalation (visual intensity) ramps only near an upcoming boundary; calm otherwise
- [x] No text countdown is ever rendered
- [x] Payout stays continuous — the bar is display only

## Resolution (2026-10-01)

Shipped. `src/rank-timer.js` (pure: band line-up from the FROZEN thresholds × par, the gate →
line mapping, the per-frame escalation + crossing read) and the DOM ticker in `main.js`
(`_updateRankTimer`, per frame, styled after the Energy meter) with its CSS/markup in
`index.html` (`#rank-timer`, top-centre under the mission readout). Gate: `test/rank-timer.mjs`.

- **Appears** 15 s before the S/A line (`appearS`, pure `shown` flag) with a pop-in, top-centre
  under `#mission-hud`, and stays to the end of the job.
- **Readout**: a small dim indented `RANK` label, then the letter at 26 px in its rank colour
  with a colour bar under it. It pulses (scale + glow) on the escalation's one oscillator. On a
  crossing the old letter is cloned twice, each clone clipped to one side of a jagged crack; the
  halves hang 80 ms then tumble ~140 px, clean off the card, while the new letter slams in from
  2.6× with a squash on impact and a white flash (`_rtBreakLetter`; shards self-remove on
  `animationend`).
- **Shake**: ONE deterministic oscillator (no randomness). Frequency 0.8 → 2 Hz (48 → 120 bpm)
  with intensity², amplitude 0.6 → 5 px linearly (× 0.5 on a light line), phase integrated per
  frame so the ramp is continuous. Box shake, letter scale and both glows ride that one signal.
  Gated: no `Math.random` in the driver; max 2 Hz.
- **Strip cosmetics**: no ticks (gated); each band has a top-lit gloss and a bright 2 px right
  edge — the transition itself is the only line; the view is inset with an inner shadow; the
  pointer is a lit hairline with carets top and bottom; band letters hide while a beat word is up.
- **Strip**: S·A·B·C·D in `RANK_COLOR`, 6 px per second of the mission clock, 240 px view (40 s,
  35 s of it ahead), scrolled under a fixed pointer an eighth of the way across. At the pop the
  S band is exactly half the view and A–D the other half (gated); A/B are 43 px. Ten-second
  ticks ride the strip as rhythm, not number. Wide bands (S, D) carry their letter at the left
  edge so the D rides the red edge in; thin bands are centred. The title names the band under the
  pointer in its colour — the letters are the only text on the surface.
- **Letter parity**: the band is picked by ratio with `gradeRun`'s own `<=` arithmetic, so the
  bar and the result card cannot disagree, even on the line.
- **Gate**: the offer's bonus gate is a gold line + caret at the end of that letter's band
  (S→S/A … C→C/D; none without a bonus). Crossing it plays the **"bonus lost"** beat (white→red
  flash with the word, a jolt, the marker goes grey). The C/D line plays **"too slow"** the same
  way. Both fire once, on the crossing frame.
- **Escalation**: exactly calm (no inline style) further than 10 s from the next line; inside it
  the border and glow take the colour of the band about to be lost and the oscillator above runs
  everything. The gate and the C/D line are heavy (full weight); S/A, A/B lines you were not
  banking on are half.
- **No digits**: the gate asserts the driver never calls `formatTime` or writes a time string.
  Payout untouched (SM-INV-4) — display only.
- **Sources**: POI/Quick jobs (countdown · staging · running) and the paper round (staging ·
  running, full-coverage bands, no gate — rounds carry no bonus item).

Verified headless (gate) and visually via a scratch page built from the shipped CSS + driver at
seven points along a run (calm · hot at S/A · bonus lost · hot at C/D · too slow · in D · long par).
