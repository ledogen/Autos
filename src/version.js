// src/version.js — build marker shown in the debug panel (QUAL-04).
//
// AUTO-STAMPED by .git/hooks/pre-commit on every commit (timestamp + the commit's parent SHA).
// Do NOT hand-edit — your change will be overwritten on the next commit. The point is to tell, at a
// glance in-game, WHICH build the browser actually loaded: GitHub Pages deploy lag + browser/CDN cache
// (cache-control max-age=600) can serve a stale bundle, so a visible build time disambiguates "is this
// my latest push?" from "am I looking at a cached build?".
//
// The timestamp is the reliable freshness signal (= commit time). The SHA is the commit's PARENT
// (a pre-commit hook can't know the not-yet-created commit's own hash), so treat it as "built atop".
export const BUILD = '2026-06-23T21:24Z · atop 7fc086e'
