---
id: FEAT-87
type: feature
status: open
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
- Site with the run HUD (`#run-hud`), never over the road.
- Thresholds are the ones **frozen at accept** (FEAT-53), in rank colours
  (`RANK_COLOR`: D·C·B·A·S = red·orange·yellow·white·blue).

## Acceptance

- [ ] Bar starts in S and scrolls the S/A/B/C/D thresholds past a fixed marker using the accepted
      offer's frozen thresholds
- [ ] The accepted offer's bonus gate is visibly marked; crossing it plays a distinct "bonus lost" beat
- [ ] Escalation (visual intensity) ramps only near an upcoming boundary; calm otherwise
- [ ] No text countdown is ever rendered
- [ ] Payout stays continuous — the bar is display only
