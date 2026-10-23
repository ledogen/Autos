# HANDOFF — the game-feel review branch (2026-10-23)

```
Worktree: /Users/ledogen/CodeShit/CarGame-game-feel
Branch:   feature/game-feel   (off feature/mission-recut @ 5415f362 + its uncommitted fragile work, snapshotted as 1eb6dff3)
Serve:    http://localhost:3776
State:    all review changes committed (see git log); nothing half-done
Review:   the keep/cut page — see "Review page" below
```

**Work ONLY in this worktree.** The next session starts anchored in the main repo, so every edit and
command must target the path above.

## What this branch is

The owner asked for a holistic game-design read of the mission loop on top of the mission re-cut
(courier / haul / freight / fragile / papers; grades, gates, item rewards, cards, overlays), aimed at
the **alpha** (one region, a player's first two or three runs), with the brief: unify the feel, make
the goal clear, make what a job asks for clear, dangle the reward, and pay off the finish. Everything
below was built so the owner can accept or reject each item on its own. The review was done by
reading the design docs and code, then driving jobs over CDP against this worktree (teleport-settled,
so the drives prove the cards and settlement, not the par feel).

## The thesis

A job promises three things — **pay, an item, a deed** — and the recut had made two of them invisible
or inconsistent. Pay quoted only its base; the tip was a surprise. The item sat on a quarter of the
offers at half pay, a trade the player couldn't value. The deed (progress toward the camp) rode an
internal letter the owner had just ruled off the cards, so on haul, freight and fragile a player
finished a job and got "+0.5 good deed", or nothing, with no rule they could have read. And the goal
those deeds buy — six, then the expedition camp — appeared nowhere in the run. So: every card now
states the same three promise lines, the result card answers the same three, the HUD counts toward
the gate, and an opening card says what the gate is.

## Changes made (R-NN tags are in the code comments)

| # | Change | Why | Files |
|---|---|---|---|
| R-01 | **Start cash $10, "the last paycheck"** (`startCash`) | A $0 wallet plus bought haul stock made the always-on yard the first disabled button a new player meets. opening.md already proposed the paycheck. | economy.js, dialogue.js, test/economy.mjs |
| R-02 | **Goal readout**: HUD "2 / 6 good deeds"; result card "+1 good deed · 3 / 6" (`campDeeds` = 6, the FEAT-103 gate) | The carrot was never dangled; "no good deeds" named a currency with no stated use. FEAT-103 reads the same constant when the camp lands. | economy.js, main.js |
| R-03 | **Pay range on every card**: "Pay $3.63 base · up to $7.27 fast"; haul "$0.25 – $0.51 a bundle"; Larry too (`payRange`) | Reverses the 09-30 base-only quote; restores the 08-17 range. A tip you can see is a tip you can plan toward. | economy.js, offer-board.js, main.js |
| R-04 | **The item IS the tip.** A bonus offer pays the full base and no cash tip; the card's form reads "TIP · INSTEAD OF CASH: Coffee ($3) — C or better"; the result card's Tip row is the item. `BONUS_PAY_MULT` retired. | Half-pay-for-an-item was a trade with no visible value; one slot with two currencies makes the trade exact and the base always guaranteed. | economy.js settle, offers.js, offer-board.js, main.js, map2d.js, tests |
| R-05 | **Care premium on fragile tiers** ×1.3 / ×1.15 / ×1.0 (`careMult`, PROVISIONAL) | Fragile paid exactly what a courier note paid over the same road while being slower and risking half the base: a dominated type is dead content. FEAT-142's Collector/Easygoing multiply on top. | offers.js, offer-board.js |
| R-06 | **Haul stock floor 12 → 14** (= the C count) | A 12–13 stock posted a job that could never earn a deed, unstated. S stays 25. | offers.js |
| R-07 | **Reward value on the card** "($20)" (`REWARD_VALUE` + part/shelf prices) | A carrot with no number can't be weighed against the tip it replaces. A price, never a stat. | offers.js, offer-board.js |
| R-08 | **COURIER, not DELIVERY** on the card header (`FAMILY_LABEL`; code key unchanged) | All four bed/cab types are deliveries; FEAT-89's name was never surfaced. | map-icons.js, map2d.js |
| R-09 | **Good-deed line on every card** ("deliver 18+ bundles · half at 14+", "arrives 77%+ intact · half at 70%+", "B or better · half at C", freight by posted kg) and **"no good deed (needed 18+ bundles)"** on the result | The deed rode an internal letter; now the number is stated up front like the item's. | offer-board.js `deedLine`, main.js `_missionDeedNeed`, `_payRows`, map2d.js |
| R-10 | **Clock wording**: "posted 10h more · 4h 22m to deliver" (was "expires in · deliver within") | Two clocks in one grammar read as one deadline twice. | offer-board.js, main.js, tests |
| R-11 | **Run intro: three Uncle Larry cards** at story-live (`RUN_INTRO`, once per run) | Until FEAT-147, nothing told the player what the run is for. Says: six deeds → the camp; a deed is a B, a C is half; base + tip, or an item instead. | dialogue.js, main.js |
| R-12 | **Quick Job hidden in story** unless the debug panel is open | A dev rig in the corner of every run. | main.js |
| R-13 | **Calibration form hidden in story** unless the debug panel is open | The questionnaire buried the payoff on every result card. Free roam / Quick Job unchanged. | main.js |
| R-14 | **Haul picker states the net**: "23 bundles · stock $2.99 · nets $2.84 base, $8.66 fast", plus "half a good deed / no good deed at this count" | The player was left to subtract the stock from the base. | main.js |
| R-15 | **Start-circle explainer only on the first two jobs** | Tutorial text on every card forever. | main.js |
| R-16 | **Bug**: Larry's panel printed "expires in Infinityd NaNh" | `formatGameDuration(Infinity)` on a never-expiring offer. | main.js |
| — | `window.__mission` dev handle (the live MissionSystem) for CDP drive scripts | Tooling, same precedent as `__map2d`. | main.js |

Gates: `npm test` (25 affected) green; economy / offer-board / fragile-cargo / haul-load /
load-verdict / rank-timer run by hand, green. The two known reds (road-tunnel, road-clearance) are
pre-existing on main.

## Recommended, not changed (N-NN)

| # | Recommendation |
|---|---|
| N-01 | `FREIGHT_TIP_MULT` 0.5: freight is now dominated per minute by courier (par already stretches with kg, then the tip is halved). Consider 0.75–1.0. A number; the owner's call. |
| N-02 | Light freight (< 285 kg) earns no deed — now stated on the card. The heavy-load roster the owner planned (cargo.md 10-22) is the real fix; until then the card's "No good deed" line is doing the honest thing. |
| N-03 | Letters on courier/papers but not haul/freight/fragile. With the three promise lines the inconsistency is tolerable; the cleaner alternative is no letter on ANY result card and the live rank bar as courier's own flavour. |
| N-04 | FEAT-131 juice: stage the reveal in the promise order — base, then tip (cash count-up or the item), then the deed tally ticking toward 6. |
| N-05 | FEAT-103 must land for "6 / 6" and the intro's camp to be true. The HUD and the intro reference it now; the alpha can't ship with the promise and no camp. |
| N-06 | Residence/farm pads: a truck teleported onto one tumbles off the hillside (seed 6). Possibly the harness, but worth checking POI x/z vs the pad. |
| N-07 | The debug stats overlay (SPIN/SLIP/FPS, top-left) shows in story in the dev build; confirm it's off in the alpha build. |
| N-08 | A total-loss haul result reads "$0.00 / $0.00 / Stock bought −$2.99" with no cause; one line ("the load spilled") would land the lesson. |
| N-09 | "[flavor line]" placeholder on every panel: author the lines or hide the quote until written (alpha: no stubs). |
| N-10 | Day cost is invisible; a "today's costs ≈ $7.50" line would make the organizing-problem arithmetic legible. Waits on FEAT-69's repair pricing. |

## Review page

The owner's keep/cut page (one row per change, verdict toggles that persist):
https://claude.ai/artifact/YHLoevQnoJ1y5BYmksVVVZ

Verdicts land in the page's store (collection `verdicts`, doc id = the row's tag). Read them back
with `ArtifactData list verdicts` on that URL.

## How to re-drive the proof

`/private/tmp/claude-501/.../scratchpad/play.mjs` (session scratchpad; not in the repo) boots this
worktree on :3776, enters story seed 6, dismisses the intro, hover-cards the map, parks at a giver of
each family, accepts, drives out of the ring, teleports onto the route 40 m short of the drop and
rolls in. Fragile could not be driven that way (residence pads) — owner drive owed.
