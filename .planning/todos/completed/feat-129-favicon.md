---
id: FEAT-129
type: feature
status: completed
severity: trivial
opened: 2026-10-19
closed: 2026-11-06
source: owner, 2026-10-19 — "favicon"
---

# FEAT-129: Favicon

## Acceptance
- [x] `index.html` links a favicon (SVG preferred, in the flat art style); shows on dev and on Pages
      (check the vite copy path if it's not an ES import).

## Resolution (2026-11-06, Lane C) — SHIPPED

`assets/favicon.svg`: a pickup in profile, faceted like the models (octagon wheels, no curves), in
`--accent-system` green on the card black (UI-STYLE.md: the tab is the game as software, the System family).
Linked from `index.html` as `<link rel="icon" type="image/svg+xml" href="./assets/favicon.svg">`. Dev serves it
from the project root. `vite build` treats it as an HTML asset: it is hashed into `dist/assets/` and the link
is rewritten (proven: `dist/index.html` → `./assets/favicon-<hash>.svg`), so the copy plugin needs no entry.
Checked readable at 16 and 32 px. Gates: rank-timer, paper-route, cdp-smoke green. The live Pages tab is
confirmed on the first deploy after landing.
