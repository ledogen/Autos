# Amendments — release cuts: alpha is one region, 2026-10-23

*Written in the doc's ratification ritual. Every decision below is the project owner's, from a
scoping conversation on 2026-10-22/23. Wording is a proposal; the decisions are not. Items marked
**OPEN** are not decided.*

> **STATUS: FOLDED IN 2026-10-23.** DESIGN.md (the 2026-10-23 ratification pass, SM-INV-1's towel
> note) and MILESTONES.md (§ Release cuts) carry these inline. This file is the provenance record.
> If it ever disagrees with DESIGN.md, **DESIGN.md wins.**

**Why.** The owner, 2026-10-22: "we need to roadmap out the beta release and get something playable
that's mostly bug [free] as a bare minimum before adding a buncha bullshit or I'll never have
anything to show for this project." Then: "lets talk about how we would tag features pre vs post
alpha so I don't lose any of the planning I have, I just gate it behind the roadmap release
timeframe."

| # | Amendment | What it changes | Ticket |
|---|---|---|---|
| 1 | **Release names are redefined.** **Alpha = one region.** **Beta = three or five regions**, plus shortcuts, dirt roads and spirits. **Later** = everything else. | Supersedes 2026-10-14 #14, "alpha run shape: three regions, 7 / 6 / 5 days". That shape is now a beta candidate. | — |
| 2 | **Nothing is deleted.** A ticket's release is set **only** by the `## Release cuts` tables in MILESTONES.md. A ticket no table lists is **later**, except open bugs, which default to **alpha** (alpha should be mostly bug-free). Design text past the alpha is kept word for word, under a one-line banner. | New. Mirrors how lanes already work: the doc is the one place it is set, and the dashboard reads it. | — |
| 3 | **The alpha run ends three ways:** reach the expedition camp (win), die (SM-INV-1: a fatal crash, or a breakdown you can't pay to recover from — running out of money ends the run this way), or **throw in the towel** from the pause menu. | New ending: the towel. SM-INV-1 holds — it is the player's choice, not a fail state. The owner expects it to be the most common ending. | FEAT-146 |
| 4 | **Every ending shows a run summary**, then returns to the main menu. A death→new-run loop and the garage stay with SM-4. | Takes the summary out of SM-4 for the alpha. | FEAT-146 |
| 5 | **The alpha story is three beats:** the firing, the uncle (who is also the tutorial), and the expedition camp. "That's good enough for alpha." | Narrows SM-5 for the alpha: no Roamer delivery and no spirits. | FEAT-147, FEAT-103 |
| 6 | **FEAT-103 loses its FEAT-28 dependency for the alpha.** With one region there is no unlock: the camp sits on the region's edge and finishing it wins the run. Roads trimmed at the wall, the R2 trail and the unlock all stay with FEAT-28 (beta). | Re-scopes FEAT-103's alpha slice. | FEAT-103 |
| 7 | **The alpha region is today's 2500 m story circle.** The ladder's R1 sector is beta. | Nothing to build: FEAT-43's region already is the circle. | FEAT-43, FEAT-103 |
| 8 | **Controller, instrument cluster, sound pass, stall, engine-off at camp, flats, camp gear, saves and the motorist's haul fetch are all alpha.** | Briefly listed as undecided; the owner put them all in. | FEAT-125, FEAT-133, FEAT-136, FEAT-34, FEAT-120, FEAT-109, FEAT-128, FEAT-93, FEAT-94, FEAT-66, FEAT-42, FEAT-132 |
| 9 | **The alpha is a polished demo.** "It'll be missing a lot of content but the things that are there should be complete." No stubs and no placeholder models: the expedition camp gets its real model, and so do the POIs and the uncle the alpha shows. | Sets the alpha's quality bar. | ASSET-71, ASSET-69, ASSET-70, ASSET-73, ASSET-32 |
| 10 | **Both known red gates are fixed for the alpha:** BUG-77 (tunnels) and FEAT-77 (road clearance, still in progress). | — | BUG-77, FEAT-77 |
