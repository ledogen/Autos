---
id: FEAT-31
type: feature
status: open
opened: 2026-07-16
severity: minor
source: user-request
relates_to: FEAT-23 (WebAudio engine drone — src/engine-audio.js, master gain + gesture-gated ctx)
note: "Player-supplied music while driving. The user's framing: 'I'll never be able to do better
than what people can do for themselves, so let players bring their own music (e.g. Spotify).' Open
whether this is a real in-game integration or just getting out of the way so people play their own.
User flagged it may be too cheesy — this ticket is a THINKING SURFACE, not a committed build. Decide
the tier + whether to build at all before any implementation."
---

# FEAT-31: Player music — bring-your-own soundtrack while driving

## Context

The engine drone, ambient, and (future) world audio are ours to make, but a driving game lives or
dies on its soundtrack, and no bundled playlist will ever beat what a player already listens to.
The user's instinct: let people drive to *their own* music. The question is how far we go — from
"don't fight the music they're already playing in another tab" all the way to "connect Spotify and
control it from an in-game HUD."

The user is explicitly unsure this is worth doing ("maybe this is too cheesy"). Treat the go/no-go
and the provider/tier choice as **the user's design calls** — this ticket captures the options and
the constraints so that decision can be made from a real picture, not vibes.

## The tiers (cheapest → deepest — pick one, or none)

- **Tier 0 — "focus mode" (do essentially nothing):** players already alt-tab and play Spotify /
  Apple Music / whatever. All we add is a toggle that ducks or mutes OUR audio (engine, ambient) so
  it doesn't fight their soundtrack, plus maybe a one-line hint in the controls/pause menu ("playing
  your own music? press X to duck game audio"). Zero auth, zero external deps, works for everyone,
  ~an afternoon. This is the honest floor and may be all that's warranted.

- **Tier 1 — local files (universal, no accounts):** drag-and-drop a folder / files onto the game,
  play them through Web Audio (reuse the FEAT-23 AudioContext), tiny in-game transport (prev / play /
  skip / volume) on the HUD. No OAuth, no Premium gate, no ToS surface, no external CDN — fits the
  "self-contained, single origin" ethos cleanly. Downside: not the frictionless "it's just my
  Spotify" the user pictured.

- **Tier 2 — Spotify now-playing + remote control:** OAuth-connect the player's Spotify, show the
  current track on the HUD, and drive play/pause/skip via the Spotify Web API against whatever device
  they're already playing on. Music does NOT come out of the game tab — we just display + control.
  Requires **Spotify Premium** for the control calls.

- **Tier 3 — Spotify in-tab playback (the full "connect Spotify to the game" vision):** the Spotify
  **Web Playback SDK** creates a player device inside the game tab so the music actually plays through
  the game, fully integrated. Requires **Spotify Premium** and loading Spotify's external SDK script.
  This is the deepest, cheesiest-if-done-wrong, coolest-if-done-right option.

## Constraints & technical notes (so the decision is grounded)

- **No-backend rule still holds.** CLAUDE.md: browser-only, single origin, no server / WebSocket /
  backend. Spotify's **Authorization Code with PKCE** flow is fully client-side — no client secret,
  no token-exchange server — and the GitHub Pages origin can be the registered redirect URI. So Tiers
  2/3 are *possible* without violating the constraint. (The old Implicit Grant flow is deprecated;
  PKCE is the supported no-backend path.)
- **Premium gate is the real limiter.** Both Web API playback control (Tier 2) and the Web Playback
  SDK (Tier 3) only work for Spotify **Premium** accounts. Free users get nothing from a Spotify
  integration — a large fraction of players. Tiers 0/1 have no such gate.
- **External runtime dependency.** Tier 3 loads `sdk.scdn.co` at runtime — the first external script
  the game would pull in (everything else is bundled/self-hosted). It's user-opt-in, but it nicks the
  "self-contained" principle; worth a conscious decision, not a drift.
- **Token lifecycle in a single-page app:** PKCE tokens expire (~1h) and need silent refresh; state
  survives in localStorage. Modest but non-zero plumbing, and it's auth code we'd own forever.
- **Ducking is cheap and reusable regardless of tier:** src/engine-audio.js already owns a master
  GainNode and a gesture-gated AudioContext — a "music mode" that pulls game audio down (or mutes the
  engine drone above X km/h) is a small, tier-independent win and probably ships even under Tier 0.
- **Apple Music / others:** MusicKit JS exists but needs a developer token (backend-signed) — worse
  fit than Spotify PKCE. YouTube playback is against ToS. Spotify is both the most-requested and the
  least-bad streaming option; local files are the only truly universal one.

## Open design questions (the user's to answer)

- **Build it at all, or just document Tier 0?** Is bring-your-own-music worth the auth/maintenance
  surface, or does "we duck our audio, you play your own however you like" get 90% of the value?
- **Streaming vs. local files vs. both?** Local files (Tier 1) serve everyone with zero accounts;
  Spotify (Tier 2/3) is the frictionless dream but Premium-gated. Ship both? Just one?
- **Is Premium-gating acceptable** for a feature a chunk of players can't use?
- **In-tab playback (Tier 3) vs. remote-control (Tier 2)?** Playing through the game tab is the real
  "integration"; remote control is far less code and no external SDK.
- **Does an external streaming SDK belong in a project that prides itself on self-containment?**
- **Cheese check:** does an in-game "now playing" widget / Spotify branding enhance the drive or make
  it feel like a gimmick? (The user's own worry — worth a gut check with a mockup before committing.)

## Acceptance

Because this is exploration, "done" for the ticket is a **recorded decision**: the chosen tier (or an
explicit "Tier 0 only / won't build") plus provider. IF a tier past 0 is chosen, that tier's own
acceptance gets written then. Any built version must:

- Never autoplay or grab audio focus without a user gesture (browser policy + courtesy).
- Duck/pause cleanly on game pause / focus loss; not fight game audio (music-mode gain).
- Keep the no-backend constraint (PKCE only for any streaming auth; no secret shipped).
- Expose music volume / duck amount as USER-OWNED sliders, consistent with the audio params.
- Degrade gracefully for players who don't connect anything (the game is fully playable silent-of-
  their-music).

## Related

- FEAT-23 WebAudio engine drone — the AudioContext + master gain a music player would share
  (`src/engine-audio.js`); ducking hooks live there.
- The self-containment / no-backend constraints this must respect: CLAUDE.md "Constraints" +
  "Technology Stack" (single origin, no server, bundled/self-hosted assets).
