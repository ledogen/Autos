---
id: FEAT-213
type: feature
status: open — built and on main (0e5824bb); waiting on the owner's look (owed card feat213-look)
severity: minor
opened: 2026-11-13
source: owner, 2026-11-13 — the Google Doc "Cargame menus", its “Info text” section, copied below verbatim
relates: FEAT-212 (the menu that carries the (i) buttons), FEAT-34 / the diagnostics screen, FEAT-148 (authored lines), src/damage-screen.js, .planning/research/UI-STYLE.md
---
lane: B

# FEAT-213: Component info texts — the (i) buttons, reused in the shop and on vehicle diagnostics

## Next steps
BUILT on land/feat-213 (awaiting landing + the owner's look, card feat213-look). Open: the colour pair (component blue --accent-story, item orange --poi-text) and whether the shop shows (i) on every part.

## Summary
Eleven short explanations, one per component, written by the owner. They sit behind an (i) button in the auto shop and are reused wherever the component is described, such as vehicle diagnostics. Component and item names are coloured. This is also the tone the owner wants for menus, tips, prompts and hovers in general.

## Description
### The texts (owner's words; these are authored lines, do not rewrite them)
“Info text” (i) buttons: Reuse this text wherever applicable (i.e. the vehicle diagnostics menu). It would be nice if the components and items were highlighted in different colored text for clarity. This is also the tone i want to keep for the game menus, tips, prompts and hovers in general.

1) The tires are your only connection to the road (ideally). A worn tire will lose grip and be more vulnerable to puncture. Spinning your tires causes them to wear more quickly so keep a light touch. A punctured tire has little grip and wears very quickly so pull over and patch it or change it out for a spare immediately. A compressor can help you patch tires more quickly  
2) Wheels are damaged from impacts. Wear on your wheels will cause them to be out of round making them skip and bounce on the ground which is harder to control. Also, if you drive on a destroyed tire, the wheel begins to wear rapidly.   
3) Brakes are what bring you to a stop. The pads and shoes hold their stopping power for a while but below x% they get weaker rapidly.  
4) Springs are what support the weight of the truck and load. Springs wear from bottoming out your travel. Wear on your springs will cause the suspension to sag.  
5) Dampers are what resist rapid movements of the suspension. Dampers wear from sharp bumps and washboard roads. Wear on your dampers will cause the suspension to be more bouncy.  
6) The air filter cleans the air entering the engine. This makes your engine last longer so make sure to check its condition regularly. It functions well down to about x%  
7) The radiator cools the engine. For long steep uphills or heavy loads its important to have a radiator in good condition. It can be repaired with radiator stop leak  
8) The heart of your machine. As long as your air filter and oil are clean it should last a long time.   
9) The transmission lets you shift gears. If its worn out it takes longer to do a shift. It is damaged by shifting without pulling the clutch in.  
10) Headlights help you see at night. As they wear they get dimmer. They start flickering below x%. They can be repaired with zip ties  
11) Body panels protect you and the rest of your truck from impacts so keep them in good condition. They can be repaired with good ol’ duct tape and zip ties.

### Notes for the builder
- One table of texts in `data/`, read by both screens. No second copy.
- **Colour:** component names and item names in two different text colours, from the UI-STYLE palette only.
- **"x%":** each is a real threshold in the code (the brake fade knee, the air filter's working floor, the headlight flicker point). Fill them from the source and list them in this ticket.
- Texts 7, 10 and 11 name field repairs; they match the rules as of 2026-11-13 (radiator: stop-leak only; headlights: zip ties; panels: duct tape and zip ties).
- Text 8 mentions oil, which arrives with FEAT-202.

## Tracker
- [x] The eleven texts in one data table, verbatim
- [x] (i) buttons in the auto shop menu and on vehicle diagnostics read it
- [x] Component names and item names coloured differently
- [x] Every x% filled from the code, listed here

## Decisions
- Built 2026-11-14 (default taken, owner may overrule): text table `data/component-info.js` (verbatim, `[[component]]` / `{{item}}` markup); shop: an (i) "About" row opens inside each open part; diagnostics: the hover tip's explanation line is the text (the old one-line CONSEQUENCE stays for oil and alignment, which have no text). x% filled live from DAMAGE_PARAMS: brakes 50% (brakeKnee), air filter 20% (filterKnee), headlights 50% (headlightFlickerCond).
- 2026-11-13, owner: this is the tone for the game's menus, tips, prompts and hovers in general.

## Files
`data/` (new text table) · `src/service-screen.js` · `src/damage-screen.js`

## Log
- 2026-11-13: minted from the owner's spec by the orchestrator. Nothing built.
- 2026-11-14: built on land/feat-213, smoke 26/26 incl. a new (i) check; screenshot wip/feat-213/info-brakes.png. Diagnostics screen shows text on hover tip only.
