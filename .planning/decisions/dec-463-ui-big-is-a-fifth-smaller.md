---
id: DEC-463
status: superseded
decided: 2026-11-20
area: ui
governs: FEAT-248, DEC-383, index.html, --ui-zoom, UI scale big
supersedes: 
---

# DEC-463: UI size Big is 20 % smaller

**Ruling.** "It works pretty well, but it's a little bit too big. Reduce the size by 20%." (card ui-1117-look, choice "Changes (note box below)".)

**Why.** Big was built at --ui-zoom 1.5. The agent reads the 20 % as the Big factor, 1.5 to 1.2 (1.5 x 0.8). If the owner meant something else, that one number is what changes; DEC-383 (two values, small and big) is untouched.

**Replaces.** The factor 1.5 in `html[data-ui-scale=big]` (index.html line 54). DEC-383 stands.

**Source.** Owner, card ui-1117-look, answered 2026-11-20 (note box). Owner's words.
