---
id: FEAT-139
type: feature
status: done
severity: minor
opened: 2026-10-21
source: owner, 2026-10-21 — "Whatever the strip is showing should also show what rank you have. For
  example: Haul, 12 pieces, A rank." / "just do a vertical combined acceleration bar that shows the
  threshold and instant destruction limits."
relates: FEAT-87 (the rank timer strip), FEAT-97 (fragile health), FEAT-113 (due time), FEAT-138
requires: FEAT-138
design: design-amendments-2026-10-21-mission-recut.md §9, §2b (freight, 2026-10-22)
---

# FEAT-139: The HUD strip shows each type's rank axis and the live letter

## Request

| Type | Strip | Live warning |
|---|---|---|
| Courier | unchanged: the FEAT-87 boundary bar + letter | the bar itself |
| Haul | `Haul · 12 aboard · A` | `lose 2 → B` |
| Freight | `Freight · 710 kg` — **no letter** (owner, 2026-10-22, §2b) | the due time (static while driving — freight can't lose cargo) |
| Fragile | a health bar + letter | **a vertical bar of the combined felt g** |
| Papers | `Papers · 3/4` + the FEAT-87 boundary bar + letter | the bar; the due time as a clock time |

**The combined-g bar.** One vertical bar of the magnitude of the felt g (the same scalar `fragile.js`
already computes — damage reads the magnitude, vertical included). Two marks on it: the cargo's
**damage threshold** and its **instant-destruction limit**. Landings are what light it up: hard paved
cornering peaks around 0.6 g, a 1 m crest lands at 4.6–4.8 g.

The health bar is for now. Later, damage should show on the cargo itself (texture, deformation).

**Freight shows no tier anywhere (owner, 2026-10-22, amendment §2b).** Freight is posted with a fixed
load, and its kg tier is internal: it only picks the bonus item. The job is binary, delivered or not.
So the strip shows the payload weight and the due time, nothing else. The FEAT-87 boundary bar goes
too: it draws time-letter bands that freight's letter never read (FEAT-138 already moved freight's
letter to kg). The result card shows no letter or tier for freight. It shows delivered, Base pay, Tip
and the item.

## Notes

- **Reverses** FEAT-96's "no number describing the cargo on the HUD" (10-10) and FEAT-97 / missions.md
  "no HUD number; the sound and the blink are the only readouts" (10-06). SM-INV-10 is about parts and
  is not touched.
- **SM-INV-3 holds:** no countdown digits anywhere. A deadline shows as a clock time. The FEAT-87 gate
  (`test/rank-timer.mjs`, no time string) stays green.
- `main.js` `_rankTimerSource` / `_updateRankTimer` / `_updateJobDue`, `#job-stack` in index.html. Haul
  aboard count per frame from `_haulAboard`.
- Follow UI-STYLE.md (System family, the token palette, the 12 px floor).

## Acceptance

- [x] Every type's strip shows its rank axis, per the table. Courier and papers also show the live letter; haul, freight and fragile show none (§2b, §9b).
- [x] Freight: the strip shows `Freight · <kg>` and the due time, with no letter and no FEAT-87 bar
      (`_rankTimerSource` returns none for freight).
- [x] Freight result card shows no letter or tier (main.js onSettle still sets `result.letter` from
      `amountGrade` for freight; it stays internal for the bonus and the deed — owner, 2026-10-22, §2b answer 1).
- [x] ~~Haul shows how many more lost pieces drop a letter.~~ Superseded 2026-10-23: no letter on haul; the line names the item's count (addendum).
- [x] Fragile shows ~~the health bar~~ the condition line and the combined-g bar with both marks, at the cargo's own values (amendment §9b).
- [x] No countdown digits; `test/rank-timer.mjs` green.

## Addendum 2026-10-23 — haul row BUILT, in the owner's new form (with FEAT-114)

Owner: "keep only the [run readout] in the top bar. Below the top bar put 'carrying xx bundles / xx
for the item reward'." This **supersedes the table's haul row**, `Haul · 12 aboard · A` / `lose 2 → B`.
Haul shows no letter (the letter only decides the item), so there is no "lost pieces drop a letter"
warning either. Built: `#job-haul` in `#job-stack` (index.html), written by `_syncHaulLine` in main.js
at the 10 Hz panel poll from `_haulAboard()`. A haul with no bonus shows only "carrying N bundles". The
haul acceptance line is met in this form. Freight, fragile and papers rows are still open.

