---
id: DEC-498
status: standing
decided: 2026-11-24
area: world
governs: FEAT-302, src/poi.js, src/road.js, test/story-poi.mjs, driveway, POI pad, parking lot, shoulder, trailer home
supersedes: 
---

# DEC-498: A driveway takes the ground texture it covers, is a physics surface, may change the shoulder, and meets the POI's parking lot

**Ruling.** "the grey looks bad. lets try having it inherit the ground texture it covers up, otherwise maybe gravel is the solution. the driveway ribbon should be a physics surface. allow driveways through the check. we also need the driveway to meet up with the poi parking lot if it has one. for a lone trailer home it should just be a parallel driveway thats level with the home but the ends should slope to meet the road. make it make sense!"

**Why.** The owner's look at the FEAT-302 rework sheet (proto/feat-302-pad-driveway @ 052cf2ed): a flat grey marking laid over the carved ground, drawn only. The flush driveway raises the shoulder in front of its pad by up to 0.155 m, which the story-poi gate's rule ("the road surface from the crown to the shoulder's outer edge is identical with and without POI pads") forbade at 6 of 24 770 probes.

**Replaces.** It narrows that story-poi rule: the asphalt is still identical everywhere; the shoulder is identical everywhere except inside a driveway mouth ("allow driveways through the check").

**Source.** Owner, 2026-11-24, card `feat302-driveway-rework-pick` (choice "Change (note box below)"). The owner's words.
