---
id: FEAT-147
type: feature
status: closed
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

**The three questions — ANSWERED (owner, 2026-11-05):**
1. **The firing's art: an in-world camera move, not panels (for now).** *"have lane C build a burger
   joint model. for now we can just do a camera move on the burger joint in the game world and put the
   dialogue cards over it. this keeps it simple while getting the point across."* This narrows the 10-31
   graphic-novel ruling: no scene art layer; the camera flies to the `foodVendor` POI and the Story
   cards play over the live world. The burger-joint model is Lane C's (an ASSET ticket, routed by the
   orchestrator); until it ships the POI wears whatever `model: null` gives it today.
2. **Mom sends the first job, scripted** (recommended option): one fixed courier line, Mom's → Larry's,
   on normal pay and deed rules.
3. **The first result card teaches what the card shows** (recommended option): base, tip and deed on
   the card, plus the live rank bar the first time it appears. Par and the letter stay off.

## Plan — 2026-11-05 (Lane A, after the owner's three answers)

Built in slices, a WIP commit each. Every word on a card is a PLACEHOLDER the owner rewrites (FEAT-148).

1. **Mom's first job — a fourth board slot kind (`f`).** `data/offers.js FIRST_JOB`: one courier
   thing (Mom → the `larry` tag). OfferBoard gets one `f0` slot at mom's, `closed` until
   `openFirst(nowH)` (joins save.js `BOARD_OPS`). Its spec is FIXED but shaped like any rolled courier
   spec (no `line`), so the normal card, pay, deadline, settle and deed rules apply untouched — the
   owner's "same rules" principle. planDistinct skips the re-roll; destWish sends it to Larry, strict,
   `anyLeg` (the two houses sit inside POI_LEG_MIN). Any end (done, cancel) closes it for good
   (`_lock` → 'done'; mom has no SOURCES row to lock against). Mom answers the park trigger only
   while that slot is live (`_poiInReach`); otherwise her door is the bed, as today.
2. **The Opening toggle.** A run-setup row; `SETTINGS_DEFAULTS.opening = true`, flipped off once an
   opening completes (the player can turn it back on). Off → `RUN_INTRO` at go-live, exactly as today.
3. **The firing — an in-world camera move (owner 11-05).** Opening on + a NEW run: onRegionLive seats
   the truck on the foodVendor's lay-by, road-side strip (pad-local z −2.8, nose along the road), the
   `_restoreRun` seat pattern — the story network is the frozen whole region, so no build. Go-live:
   the sim is held (`_openingHold` in `_heldPause`), `setCameraFocus` slowly orbits the joint's ROAD
   face (theta from the pad normal; works on the cube today, ASSET-80 later), the firing cards play.
   On the last card: focus cleared (the chase spring swings onto the truck parked right there),
   hold released, Mom's call plays, `openFirst()` posts her job.
