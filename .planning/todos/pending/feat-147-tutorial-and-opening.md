---
id: FEAT-147
type: feature
status: open
severity: major
opened: 2026-10-23
source: owner, 2026-10-22 — "need to finish tutorial and basic story"; 2026-10-23 — the basic story (the firing, the uncle, the expedition camp ending) is "good enough for alpha"
relates: opening.md (the firing, the uncle), FEAT-146 (the run end), FEAT-103 (the camp — the story's end), FEAT-67 (offer board), FEAT-104 (shop), FEAT-118 (camp pause), FEAT-50 (fuel), design-amendments-2026-10-23-release-cuts.md
---

# FEAT-147: Tutorial and the opening — fired, the uncle, the first day

**Alpha.** A new player today lands in story mode with no reason to drive and nothing telling them
how the loop works. The alpha's story is three beats, and this ticket builds the first two:

1. **The firing** (opening.md "The firing"): the run opens on the player losing the burger-joint
   job. Short, authored, then over — they can never work there again.
2. **The uncle** (opening.md "The uncle"): he hands over the first job. He is the tutorial's voice.
3. **The expedition camp** (FEAT-103) ends the run. Not this ticket.

## What the first day teaches

Taught by the uncle's jobs as they happen, not by a manual up front. Each item appears once, when
the player first needs it:

- [ ] reading the map and the offer board, and taking a job;
- [ ] driving it to the drop and reading the result card (par, rank, pay);
- [ ] fuel — the gauge and the pump;
- [ ] the shop and the service screen — what repairs cost;
- [ ] sleep — finding ground, making camp, and why the day is the budget;
- [ ] the goal — good deeds open the expedition camp, and the camp ends the run.

## Acceptance

- [ ] A new story run opens on the firing, then the uncle, without a menu detour.
- [ ] Every item above is shown exactly once, at its first use, and can be dismissed.
- [ ] A returning player can skip the whole opening (a run-setup toggle, default on for a first run).
- [ ] UI per UI-STYLE.md: the uncle speaks through Story cards (the existing dialogue channel).

## Open

- ~~How the firing is shown~~ **RULED (owner, 2026-10-31): a graphic-novel-style scene — background
  art with dialogue cards over it** (the Story card channel). Not a staged in-world scene.
- Whether the tutorial jobs are scripted or just the first real offers with prompts on top.
- **RULED (owner, 2026-11-02) — the first job is a COURIER run TO Larry, not his paper round.** From the
  Sid Meier review (review-sid-meier-2026-11-02.md item B): papers is the only type whose deadline is the
  real target (par × 1.5, FEAT-141), so a brand-new player could lose their first job. Owner: *"i wouldnt
  want to make the papers different rules the first time around. maybe we just courier something TO larry
  instead. then the player can play papers if they want or not."* Papers keeps its rules; after the
  courier, Larry's round is on offer like any other job. Also noted (not a ruling): a round that expires
  still banked its throws — *"they can lose and still make money tho... maybe we just dont need to call
  that 'losing'"* — so the papers result card should not read as a failure.

## Planning notes — 2026-11-04 (exploration done, owner questions open; NOT a plan yet)

Lane A mapped the code for this ticket (three read-only sweeps), then the owner stopped the question
round to /clear. Nothing is decided and no code exists. Resume from here: ask the three questions below,
then plan mode on these notes.

**Hook points** (main.js line numbers as of 00760b47):
- `_startStory` (~8066): a new run vs a resume.
- `onRegionLive` (~7830): the per-run resets; `dialogueSystem.start()` is here.
- deps `setQuickJobVisible` (~7758): the go-live moment, where `RUN_INTRO` plays today.
- `_runSnapshot` / `_restoreRun` (~8456 / ~8477): `dialogueSeen` already persists, so a seen-key never
  replays on resume.
- The skip toggle: `SELECTORS` (~1410), `SETTINGS_DEFAULTS` (src/settings.js:10), and a `data-key`
  button in `#mm-setup-panel` (index.html ~1569).
- Cards: `DialogueSystem.play` (src/dialogue.js:55) and the renderer `_renderDialogue` (~3639).
- **The template for a scripted first job** is the requisition-line pattern in offer-board.js:
  - the constructor's `_lines` slots;
  - `openLines`' fixed `_spec`;
  - `destWish` with `anyLeg`;
  - `planDistinct`'s fixed-spec bypass;
  - `save.js` `BOARD_OPS`, which a new mutator must join.

**Facts the design must respect:**
- `DialogueSystem.play()` REPLACES a showing card and drops its `onDone`. There is no queue.
- Cards hold neither the sim nor the day clock (`_heldPause`, ~1199). They swallow every key, even
  while driving.
- No scene art and no full-screen art layer exist. The z bands are cards 95–97, map 90, fades 150–160.
  The burger joint (`foodVendor`) has no model.
- Mom's house posts no jobs (no SOURCES row). Mom and Larry are both `nearSpawn`, within ~1 km, so a
  Mom → Larry leg needs `anyLeg`: POI_LEG_MIN is 1050 m.
- Larry's park trigger always opens the paper route (~5234). The first job's drive-up arrival (28 m)
  doesn't use the park trigger.
- The result card hides par and the letter (the game-feel rulings). Rank lives on the live bar only.
- The natural first-use triggers:
  - the first giver park (`mission.js _present`);
  - arrival / the `'done'` card (~6134);
  - the first pump park (~5198);
  - `serviceScreen.open` (~5216);
  - the energy stage reaching sleepy (`_updateEnergyMeter` ~6470; 19:00 on day 1);
  - `offerBoard.openLines()` returning true (~6399; main.js ignores the return today).
- Smoke steps that pin today's intro: `test/cdp-smoke.mjs` ~250 (opens on the intro cards) and ~739
  (no replay on resume).

**The draft design (not approved):**
- **Opening toggle:** a run-setup row, "Opening", on until one opening has completed, then off by
  default. With it off, `RUN_INTRO` plays as today.
- **The firing:** a full-screen scene layer at z 94, under the cards. The sim is held while it plays.
- **The first job:** Larry's call sends you to the scripted line, one fixed courier line from Mom's to
  Larry's. Normal pay and deed rules (the owner's "same rules" principle from the papers ruling).
- **First-use cards:**
  - Voice and gating: Larry's voice, keyed `tut-*` on the dialogue seen-gate.
  - When they play: only while the truck is stopped, holding the clock while one is up.
  - The queue: a small one added to `DialogueSystem`, so a card never replaces another.
- **Words:** I draft and flag them; the owner rewrites (FEAT-148: the owner owns character text).

**Three owner questions, unanswered:**
1. **The firing's art.** No art exists and the burger joint has no model. Options:
   - I model a burger-joint set and render 2–3 flat-shaded panels headless (an ASSET ticket);
   - the owner supplies the panels (the scene can't ship until they land; no stubs);
   - plumbing first, art later.
2. **Who sends the first job to Larry.** Options:
   - Mom, scripted (recommended: always near spawn, family);
   - the burger joint (tension with "never earn a cent from it" unless unpaid);
   - the first real courier offer that can end at Larry's.
3. **The result-card conflict.** The ticket says teach "par, rank, pay", but par and the letter are off
   the card. Options:
   - teach what the card shows (base, tip, deed) plus the rank bar the first time it appears
     (recommended);
   - show par and the letter on the first card only.
