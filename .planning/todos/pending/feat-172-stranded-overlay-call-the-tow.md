---
id: FEAT-172
type: feature
status: open
severity: minor
opened: 2026-11-06
source: owner, 2026-11-06, answering feat162-front-drag on the tracker page (relayed verbatim by the orchestrator)
relates: FEAT-162 (P2's stranded predicate and the "You broke down." card it reuses), FEAT-160 (the cause line), FEAT-146 (the run end), UI-STYLE.md
---
lane: B — queued after FEAT-162 lands

# FEAT-172: A stranded truck says so, and suggests the tow

## The owner's words, verbatim

> Create a new ticket for a stranded detector text overlay that appears and suggests that you should call tow
> truck. If a player gives up when the truck is detected as stranded then the game over text automatically
> becomes "You broke down".

## What exists (FEAT-162 P2)

- `recoveryCard(st)` (`src/recovery.js`) already detects stranded: `why` lists what strands the truck (`'dry'`,
  `'seized'`, `'wheel'`, `'rolled'`; empty = it can go on), `stuck = why.length > 0`, and `cure` is the cheapest
  set of options that cures every `why`.
- `_checkStranded` (`src/main.js`, 10 Hz poll) ends the run as `'broke'` ("You broke down.") when the truck is
  stuck, still for `STRANDED_REST_S` 3 s, and the wallet can't cover `cure`.
- The towel (pause menu "end run", `_endRun('towel')`) always reads "You gave up.".

So the gap is the stuck truck the player CAN still pay to recover: nothing tells them they're stranded or that
the tow is the way out.

## Build

1. **The overlay.** Shown while `stuck` and the truck is at rest (the same still test as `_checkStranded`) and no
   screen is open. Story family (UI-STYLE.md), one or two lines: what strands it (FEAT-160's cause words, e.g.
   "the engine seized") and the suggestion to call the tow, naming the Recovery card's key/button glyph
   (keycap, so it reads for the pad too). Wording `[DEFAULT]`, the owner's to change. It hides the moment the
   truck is no longer stuck (cured, or moving again). It never shows when `canEnd` (the run is ending anyway).
2. **The towel while stranded.** `_endRun('towel')` with `recoveryCard(...).stuck` true becomes `'broke'`:
   the card reads "You broke down." with FEAT-160's cause line. Watch the wording: the auto-end's line reads "the
   tow was $X, you had $Y" with Y < X; given up, the wallet may cover it, so that half must not read as a shortfall.

## Acceptance

- [ ] Stuck + affordable cure + at rest → the overlay shows the cause and points at the tow; it goes away when the
      truck is cured or rolls on.
- [ ] Not stuck (a flat with a spare, a dry tank with a can, on the roof with a hi-lift) → no overlay.
- [ ] Giving up while stuck → "You broke down."; giving up while not stuck → "You gave up.".
- [ ] Pinned headlessly where it can be (the predicate → title mapping); the cdp-smoke's broke-down step covers
      the overlay and the towel-while-stuck title.

## Work log

**2026-11-06, Lane B — built on feature/machine (659e4abc, 650abe4d), not landed** (it builds on FEAT-162 P2;
FEAT-162 landed a3b82204).

- **The hint** (`#stranded-hint`, index.html, in the toast family a line below `#machine-word`; main.js
  `_checkStranded`, the 10 Hz poll). Shown while `recoveryCard().stuck && !canEnd`, the truck still (< 0.5 m/s), no
  screen open, the Recovery chip on show (so never inside a POI's ring, where X does nothing) and its card shut.
  Words `[DEFAULT]`, PLACEHOLDER: "out of fuel — park, then X to call a tow" (parked: "out of fuel — X to call a tow").
  X is a keycap, so the pad reads its B glyph.
- **The towel while stuck** (`tc-end`): `recoveryCard().stuck` → `_endRun('broke')`, "You broke down.". Stuck
  needs no rest here: a seized engine still rolling is broken down too. FEAT-160's line keeps the shortfall wording when
  the wallet is short ("the tow was $12.12, you had $10.00", a fresh run) and reads ", and you gave up" when it covered
  the cure.
- **Pinned** in cdp-smoke `endings`: a dry truck with $1000 shows the hint, and it hides under the open Recovery card;
  a seized engine with $1000, given up → "You broke down." / "the engine seized — the tow was $12.12, and you gave up".
  `SMOKE_STEPS=boot,story,endings`: PASS, zero console errors. The not-stuck towel ("You gave up.") was already pinned.
- Owed: the 9 affected node gates (held for the orchestrator's landing smokes); the owner's words for the hint.
