---
id: FEAT-131
type: feature
status: open
severity: minor
opened: 2026-10-19
source: owner, 2026-10-19 — "need more juice in the post mission screen and bg music for the rank timer to build suspense"
relates: FEAT-87 (live rank timer — shipped; heartbeat + glass break), FEAT-120 (§ Payout coin and grade stingers — todo)
---

# FEAT-131: Post-mission screen juice + rank-timer suspense music

## Request
The post-mission (results) screen feels flat. Add juice to the reveal, and a background music bed
under the live rank timer that builds suspense as the run approaches/passes each grade threshold.

## Acceptance
- [ ] Rank timer has a music bed (synthesized, like the rest of `src/*-audio.js`) whose tension
      rises toward the next grade cutoff; drops/resolves when a grade is lost or the job ends.
- [ ] Results screen reveal is staged (count-ups, timed stingers per grade) — fold in FEAT-120's
      "Payout coin and grade stingers" item rather than duplicating it.
- [ ] Owner play-test sign-off on feel.

## Measured (Spare, 2026-11-01) — what is on main today

**During the drive (FEAT-87, `src/rank-timer.js`; rulings R-22, Q-6):**
- The rank bar is absent until it matters:
  - courier: once inside the last 25 % of the route, never under 400 m (R-22);
  - paper rounds: 15 s before the S/A line.
- Before the bar shows, the promise overlay prints "finish in x:xx or better for S rank" (Q-6). It is
  one box (R-29).
- `intensity` stays at 0 through the quiet middle of a band, and ramps 0 → 1 over the last 10 s
  before the next line.
- One oscillator drives both the glow and the heartbeat kick (`heartbeat-audio.js`, lub-dub), at
  48 → 140 bpm.
- Crossing the offer's gate is the "bonus lost" beat: the rank tile breaks (`glass-audio.js`, a
  tempered side window).
- The C/D line fires a `slow` moment, then the bar goes calm and closes.
- **There is no music anywhere in the game.** Player music is FEAT-58 (Lane C).

**The result card (main.js `_payRows` / `_revealResult`, N-04 — the first slice of this ticket,
owner 10-24 "yes pls build it"):**
- One box, retry · continue (R-31), no result letter, deeds as numerals in the story blue (R-02 /
  R-21).
- The rows land 0.45 s apart in promise order: what was delivered → base pay → tip → deed → extras.
- The speed tip counts up over 0.7 s with an ease-out, so the cents settle.
- The deed tally flips old → new 0.5 s after its row lands (`mp-tick`).
- **The card makes no sound at all.** FEAT-120's "payout coin and grade stingers" item is still `todo`
  (coin = two quick sine pings ≈ 2.6 / 3.9 kHz; stingers rising with the grade).

## Proposal — juice with no new words (phased, with costs)

Every phase keeps the review's rulings: one box, numerals, no letter, no "back to free roam", and no
new copy. The juice is motion, timing and sound only.

**Phase 1 — sound the reveal that already exists.** ~1 new file, about 120 lines.
- New `src/result-audio.js`, synthesized like its siblings:
  - a **coin** ping as each money row lands, and a soft tick train while the tip counts up (throttled
    to about 12 a second, falling in level as it settles);
  - a wood **clack** when the deed tally flips;
  - a dull **thud** for a miss ("no deed", a missed item).
- **One grade stinger** after the last row, rising in pitch and length D → S. It is sound only, so the
  card still shows no letter; the grade is heard, never printed.
- This closes FEAT-120's coin + stingers item instead of duplicating it. Each sound gets its Sounds-tab
  card (the FEAT-120 body).
- No gate (audio has none). The dashboard's ▶ plays it.

**Phase 2 — motion on the same rows.** CSS + a few classes, about 40 lines, UI-STYLE tokens only.
- Rows slide up 6 px and settle (instead of a bare fade).
- The count-up's length scales with the amount: 0.5–1.4 s, so a big tip takes visibly longer.
- The deed numeral pops (scale 1.15 → 1) in the story blue.
- The box's border warms on a full deed and stays neutral on a miss.
- A missed item's line nudges once, sideways.

**Phase 3 — the rank timer's music bed.** About 200 lines (`src/rank-music.js`) + 4 hooks in main.js.
- It starts when the bar shows (the same moment the bar decides it matters) and rides the
  `intensity` already computed:
  - a low synthesized pad whose filter opens with intensity;
  - an arpeggio whose rate locks to the heartbeat's own oscillator, so the music and the kick never
    drift apart.
- When a line passes, the pad steps up a semitone (one band down = one step of tension).
- On `lost` it drops: filter shut and pitch falling over 0.4 s, under the glass break.
- On `slow` it thins to the heartbeat alone.
- At the job's end it resolves into a chord that hands straight to the Phase 1 stinger.
- **A music bus with one `duck(k)` hook**, so Lane C's player music (FEAT-58) dips under the bed
  rather than fighting it. The bed is the only music this ticket adds.

**Phase 4 — owner play-test sign-off** (the ticket's last acceptance line).

**Cost order:** P1 < P2 < P3. P1 and P2 are independent and each reviewable alone. P3 is the only one
that touches the drive.

**Owner answers needed:**
1. Is a grade stinger OK, given the no-letter ruling? It is sound only, so the grade is heard,
   never printed.
2. Does the music bed start with the bar (proposed) or from accept, quieter?
3. Is the bed this ticket's (synthesized, Spare) or Lane C's alongside FEAT-58? The `duck` hook works
   either way.
4. Which phase first? Proposed: P1, then P2, then P3.
