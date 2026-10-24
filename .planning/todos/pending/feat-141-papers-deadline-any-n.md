---
id: FEAT-141
type: feature
status: open
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

- [ ] Any N of the customers count; the plotted N-route's par × 1.5 is the deadline.
- [ ] The GPS draws the plotted route.
- [ ] The round ends at N, or expires at the deadline as above.
- [ ] Letters on time with C/D at par; pay = base + time tip + accuracy money.
- [ ] Route size chosen from unlocked sizes; B or better advances the ladder.
- [ ] No "bell" left in code or docs; `test/paper-route.mjs` updated.
