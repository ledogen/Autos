---
id: FEAT-201
type: feature
status: done
severity: minor
opened: 2026-11-12
source: owner, 2026-11-12 inbox — "I've noticed that sometimes in a new game you spawn with both rear tires as old tires and it Makes the car pretty squirrely. I think an elegant solution to this is On every new game, let's just make sure the player only gets one old tire and it's in the front This way the car still drives quite well But you do have some debt to take care of at some point Let's also I guarantee the player spawns with a spare tire and it's an old used tire"
relates: [FEAT-168]
---
lane: B

# New game: exactly one old tire, on a front corner, plus an old spare

## What

Every new game: three good tires, one old tire on a front corner, and one old used tire in the inventory as
the spare. Never an old tire on the rear axle at the start.

## Acceptance

- [x] Over 50 new games on random seeds: one old tire, always front; an old spare present every time.
- [x] The run-start gate asserts it.

## Resolution (2026-11-13, Lane B)

Root: `src/jalopy.js` rollJalopy, the one roll every story start runs (main.js onRegionLive — the career run, the
played tutorial and the paper-route scenario all start there, so all three get it; a resume overwrites it with the
save). The per-corner standard/old draw (50/35) is gone: three stock tires, one `tireOld` on FL or FR drawn evenly
(`JALOPY_OLD_TIRE`), and the spare is granted every run (was 60 %) as a mounted `tireOld` on the steel wheel, wear
0.4–0.8 (`JALOPY_SPARE`). All four tires still roll wear 0.4–0.8 on their track (JALOPY_COND.tire) — "good" means
the stock tire, not a new one. The inventory line reads "Old tire NN% · wheel 100%". Gate `test/jalopy.mjs` §3/§4
re-cut and §6 added: 50 new games on `Math.random` seeds, exactly one old tire, always front, an old spare every time.
