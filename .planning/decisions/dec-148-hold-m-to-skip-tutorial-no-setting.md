---
id: DEC-148
status: standing
decided: 2026-11-14
area: ui
governs: FEAT-184, src/main.js, src/settings.js, skip-hint, tutorial skip, settings
supersedes:
---

# DEC-148: Hold M to skip the tutorial; a confirmation for new players; no setting

**Ruling.** Before the card, "skipping is the same hold to skip we built but make sure it says 'to skip tutorial'"; the prompt reads "hold m to skip tutorial". "If you enter the tutorial or its the first playthrough ever it will have an additional confirmation 'are you sure you want to skip the tutorial'". "skipping always lands you at free will". "no setting"; "we can also get rid of the menu option for always skipping the tutorial"; "first playthrough ever can skip the tutorial and there is no more flag."

**Why.** "since the player is new or intentionally chose the tutorial we need to safeguard from accidental skipping"; the prompt itself tells a returning player the tutorial exists.

**Replaces.** The FEAT-184 "always skip the tutorial" setting and its auto-on after the first tutorial (owner, 2026-11-07), and the tutorial flag that started complete (owner, 2026-11-08).

**Source.** FEAT-184 tutorial dive, answers "skip", "default-skip-moves", "default-setting" (owner, 2026-11-14). Owner's words.
