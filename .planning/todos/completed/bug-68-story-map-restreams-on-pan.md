---
id: BUG-68
type: bug
status: complete
severity: major
opened: 2026-09-17
closed: 2026-09-20
resolution: >
  Fixed. The region lock was gated on `_radiusTarget >= reg.r`, and the only thing that ever
  widened that window was main.js's M-key handler — so every other way of opening the map
  (`_setMapOpen` on a mission offer, main.js:2811, is the live one) left the cap at the free-roam
  2000 m, short of a 2500 m region. Measured in story mode: radiusTarget 1400, cap 2000, predicate
  FALSE — the lock never engaged, so the map streamed cursor-follow and panning past the wall built
  a fresh disc around the cursor. `Map2D._syncRegionWindow()` now covers the region from inside the
  map, on open and per frame, so `_regionLock()` has no coverage test left to fail; a `_regionFrozen`
  latch stops the map re-BUILDING a region it already built. The adopt path is deliberately NOT
  frozen — play registers its region progressively, and a first attempt that froze there pinned an
  8-edge map while play went on to 163; `_playOutgrewMap()` re-takes the copy instead. Verified in
  headless Chrome: map catches up 7 -> 171 edges, then 171 -> 171 identical across a 6 km pan and a
  reopen, anchor pinned to the region centre throughout.
source: >
  Owner, 2026-09-17: "for story mode we dont need to regenerate any roads once they are initially
  mapped. panning outside the region area currently generates roads outside the area and erases
  the ones inside it. we should generate and freeze roads once for story mode."
---

# BUG-68 — the story-mode map re-streams around the pan cursor, so panning past the wall invents roads outside the region and drops the ones inside it

## What happens

Free roam's map has to chase the pan cursor: the world is unbounded, so the only way to show the
road under the cursor is to re-stream around it. A story region is bounded, so FEAT-43 added a
region LOCK (`Map2D._regionLock`) — one stream from the region centre covers everything the player
can legally reach, and the anchor never moves again.

The lock was conditional on the map's streaming window already being wide enough:

```js
return this._radiusTarget >= reg.r ? reg : null
```

…and the only thing that ever widened that window was **main.js's M-key handler**:

```js
const _reg = storySystem.region()
if (_reg) { map2d.setRadiusCap(_reg.r + 400); map2d.setRadiusTarget(_reg.r + 200) }
```

So any path that opened or re-targeted the map **without going through that keypress** left
`_radiusCap` at the free-roam `MAP_RADIUS_MAX` (2000 m). `setRadiusTarget` clamps to the cap, and
2000 m is short of a 2500 m `REGION_RADIUS_M`, so `_regionLock()` returned **null** and the map
silently fell back to cursor-follow streaming.

The live path that does exactly this is **mission framing**. `_setMapOpen()` (`src/main.js:2811`)
calls `map2d.show()` directly and then `frameBounds(...)` + `setRadiusTarget(reach + 300)` — no cap
raise anywhere. It is shared by the POI job and the paper route (FEAT-61), so it fires on **every
mission offer**: "here is the work, look at it before you commit." Measured in story mode, seed
default, with the map not yet opened:

```
_radiusTarget = 1400   _radiusCap = 2000   region.r = 2500
old predicate (_radiusTarget >= reg.r) -> FALSE      // the lock never engaged
```

`setRadiusTarget(reach + 300)` then clamps to the 2000 m cap, which is still short of 2500 — so
once an offer has opened the map, it stays unlocked for the rest of the session unless the player
happens to press M.

A map opened during the post-entry settle grace has the same hole from the other end: the region is
captured a beat AFTER entry (`SETTLE_MIN_MS`..`SETTLE_MAX_MS` in `story.js`), so `getRegion()` was
null at open and nothing ever re-checked it.

Once unlocked, panning past the wall drifts the anchor, which re-streams a fresh disc around the
CURSOR. The FEAT-43 docstring already measured what that costs on a 2.5 km region: each re-stream
update ran ~2.2 s, and an 850 m pan **dropped 21 edges off the trailing side while gaining 15 on
the leading one — strictly less map, for seconds of main-thread work**. That is precisely the
owner's "generates roads outside the area and erases the ones inside it".

## Fix

Two halves, both in `src/map2d.js`:

1. **`_syncRegionWindow()`** — stop TESTING whether the window covers the region and guarantee it
   instead. Runs on `show()` and once per frame while open, so the map self-manages its story
   window no matter who opened it, and picks the region up if it appears while the map is already
   open. `_regionLock()` is now just "is there a region?", with no coverage test to fail.
   The M-handler's copy in main.js is deleted — having it in one place is what made it missable.
2. **A freeze latch (`_regionFrozen`)** for the case where the map has to BUILD the region itself
   (play not adoptable). Keyed on `seed|x|z|r`; once set, `show()` will not re-stream and
   `_anchorDrifted()` is false. Cleared by `_buildRoad()` (new seed / road params = a new world)
   and by `resetRadiusTarget()` (story exit).

In story mode the build is normally free anyway: the locked map ADOPTS the play network, which
already IS the region play generated once behind the entry loading screen. Fixing the lock is what
makes that zero-build path reachable at all — measured, it never ran before, because the lock never
engaged.

### The trap in doing it naively (found by measurement, worth keeping)

Freezing on the ADOPT path too looks right and is badly wrong. Play **registers** its region
progressively while it warms, so a map opened mid-warm adopts a partial network. Measured, first
attempt: the map copied **8 edges** and froze, while play went on to **163** — a permanently
near-empty story map, worse than the bug being fixed.

So the adopt path is deliberately **not** frozen. Adoption is a *copy*, not a generation, and the
"generate once" already happened on the play instance; re-taking the copy costs nothing.
`_playOutgrewMap()` drives that from the per-frame hook — and because `adoptNetwork()` copies play's
network wholesale, the two sizes are equal straight after an adopt, which makes "play is bigger" a
self-extinguishing trigger rather than a per-frame re-copy.

### Verified in-browser (headless Chrome via CDP, story mode, mission-framing open path)

```
before the map opens   radiusTarget 1400  cap 2000  region.r 2500
                       old predicate (radiusTarget >= reg.r) -> FALSE     lock did not engage
after open             radiusTarget 2700  cap 2900   lock true
   t+32s  map   7 / play 171  (streaming)      <- partial copy taken mid-warm
   t+36s  map 171 / play 171                   <- _playOutgrewMap re-took it
pan 6 km outside the region, then reopen the map:
   anchor {150,18} -> {150,18}   anchorDrifted false   171 -> 171 edges, identical set
```

There is no gate: the repo has no headless Map2D harness (the class needs a canvas), and every
existing map tool — `test/map-shot.mjs` — is browser-driven. The probe above is the check.

## Acceptance

- [x] In story mode, `map2d._regionLock()` is non-null however the map was opened (M key, mission
      framing, or opened during the settle grace before the region exists)
- [x] Panning far outside the region does not change the map's network: `_anchorDrifted()` stays
      false and `_road._network.size` is unchanged (171 -> 171, identical edge set, across a 6 km
      pan and a reopen)
- [x] A map opened mid-warm catches up to play's full region instead of freezing a partial copy
- [x] Free roam is untouched — `_syncRegionWindow()` returns immediately when there is no region,
      so the cap stays at `MAP_RADIUS_MAX` and streaming stays cursor-follow
- [x] Story exit releases both the window and the freeze (`resetRadiusTarget`)
