---
id: BUG-134
type: bug
status: open
severity: minor
opened: 2026-11-07
source: owner, 2026-11-07 — bug131-keepout answer "(a) land, route length as a new ticket"
relates: BUG-131 (POI keep-out: its fix moves paper houses), FEAT-62 (paper-route scenario), src/paper-route.js tierRoadM
---

# BUG-134: nothing bounds the top paper route's length

## What happens

`test/paper-tour.mjs:178` checks that the top route stays inside the ~14 km driving budget, with 15.5 km as the
hard limit. Nothing in `src/paper-route.js` enforces it. The only lever is the outer customer band, `tierRoadM`'s
5 km of road distance from Larry. The route length is whatever the plotter's tour through those customers comes to.

- On main, 2 of 12 random seeds already go over, up to 18.4 km (BUG-131's census).
- BUG-131's fix moves some paper houses to other roads. On seed 6 that takes the top route 14.8 → 16.4 km, so the
  gate fails there.
- The owner chose to land BUG-131 anyway. Its landing turns the seed-6 15.5 km check into a measurement (it reports
  the length and doesn't fail on it), and this ticket owns the real bound.

## The owner's question

How should a top route be bounded? Options for the owner, measured before asking:

- (a) The plotter drops the farthest customer until the tour fits 15.5 km. The route gets shorter, and the
  customer count can fall below the tier's.
- (b) Customers are chosen by their tour cost, not their road distance from Larry. The count is kept, and the
  houses are nearer together.
- (c) 15.5 km stays a soft target: the pay and par scale with the length, and nothing is cut.

## Acceptance

- Top-route lengths measured on 20+ random seeds (main, then each option), as a table and a shot of the worst one.
- The owner picks, and the chosen bound holds on every seed measured.
- `test/paper-tour.mjs`'s check becomes a real failure again.

## Measured — the owner's sheet (Lane A, 2026-11-07, main with BUG-131)

**Sheet:** https://claude.ai/artifact/MCwApgG44T1rG9uE9FWnbG. It has the question, the three choices, the two worst
seeds' plan maps and every seed's row. Answer on the tracker page's BUG-134 item.

24 random seeds, each on the story region the game builds at its spawn. Tools: `wip/bug134/census.mjs`, `map.mjs`
and `gen-page.mjs` in the run-shape worktree (git-invisible). Nothing is built in `src/`: (a) and (b) exist only in
the measuring script.

| | over 15.5 km | worst | median | houses |
|---|---|---|---|---|
| today | **8 / 24** (5 / 24 before BUG-131) | 20.9 km | 14.3 km | 15 |
| (a) drop a house until it fits | 0 | 14.7 km | — | 13 or 14 on 8 seeds |
| (b) the top rung's last 3 houses by tour cost | 0 | 13.7 km | 10.9 km | 15 always |
| (c) soft target | = today | = today | = today | 15 |

- **(a)** re-plans with one fewer stop until the tour fits, so Held-Karp (the exact shortest-route search) picks which
  house to drop. 16 of 24 seeds are untouched.
- **(b)** picks the top rung's last 3 houses by cheapest insertion into the tour through the 12 below (Larry first),
  with the same 10 m spacing and the same 5 km band. The lower rungs are unchanged, so the ladder still nests.
  Most routes get shorter; one got longer (3219742435: 12.9 → 13.4 km).
- **(c)** is today's numbers. Pay and par already scale with the route: par is priced on the whole tour, and the
  tips are k × par.
- **In game time:** at par, today's top route takes **15–27 game hours** (a game hour is a real minute). A full night
  buys 16 hours awake. Under (b) it is 10–18.

**Recommended: (b).** It keeps the ladder's 15 and fits every seed with room to spare (worst 13.7 km against the
~14 km budget). Its cost is 3 moved houses per seed, and a smaller total pay that is about the same per hour.
