---
id: FEAT-141
type: feature
status: done
severity: major
opened: 2026-10-21
source: owner, 2026-10-21 — "When you start the mission every paper customer is deliverable to. The
  plotter finds the closest … to cover four customers and then allows the player that much time plus
  margin to deliver to any four customers." / "Bring back the bell, change the layout so you can deliver
  anywhere, and set the time based on the shortest route, which the GPS will also draw for you." / "use
  the terminology 'deadline' instead of 'bell'" / "end it at N"
relates: FEAT-61 (the paper route), FEAT-63 (paper re-plan), FEAT-39 (GPS assist), FEAT-113
  (deadlines), FEAT-138
requires: FEAT-138
design: design-amendments-2026-10-21-mission-recut.md §7
---

# FEAT-141: Papers — any N customers against a deadline from the shortest route

## Request

- **Every customer is deliverable.** The player serves any N of them. Per-tier customer placement
  (`tierRoadM` bands, `customersForTier`) retires.
- **The plotter** picks the N customers and the order with the shortest route from the start (a small
  travelling-salesman pick). The **deadline** = that route's par × 1.5.
- **The GPS draws that route.** The player may ignore it.
- **The route ends at the Nth delivery.** No delivering past N (a tight cluster would be an abusable
  daily payout).
- **Rank is time:** par stays the C/D line as on every type; the deadline is the end of D. S needs about
  0.73 × par to spare. Region time thresholds come from FEAT-138's table.
- **Pay keeps today's shape:** guaranteed base, the time tip, accuracy money banked per throw.
- **Unfinished at the deadline:** the round expires. Banked accuracy money stays; no fare, no letter,
  no ladder rung.
- **Ladder:** a finished round at **B or better** earns the next rung.
- **Route size is the player's choice** among unlocked sizes (4, 9, …).
- **No bonus item** on papers yet (Larry's reward pool is open).
- **"Bell" becomes "deadline"** in every string, comment and identifier.

## Notes

- `paper-route.js`: `planTour` / `planTourJob` (Held-Karp is capped at 15 stops; a k-subset pick over
  the eligible customers fits — measure it), `scoreRoute` (drop `parEff`, rank on the N-route par),
  `advancesTier`, end at N. Start point: the start ring. Eligible set: every stamped customer.
- `main.js` `_larryRoute` (size choice), the papers HUD (FEAT-139 shape), `DEADLINE_SLACK.papers`.
- `offer-board.js` papers card branch (~716) — sizes listed.
- **SM-INV-3:** the deadline shows as a clock time, never a countdown.
- **Reverses** for papers: "no time limits" (09-30), customers decided at placement (10-15), the
  perfect-round ladder (08-05).

## Acceptance

- [x] Any N of the customers count; the plotted N-route's par × 1.5 is the deadline.
- [x] The GPS draws the plotted route.
- [x] The round ends at N, or expires at the deadline as above.
- [x] Letters on time with C/D at par; pay = base + time tip + accuracy money.
- [x] Route size chosen from unlocked sizes; B or better advances the ladder.
- [x] No "bell" left in code or docs; `test/paper-route.mjs` updated.

## Resolution — 2026-11-01 (Spare)

- **The plotter** (`planTourJob`): candidates are every reachable customer (nearest by road, capped at
  Held-Karp's 15 — placement makes at most 15), and Held-Karp grows states only to N stops; the route is
  the cheapest state holding exactly N. Same table size as the old 15-stop order (~14 ms). Gate: the
  plotted 4-route is never beaten by any of 40 random 4-sets (`paper-tour.mjs`).
- **Any customer counts**: a landing scores against the nearest of ALL customers; the round ENDS at the
  Nth delivery (`run.n`). The GPS draws the plot, and its re-plan (FEAT-63) is now the shortest way
  through any of the still-owed customers for the deliveries still needed.
- **Deadline** = par × 1.5: `DEADLINE_SLACK.papers` 1.0 → 0.5 (the board's one rule, FEAT-113's
  expire path unchanged). Letter and fare on the plotted par (`scoreRoute`'s coverage-scaled parEff
  retired): par = C/D, deadline = end of D. Pay = base + time tip + accuracy money.
- **Ladder**: `advancesTier` = finished at B or better.
- **Size choice**: `PaperRouteSystem.sizes()` / `setSize()`; Larry's panel shows a route-size row
  (4 · 9 · …) when more than one is unlocked; the board card lists them ("to 4 or 9 customers").
- **"bell"**: gone from src/, data/, index.html and the paper gates; DESIGN.md's 2026-09-30 "no time
  limits" line is marked superseded for papers and the slack lists name papers +50 %. Struck/retired
  passages in missions.md keep the word as history, under its own "never bell" note.
- Gates: paper-route, paper-tour (any-N, exact-N end, plotter optimality), paper-reroute green; affected
  27/27; cdp-smoke 20/20 with a new `papers` step (unlock the 9, park at Larry's, sizes "4 9*", plots
  9 then 4, decline). Dev handle `window.__paper` (system + runPaper).

### Three calls made in implementation — owner to confirm or overrule

1. **The ladder moves only on the TOP unlocked size.** A B on a 4-house round when the 9 is unlocked does
   not unlock the 12 — otherwise the smallest round farms the whole ladder.
2. **Out of papers short of N ends the round**, settled like a passed deadline (banked accuracy stays;
   no fare, letter or rung; the board slot locks at the deadline as for an expired round). The
   alternative — driving on with an empty truck until the deadline — left nothing to do.
3. **Placement keeps its bands** (`tierRoadM`): houses still spread outward from Larry by rung, but the
   stamp no longer decides who is on a route. Retiring the bands outright would move every customer
   (a worldgen change) for no gameplay gain.