## Addendum 2026-10-23 — freight BUILT; papers already met

- **Freight:** `_rankTimerSource` returns no bar when the job has `cargoKg`, the same as fragile and haul.
  `test/rank-timer.mjs` pins this. The load line `#job-cargo` (renamed from `#job-haul`, written by
  `_syncCargoLine`) reads "carrying 710 kg". It is static, because the load is strapped. The due line
  sits above it. The result card was already unlettered for freight (onSettle `lettered`). Time still
  pays freight's tip (`FREIGHT_TIP_MULT`); the bar is gone by the §2b ruling regardless.
- **Papers needed no change.** The top bar already reads "3 / 4 delivered   12 papers", with the FEAT-87
  bar and letter under it, and the due time as a clock time.
- **Open: fragile only.** That is the health bar and the combined-g bar. Decide first whether fragile
  keeps its letter, given the haul ruling that the letter matters only for the item.

## Addendum 2026-10-23 — fragile BUILT (owner: "fragile can drop the letter")

- **No letter anywhere.** The card prints "arrives 83%+ intact" (`gateLine` 'fragile'), and the result card
  is unlettered. The letter stays internal for the item and the deeds.
- **The HUD.** `#job-cargo` reads "condition 92% / 83% for the item reward", with the condition floored.
  Under it, `#job-g` is a 12 × 90 px vertical bar of the felt g, scaled to 1.2 × the cargo's break g.
  It has an amber mark at its damage floor and a red one at its break. The fill holds the
  fixed-step peak and falls with a 0.4 s time constant, so a one-step landing spike stays visible. The
  fill turns amber above the floor and red at the break. It is written per frame by
  `_updateFragileG` (`JG_FALL_S`, `JG_TOP` are the knobs).
- **The floors are whole percents:** 90 / 83 / 77 / 70, moved from `par.js` `FRAGILE_THRESHOLDS` (deleted)
  to `economy.js` `RANK_TABLE.fragile`.
- **Not verified in-browser.** The smoke harness can't seat the truck on a fragile giver's pad, so it
  needs an owner drive. All acceptance lines are now met. Close the ticket after that drive.

**Second pass, same day (owner):** the g bar is labelled **DAMAGE**. Its lower mark moved from the damage
floor to where one hit costs **1%** (fragile.js shockCost: a tenth of the way from floor to break), so the
label is true; the upper mark is **100%**. A **HEALTH** bar sits to its right, full green to empty red
(`color-mix` in oklch between `--money` and `--bad`), with the floored percent under it. The fragile
condition line is gone from `#job-cargo`. A posted reward shows right of HEALTH as "Reward [icon] if
health ≥ 83%", using the `assets/items/<id>.png` thumbnail. When the bonus is missed, the result card
says "needed 83%+ condition".

**Due line (owner, 2026-10-23):** "Due:" became **"Due in: 2h 05m"**, a countdown to the deadline
(`formatGameDuration(dueH − now)` in `_updateJobDue`). SM-INV-3 is amended in DESIGN.md. The acceptance
line "No countdown digits" now means no countdown to *par*: the FEAT-87 bar still shows no digits, and
`test/rank-timer.mjs` stays green.

**From accept (owner, 2026-10-23):** the fragile bars show from accept, through staging inside the start
ring, not only once the clock runs (`_updateFragileG` gates on `isOnJob()`). Damage already counted from
accept: the load is strapped in at accept and `_fragileStep` has no state gate. Only the overlay waited.

**Tiers and lines (owner, 2026-10-23, amendment §9c):** the tiers are named Very fragile / Fragile / Sturdy
everywhere (data/offers.js `tier` + `tierName`). The card's terms row names the tier. Each tier has its
own health-line row (`RANK_TABLE.fragile`, read through `fragileLines(region, tier, km)`), eased by
`fragileLinePerKm` per km of the planned route. The card, the HUD reward text, the result card and the
settle letter all read it. The card clocks now ride their own `times` row.

## Resolution 2026-10-24

Closed after the owner's fragile drive on :3554 (owner: "commit"). All five rows are built. Still owed
the owner's sign-off, as PROVISIONAL knobs in `economy.js`: the Very fragile row 80/72/64/56, the Sturdy
row 95/90/85/80, and `fragileLinePerKm` 0.02.
