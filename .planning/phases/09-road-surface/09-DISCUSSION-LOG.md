# Phase 9: Road Surface - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-11
**Phase:** 9-road-surface
**Areas discussed:** Asphalt look, Camber & crown, Carve character, Surface materials, Road intersections (scoped in), Crossings & stability

---

## Asphalt look

| Option | Description | Selected |
|--------|-------------|----------|
| Dashed centerline only | Single dashed center stripe | |
| Center + solid edge lines | Highway look | |
| Double-yellow + edges | Most detailed | |
| **Worn-quality tiers (free-text)** | Center + edge lines with seeded per-stretch quality variation | ✓ |

**User's choice:** Worn-out look — quality varies in ~500 m stretches. High = solid center + solid edges, opaque; Mid = solid center + intermittent edges, faded; Low = translucent center only.
**Notes:** Quality seeded/deterministic (no flicker), blended at boundaries. Pothole/crack severity (SURF-06) tied to the SAME per-stretch quality via a labeled `roadQuality` hook. Asked per-run vs patches-along-road → chose patches in ~500 m sections.

---

## Camber & crown

| Option | Description | Selected |
|--------|-------------|----------|
| Subtle / realistic | ~2–6° bank, small crown, natural | ✓ |
| Noticeably banked / arcade | ~8–15°, dramatic | |
| Realistic default + slider | Default + debug sliders | |

**User's choice:** Subtle / realistic.
**Notes:** Will still expose camber-strength + crown-height debug sliders (realistic = default).

---

## Carve character

| Option | Description | Selected |
|--------|-------------|----------|
| Real cut faces where steep | Cut-biased + cut faces on steep | |
| Gentle graded shoulders everywhere | (initially selected, then corrected) | |
| **Cut-and-fill (free-text correction)** | Cut on steep, raised dirt embankment on rolling | ✓ |

**User's choice:** Cut-and-fill — steep cut faces on switchbacks/mountains; raised graded-dirt foundation on rolling terrain (better view while driving).
**Notes:** Implemented via ONE signed cross-section (`delta = designGrade − ground`); needs a smoothed road design grade. Raise height defaulted ~1–2 m + slider. User asked me to propose transition handling → chose Approach A (signed cross-section, seamless at crossover).

---

## Surface materials

| Option | Description | Selected |
|--------|-------------|----------|
| **5 zones, two drivers (free-text)** | carve sign + terrain slope, feathered blends | ✓ |

**User's choice:** Distinct procedural appearance for: road (asphalt), road cutout (engineered), dirt foundation, natural cliff (steep terrain by slope), general terrain (level). Blended between zones.
**Notes:** Cutout ≠ natural cliff (built vs wild). Foundation/cutout from the signed cross-section; cliff/level from terrain slope. Slope-based terrain shading kept in P9 but splittable.

---

## Road intersections (scoped into Phase 9)

| Option | Description | Selected |
|--------|-------------|----------|
| A. Merged paved footprint | Union ribbons into one shared paved junction | ✓ |
| B. Priority + T-meet | One continuous, other meets edge | |
| C. Z-offset overlap | One ribbon above the other | |

**User's choice:** Merged paved footprint, at-grade only. **Decided to scope intersections INTO Phase 9 from the start** ("to keep it clean" — junction-aware mesh beats retrofitting).
**Notes:** Construction sketch (user + Claude): fillet road edges into a closed footprint, fill as road surface, project down via the carve; trim legs; flatten crown in the box; reconcile to one shared node elevation. Acknowledged it's hard → merged-footprint algorithm is the PRIMARY RESEARCH TARGET for plan-phase (spike only if research finds it gnarly). Pulled in BUG-08 (window-invariant splines) as a prerequisite.

---

## Crossings & stability

**User's choice:** Superseded by the intersection scope-in. Rather than defer + degrade gracefully, P9 now builds real junctions (FEAT-05 folded) and includes the BUG-08 stability fix.

## Claude's Discretion

Exact slider magnitudes: raise height, camber/crown, shoulder/blend widths, design-grade smoothing, fillet radii — realistic defaults + debug sliders.

## Deferred Ideas

- Grade-separated crossings (overpasses/bridges/underpasses) — at-grade only this phase.
- FEAT-04 (truck body + lights), FEAT-03 (dust trails), BUG-06 (chase-cam jitter) — reviewed, not folded (independent of road surface).