4. **Larry after the first job.** The first job's result card closes → Larry's welcome, which is
   `RUN_INTRO` (the goal, the deed rule, the pay rule) moved to this beat; the opening is marked
   complete (the toggle's default flips off).
5. **First-use cards (`tut-*` keys on the dialogue seen-gate).** `DialogueSystem.queue()` appends
   instead of replacing; a card waits until the truck is stopped and holds the sim and clock while it
   is up. Triggers: the first offer panel (the offer card), the first accept (the rank bar), the first
   result card (base, tip, deed — the card as it is, owner 11-05), the first pump park, the first
   service screen, day 1's sleepy stage (finding ground, camp, the day as the budget), the
   requisition opening (`openLines()` returning true). Each shows once per run, dismissed by a key.
6. **Smoke.** `test/cdp-smoke.mjs` ~250 / ~739 pin today's intro: they get an opening-off run (as
   today) plus one opening-on step (the firing plays, the camera returns, Mom's offer is live).
   Runs when the compute hold lifts.

Known ceiling: the joint is sited `any`, so the first drive (joint → Mom's) can be ~2–3 km on a
large-spread seed. Re-siting it `nearSpawn` reshuffles every seed's POI layout — not done; owner's call
if the drive feels long.

## Built — 2026-11-05 (feature/run-shape, Lane A)

Slices 1–6 of the plan are in (commits 1c359f2a … 8678a4a2):
- **The first job:** `data/offers.js FIRST_JOB`; OfferBoard `f0` slot (kept OUT of `_slots`, added by
  `_at`/`clearRoutes`), `openFirst()` / `firstState()`, save.js `BOARD_OPS` += `openFirst`.
  `test/offer-board.mjs` FEAT-147 block — 10 checks, the gate green (all checks).
- **The toggle:** `SETTINGS_DEFAULTS.opening`, the `opening` row (play / skip) on the story setup page.
- **The firing:** `_seatAtJoint` (onRegionLive) · `_playOpening` (go-live) · `_updateFiringCam` (per frame,
  the focus seam) · mom's call → `openFirst` happens at the firing's START so a mid-firing save keeps it.
- **The hold:** `_cardHold` in `_heldPause` — only while a card is actually up; `_renderDialogue` clears it.
- **First-use cards:** `_tut(key)` queue + `_pumpTut` on the run-HUD poll; triggers: first offer panel,
  the rank bar's first show, first pump, first service screen, the sleepy stage, `openLines()` → true.
  Only in a run that opened on the firing (`dialogueSystem.has(DLG.firing)` — survives a resume).
- **Larry's welcome:** `_checkOpeningEnd` — mom's job ended any way and its card put away → LARRY_WELCOME +
  RUN_INTRO, then `opening` saved off.
- **Smoke:** the main flow now picks `skip` (its later steps must not meet a holding card); a new last step
  `opening` plays it: seated < 8 m from the joint, camera on the orbit, clock frozen, firing → mom's call →
  her job live → camera home.

**Verified 2026-11-05 (hold lifted):** the affected set, 43/43 green; `node test/cdp-smoke.mjs` PASS,
23 steps, zero console errors (`opening` 19.9 s). **Owed before landing:** the owner's drive on :3731. `test/pad-e2e.mjs` (unregistered) counts setup-page rows by
D-pad presses — the new `opening` row sits under the mode row; re-check its counts when it next runs.

**Owed by the owner:** every card's words (FEAT-148 — all PLACEHOLDER in data/dialogue.js); whether the
joint→mom's first drive is too long on a wide seed (re-siting the joint `nearSpawn` reshuffles every
seed's POI layout).

## Fixed 2026-11-05 — no job after the opening (owner's drive on :3731)

*"i didnt have a job after the opening (no gps top bar not populated). mom did have a mission i could optionally
accept."* Mom's job was only POSTED at her house. Now her call's last card takes it for you (`_takeFirstJob`,
b0cf618b): taken at the joint, away from her house, it is an `approach` exactly like a requisition line taken at
the camp — untimed, HUD "x km to Mom's · park there to start", her lit park spot and the map pin. Unlike a camp
line it also gets a GPS route to her door (`approachGuide`, planned from the joint at the take; not saved, so a
run resumed mid-approach has the pin and the HUD only). Parked at hers, it starts as the ordinary courier to
Larry. The accept button's handler is now the named `_acceptOffer` both paths call. cdp-smoke's `opening` step
checks the job in hand, the HUD line, the guide, and the start at mom's (PASS 23/23).

## Resolution — Lane A, 2026-11-07 (close-on-evidence sweep)

Built and on main (cb5dcf84; the no-job-after-the-opening fix b0cf618b), then carried by FEAT-170 (its stages on main by 6099321f) and BUG-117 / BUG-124. The teach list is the first-use cards (`_tut`) plus FEAT-170's lessons. Gates: offer-board's FEAT-147 block and cdp-smoke's `opening` and `story` steps. The card words stay with FEAT-148. The owner's open question (is the joint → mom's drive too long on a wide world?) moves to FEAT-170's playthrough.
