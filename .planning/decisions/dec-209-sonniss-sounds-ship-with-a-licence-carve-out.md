---
id: DEC-209
status: standing
decided: 2026-11-14
area: repo
governs: LICENSE, assets/audio/CREDITS.md, assets/audio/, FEAT-120, wip/sonniss/
supersedes:
---

# DEC-209: Sonniss sounds ship with a licence carve-out

**Ruling.** Sonniss #GameAudioGDC bundle sounds may ship in the game and commit to `assets/audio/`. `LICENSE` carves all third-party files out of CC BY-NC, and every Sonniss file gets a line in `assets/audio/CREDITS.md` (bundle year, publisher, pack, original name). A raw Sonniss sound never goes into a store item, and none is ever fed to an AI generator or used for training. (Agent's wording; the owner approved it: "yep".)

**Why.** The bundle licence (`License.pdf` in each bundle) allows use and modification in commercial games without attribution. It forbids claiming authorship, selling the sounds "as they come", and AI training. Re-encoding changes nothing legally. Sonniss is not a non-commercial licence, so DEC-079 allows it. The carve-out also covers the files already here: the JetBrains Mono font (OFL), the engine-sim bakes (MIT) and the Freesound starter (CC0).

**Replaces.** Nothing. DEC-079 still stands.

**Source.** Chat, 2026-11-14 (FEAT-120 library pull). Owner approved the proposal: "yep".
