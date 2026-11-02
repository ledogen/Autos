# The loop against Sid Meier's guidance on fun — review + owner verdicts (2026-11-02)

An Opus review of the story-mode loop (DESIGN.md, missions.md, run-shape.md, opening.md, MILESTONES.md
and the alpha tickets) against Sid Meier's documented guidance. The owner trusts that guidance. This file
is provenance. Each ruling also lives in its ticket, and DESIGN.md wins wherever the two differ.

## The guidance used

1. A game is a series of interesting decisions: trade-offs, no option that always wins, enough information, lasting consequences. (GDC 2012 "Interesting Decisions"; the four qualities come from a secondary write-up.)
2. If 90 % of players pick option A, the options are unbalanced. (Memoir.)
3. Find the fun; when tuning, double it or cut it in half. (Memoir; Soren Johnson 2009.)
4. One good game beats two great ones: the "Covert Action rule". (Johnson 2009.)
5. The player should be the one having the fun, not the designer or the simulation. (Johnson 2009.)
6. Players never question a reward, but they read an unexplained setback as cheating, so explain why it happened and how to avoid it. (GDC 2010 keynote.)
7. The first 15 minutes must be fun and winnable by anyone. (GDC 2010; the memoir.)
8. Winning is fun; players want to feel above average. (GDC 2010.)
9. Protect players from themselves: his "rise and fall" mechanic failed because losing players reloaded before the recovery came. (GDC 2010.)
10. Give the player control over risk: the wooden vs stone bridges in Railroad Tycoon. (Memoir, medium confidence.)

Sources: gdcvault.com/play/1015756 · venturebeat.com (GDC 2010 keynote quotes) · gameinformer.com (2010-03-12)
· gamedeveloper.com (Soren Johnson 2009, "Sid Meier's key design lessons"; Keller 2021) · blog.kartones.net (memoir review).

## Findings and verdicts

| # | Finding | Owner verdict (2026-11-02) | Where it went |
|---|---|---|---|
| A | The run-end card doesn't say why the run ended or how to avoid it. The crash card lacks the panel's limit; "The truck is dead." has no reason. | **Approved.** | FEAT-160 (Spare) |
| B | The first job (Larry's paper round) is the least forgiving: papers' deadline is the real target, par × 1.5. | **Agreed. The first job becomes a courier run TO Larry**; papers keeps its rules and becomes optional. A round that expires still banked its throws, so don't frame it as "losing". | FEAT-147 § Open (ruled) |
| C | The finale isn't the hardest drive: the rank thresholds are flat, the five lines are ordinary trips, and the only cost is wear without pay. | **Agreed:** *"its not a fun cost its attrition."* How is open. | FEAT-161 (Lane A plans options) |
| D | FEAT-157's one line per mission type, each at C or better, makes the player's weakest type the last gate. Suggestion: one swap, or easier gates for the hardest types. | Owner asked what it meant. Explained 11-02; decision owed. | tracker OWED (decide) |
| E | "Give up" as the expected ending is Meier's rise-and-fall result. Suggestion: the give-up card shows the way back. | **Counter-idea:** failures that genuinely strand the truck, plus a "heart", one terminal health that abuse damages; "you broke down". | FEAT-162 (Lane B, plan first) |
| F | The service screen repairs one part per row, with no "service all". | **Rejected — the per-part screen is the design:** *"paying to fix 2% here 2% there and a new air filter you dont need is supposed to be super expensive. you dont take a car in to the shop and get the works because you drove 5k miles."* | no change |
| G | Is driving slowly the option that always wins? Measure it, don't change it. | **No action:** *"some people will drive fast bc they think they got it… agree it needs data."* | FEAT-69 play-test data |

The review also noted that DESIGN.md SM-INV-14 still called freight's hidden deed an "accepted" tension
after R-09/R-18 had put the deed on the card. DESIGN.md was updated on 2026-11-02.

## Already lines up — don't touch

- The core decision: how hard to push, every corner, against wear, crash risk and the speed tip.
- One job at a time and no minigames: the Covert Action rule is avoided.
- Setbacks come from forces, not dice: punctures are deterministic.
- Offer cards are readable; FEAT-142's one-trait cut is "cut it in half" in practice.
- The autosave can't undo a crash, so the game protects players from themselves.
- Completing a job pays half the maximum, so winning feels good.
- The goal (the camp) is on the map from day 1.
