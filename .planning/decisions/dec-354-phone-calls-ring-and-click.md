---
id: DEC-354
status: standing
decided: 2026-11-16
area: story
governs: FEAT-229, DEC-353, src/dialogue.js, data/dialogue.js, phone calls, PHONE, FIRING, MOM_CALL, LARRY_CALL, RUN_INTRO, tut-picnic, tut-gas, tut-ranch, tut-vibe, tut-morning, Katie, mom, Larry
supersedes:
---

# DEC-354: A phone call rings first and ends on "<click>"; a talk in person has neither

**Ruling.** Owner, card tutorial-test-drives, 2026-11-16 (DEC-353): "We should also frame phone calls a little bit better.
Maybe a card that just says phone and then ring ring ring text. Then every dialogue that ends with the character on the
phone should end with "<click>"". As built: one mechanism in the dialogue system (`DialogueSystem._frame`), not typed per
script. A card said over the phone carries `phone: true` in data/dialogue.js; each run of them is framed by a card from
`Phone` reading "Ring ring ring" before it and a card in the caller's name reading "<click>" after it. `answered: true`
on the first card drops the ring (the call was already going); `holds: true` on the last drops the click (the caller stays
on the line into a later script). The calls: the firing's Katie (already on the line, so no ring; the click before the
manager), mom's call (with FEAT-184's key card now its last card, so the click follows the key), Katie's picnic call at
Larry's, mom's gas call (ringing, held through the fill-up, hung up by her send-off), Katie's arrival call at the ranch
(held through the hunt, hung up after the vibe cards), Katie's morning call, and Larry's call (LARRY_CALL; RUN_INTRO on a
skip). In person, no frame: mom at her door, Larry at his house, the manager, Katie at the camp (DEC-347).

**Why.** Without a frame the player could not tell a call from a talk in person.

**Replaces.** Nothing. [The agent's reading] Mom's in-drive lesson cards (the pedals, the flat, the damage screen, the
spare, the tow, the shop, the headlights, the parking) stay unframed, as the tutorial's voice; whether they are calls is
open on FEAT-229.

**Source.** DEC-353 (ledorepo `answered/tutorial-test-drives.answer-2026-11-16b.json`).
