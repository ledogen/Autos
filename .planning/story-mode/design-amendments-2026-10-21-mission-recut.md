# Amendments — every mission type ranks on its own axis, 2026-10-21

*Written in the doc's ratification ritual so it can be folded in directly. Every **RULED** decision
below is the project owner's, from a design conversation held 2026-10-21. Wording is a proposal;
the decisions are not. Items marked **OPEN** carry a recommendation and are not decided.*

> **STATUS: FOLDED IN 2026-10-21.** DESIGN.md, missions.md and cargo.md carry these inline, and the
> buildable work is FEAT-138 to FEAT-142 plus a rewritten FEAT-114 (§13). This file is the provenance
> record and the fuller argument. One item stays open: Larry's reward pool (§7). If this file ever
> disagrees with DESIGN.md, **DESIGN.md wins.**
>
> **2026-10-22: §2b reverses the freight picker.** Freight is posted with its load; the player never
> picks it, and never sees a freight letter. §2b is folded into DESIGN.md. The owner answered three
> of its four questions the same day (§2b, end); Wholesale on freight stays open.

**This is a planning pass, not a build.** §13 is the ticket plan, sliced so each ticket can be built
on its own.

## The principle

**Rank is the career's core skill. The tip is speed.** Each mission type ranks on the one thing that
type is about. Every type tips on speed; papers also pay for accuracy. Missions feel different exactly where the
two pull in opposite directions: on fragile and haul, driving fast costs rank. The owner: *"the best
way to make missions feel different is to have players focusing on different things in order to
unlock the bonus rewards."*

| Type | Rank axis | Tip | Base pay |
|---|---|---|---|
| **Courier** | time vs par — unchanged | speed — unchanged | guaranteed — unchanged |
| **Haul** | **pieces delivered**, absolute counts | speed, scaled by pieces delivered | per piece delivered |
| **Freight** | **kg delivered**, absolute | speed, scaled by kg delivered | per kg delivered |
| **Fragile** | **remaining health** — unchanged | **speed** (was condition) | **half guaranteed, half × health** |
| **Papers** | **time, against a deadline**; the route ends at N customers | speed + accuracy money — unchanged | the fare |

## Summary

| # | Amendment | Status | Changes | Ticket |
|---|---|---|---|---|
| 1 | Haul ranks on the count delivered, on absolute thresholds per cargo | RULED | Replaces the shipped time + load blend (`haulGrade`) | FEAT-138 |
| 2 | Freight ranks on kg delivered; the player picks the load ("load what you dare"); S ≈ 125 % of the rated payload | RULED, **picker and visible letter reversed by 2b** | Freight is no longer a margin job; the time slack retires | FEAT-114, FEAT-138 |
| 2b | **Freight is posted, not picked (2026-10-22).** The load is the poster's. The kg tiers stay internal and only choose which items the load can carry. The bonus is earned on delivery. No freight letter anywhere the player looks. Deeds read the internal letter; loads stay as-built; light loads carry no item; heavy loads are to be designed | RULED (Wholesale on freight OPEN) | **Reverses** 2's "load what you dare", 5's freight picker and stock, 6's freight kg gate, 9's freight letter, 11's units | FEAT-114, FEAT-139; FEAT-140 cancelled |
| 3 | Every type tips on speed (papers also keep accuracy money) | RULED | **Reverses** haul's "no speed tip" (10-16) and fragile's condition tip (10-14) | FEAT-138 |
| 4 | Fragile base pay: half guaranteed, half × health | RULED | **Reverses** "condition does not cut the base" (10-15) | FEAT-138 |
| 5 | The giver has a limited stock; it can be below S. Wholesale is the rare big stock | RULED; **haul only since 2b** | Extends FEAT-114's picker to freight and caps it at the stock | FEAT-114 |
| 5b | Haul stock is bought at half the base pay per piece (2026-10-22) | RULED | Loading past S stops being free; an expired haul costs its purchase | FEAT-114 |
| 6 | Bonus gates print as a count or a weight, and roll only when the stock can meet them | RULED; **freight prints "on delivery" since 2b** | The gate mechanism is unchanged; only the card text and the roll condition change | FEAT-114 |
| 7 | Papers: a deadline returns, any N customers count, the time comes from the shortest route through N, the GPS draws it, the route ends at N | RULED | **Reverses** "no time limits" (09-30) for papers, and per-tier customer placement | FEAT-141 |
| 8 | The player may pick any unlocked paper route size | RULED | Larry posts more than the top rung | FEAT-141 |
| 9 | The HUD strip shows each type's rank axis **and** the live letter. Fragile adds a health bar and a combined-g bar | RULED; **freight shows no letter since 2b** | **Reverses** "no number on the HUD" for fragile and freight cargo | FEAT-139 |
| 10 | Giver traits, 0–2 per offer, bottom-left of the card | RULED | New. **There is no random pay roll today**, so traits add variety; they replace nothing | FEAT-142 |
| 11 | A bigger load is more units in the bed; indivisible loads keep their mass | RULED; **reversed by 2b: every freight load is as-built; FEAT-140 cancelled** | Freight loads are built as one mass each today | FEAT-140 |
| 12 | **Rank thresholds step by region, never by day.** The stock truck tops out around B/A in a region; that region's upgrades reach S | RULED | **Retires** the day ramp on the time thresholds (`rankThresholds(day)`); re-keys SM-INV-2's 08-01 amendment | FEAT-138 |

---

## 1. Haul — pieces delivered

**RULED.** Haul ranks on the number of pieces still in the bed at arrival.

- **Thresholds are absolute counts, set per cargo.** One table for every yard can't work: a firewood
  bundle is 11 kg, a board 2.7–5.6 kg, a quarry rock about 50 kg. So each haul cargo carries its own
  count for each letter.
- **The counts are pinned to the stock Ranger, never to the player's truck.** Offers stay the same for
  every vehicle (FEAT-112). A bed upgrade lets you carry more of a big stock, which is its reward.
- **Loading past S is the margin.** Pile more than the S count and you can lose a few and still rank S.
  That is the owner's point: *"Having more pieces does allow you to lose more and still get that high
  rank."*
- **Small stocks can't reach the top.** A job whose stock is under the S count can't be ranked S. Most
  jobs are like that. Wholesale (§10) is the signal that this one isn't.
- **The car problem is solved by capacity, not a ban.** A car can't lose pieces, but it can't carry
  enough of them to reach the upper counts either. No vehicle is barred from any reward.

**RULED:** S = a **brimming** stock Ranger bed (owner: *"it should be brimming for S tier — I bet you
could fit 22–26 pieces in the bed"*). The count is *measured* headless with the existing haul-load
harness (drop pieces until they settle brimming over the rails), with the owner's 22–26 firewood
bundles as the expected answer. A 85 %, B 70 %, C 55 % of that count, D below. This replaces the 10-16
text's guess of about 15.

## 2. Freight — kg delivered, load what you dare

> **Superseded in part by §2b (owner, 2026-10-22).** The player no longer picks the load, and the kg
> letter is no longer shown. The kg table below survives as the **internal** tier that picks the
> bonus item. The text is kept as history.

**RULED.** Freight ranks on the kg delivered. The giver has a stock, and the player loads as much as
they dare. Freight stays strapped (welded), so it can't lose cargo: **the rank is chosen at the dock,
and the job is surviving the drive with that load.**

**The S threshold sits past the rated payload, on purpose** (owner: *"sounds perfect"*). **The table
below is PROVISIONAL:** the owner starts here, play-tests it and signs it off. None of the unit cargo
it needs is built yet (§11). Against the
Ranger's FEAT-112 limits (570 kg soft, 820 kg hard, tire pops from 600 kg):

| Letter | Proposed kg | Share of the 570 kg rating | What the truck does |
|---|---|---|---|
| S | 712+ | 125 % | Warning band. Brake heat, bottoming on grades, slow climbs, a real chance of a popped tire on a big drop (0.9 m makes 44–53 kN against a 48–78 kN pop threshold at this load) |
| A | 570+ | 100 % | At the rating |
| B | 428+ | 75 % | Comfortable |
| C | 285+ | 50 % | Easy |
| D | below | — | |

- An S freight is **not** an overload: the 820 kg hard cap is 144 %. It is legal, and the physics
  decides what happens to it.
- **Stowed kit counts against the payload** (FEAT-122). A player carrying a lot of gear has less room
  before the hard cap.
- **The costs are all emergent:** brake heat, spring and tire wear (SM-3), slower climbs that eat the
  tip, and the delivery deadline. A crawling overload can miss its deadline and expire.
- **SM-INV-14 tension, accepted knowingly.** That invariant says points measure competence. On freight
  the letter is set at the dock, so the point is bought at accept and *kept* by driving: lose the job
  to a crash, a lost life or the deadline, and there is no point. The owner's framing of freight
  ("training for the boss") makes carrying an overload safely the competence being measured.

**Freight's existing knobs:**
- `FREIGHT_TIME_SLACK` (thresholds × 1.15) **retires.** Time no longer ranks freight.
- `FREIGHT_PAR_SLACK_PER_KG` stays. A heavier load still earns a longer par, so the speed tip reads
  fairly. Par and the deadline are now computed **after** the pick.
- `FREIGHT_TIP_MULT` (× 0.5) and `FREIGHT_PAY_PER_KG` **stay, as FEAT-69 balancing knobs**, not design
  rules (owner, tentatively).

## 2b. Freight is posted, not picked (owner, 2026-10-22)

**RULED.** The owner, verbatim:

> *"side note about freight missions. Fundamentally all we're changing is we're gating certain item
> rewards behind certain cargo sizes my original intention was somebody needs something shipped so
> they post a mission about it. That interferes with the freight picker mechanic. I think freight
> should just be posted and it should show you an item reward and it won't be gated behind a tier. It
> will just be gated upon completion. We can keep the tiers internal and use that to determine the
> logic of what items can be selected. But there's no reason to tell the player this is a B tier
> cargo. If you finish with B tier or better, you get a reward. We can just say finish the mission
> and get this reward. To the player, they just see the payload weight and the item and they make the
> judgment call. There isn't really a tier to the gameplay for us to give them a tier card at the end
> of the mission or anything since it's only evaluated binary delivered or not"*

**What it means:**

- **Someone needs a thing shipped, so they post it.** The load and its mass come from the offer. There
  is **no freight load picker** and no freight stock.
- **The kg tiers stay, but internal.** They decide which bonus items a load of that mass may carry. A
  heavy load can carry a better item. The §2 table (712 / 570 / 428 / 285 kg, still provisional) is
  now that item-tier table.
- **The player never sees a freight tier or letter.** The card shows the payload weight and the item.
  The bonus line reads *"Bonus: X — on delivery"*.
- **Freight is binary: delivered or not.** Strapped cargo can't be lost on the road, so the kg that
  arrives is the kg posted. Delivery earns the item. There is no letter on the HUD strip (§9) and no
  letter or tier on the result card.
- **Pay is unchanged:** base per kg + the speed tip (§3, §4). Because the load is known at posting,
  the card can quote **one Base pay number** again, not a rate (§4's rate stays for haul). Par and
  the deadline are set at posting, as before the picker.
- **Haul is not touched.** Haul keeps the player-picked count (FEAT-114), the count letter and the
  "deliver N+" gates.

**For the implementer:** the bonus gate can stay a letter inside. The offer only rolls a gate the
posted mass already meets, so `bonusEarned` is always true on delivery. Nothing new is needed there.

**Reverses:**
- §2: "load what you dare", and "the rank is chosen at the dock". The letter is now set by the
  poster, and never shown.
- §5: the freight half of the stock and picker. FEAT-114 is haul-only again.
- §6: freight's "400 kg+" gate text. Freight prints "on delivery".
- §9: the freight strip `Freight · 710 kg · S`. Freight shows no letter.
- §11: units and "the picker chooses the count". Every freight load keeps one as-built mass
  (answer 2 below).
- §12.14 for freight: deeds now read the internal letter (answer 1 below).

**The owner's answers (2026-10-22).** Three of the four questions are ruled; one stays open.

1. **Good deeds on freight — RULED: the internal letter.** Owner: *"use internal letter."* Freight
   deeds are `pointsFor(the internal kg letter)`: 1 at B+, ½ at C, 0 at D. The code already does
   this (FEAT-138). **The SM-INV-14 tension is accepted knowingly.** The point is now set by the
   posting you chose to take, not by a load you picked. missions.md reads SM-INV-14 as *"points are a
   measure of competence, not of the offer you happened to be given."* Choosing a heavy job and
   surviving it is the competence freight measures.
   - **By extension (not asked directly; flagged):** the "The right thing to do" trait's +½ at C or
     better reads the same internal letter on freight. A light (internal D) charity freight adds
     nothing.
   - *Options not taken:* a flat deed on delivery (would make bare completion progress); no deed
     from freight.
2. **FEAT-140, freight units — RULED: as-built.** Owner: *"as-built for now is simpler."* Every
   freight load keeps one as-built mass. Heavy internal tiers come from heavy loads, never from a
   bigger count. FEAT-140 (units, the bed stacker) is cancelled as superseded. "Visible load, real
   mass" holds, because each load is modelled at its real mass.
3. **Wholesale on freight (FEAT-142) — OPEN.** It was "a big stock at a lower rate", and freight has no
   stock now. Either it is haul-only, or on freight it means "a heavier posting at a lower rate per
   kg". FEAT-142 builds it haul-only until the owner rules. Recommendation: haul-only, the simplest.
4. **Light freight loads — RULED: no item is intended.** Owner: *"Yes, I've realized I need to design
   a bunch of heavy freight items and make this mission type truly about heavy weight. I just
   selected inappropriate loads before."* A load under 285 kg (internal D) carries no bonus item,
   under the 10-08 rule. **Freight's future is a roster of purpose-designed HEAVY loads.** §11's
   light-freight roster pass becomes "design heavy freight loads": owner-owned work, recorded in
   cargo.md (Rulings 2026-10-22). Each new load mints its own asset ticket.

## 3. The tip is speed on every type

**RULED.** Every type tips on the time line against par. Papers also keep their accuracy money (§7).

- **Haul and freight tips scale with the amount delivered.** Dumping half the load to race must never
  pay. This is the shape that already ships: pay is the time line × a load multiplier, so base and tip
  scale together.
- **Reverses** missions.md / FEAT-114 (10-16): *"pay = pieces delivered × the yard's rate, no speed
  tip."*
- **Reverses** FEAT-97 (10-14): *"Fragile's tip and bonus item are both earned by cargo condition, not
  by the clock."* Fragile's tension is now the cleanest of all the types: speed pays, and speed breaks
  the load.

## 4. Base pay

**RULED.**

- **Haul:** base per piece delivered. **Freight:** base per kg delivered.
- **Fragile:** half the base is guaranteed; the other half is × health. Destroyed (0 health) still
  fails the job and pays nothing. The owner: *"the cargo is always worth delivering as long as it's not
  destroyed."* **Reverses** DESIGN.md (10-15): *"condition does not cut the base — an item at 25 %
  condition wouldn't even be worth carrying."* The guaranteed half answers that objection.
- **Courier:** unchanged.

**Two consequences an implementer needs:**
- **Base pay is still × par.** DESIGN.md calls `parBase = k × par` load-bearing against farming tiny
  jobs. So "per piece" means the piece multiplies the par-based line; it is not a flat fee.
- **The offer card can't quote one guaranteed number** on haul and freight, because the load isn't
  picked yet. **RULED:** the card quotes a rate ("Base pay $0.40 a bundle"), and the
  picker shows the total as the count changes. *(2026-10-22, §2b: haul only. Freight's load is
  posted, so its card quotes one Base pay number.)*

## 5. Stock and the load picker

> **Haul only since §2b (owner, 2026-10-22).** Freight has no stock and no picker: the poster sets
> the load. Read "haul or freight" below as "haul".

**RULED.** A haul or freight giver has a limited stock. The player picks how much to load, from 1 up to
the smaller of the stock and the truck's hard limit. This extends FEAT-114 (haul quantity picker) to
freight and caps it at the stock.

- The stock is rolled with the offer, from its own seeded stream. An extra draw on the shared stream
  would shift every other offer (`offer-board.js` warns about exactly this).
- The load verdict (fits / warning / overload, FEAT-112) reads the **picked** load, not the offer.
- **RULED:** retire FEAT-114's limited-time yard rate bonus. Wholesale and Generous (§10) do the same
  job through one system instead of two.

## 5b. Haul stock is bought (owner, 2026-10-22)

**RULED.** The yard charges for every piece loaded, at **half the job's base pay per piece**. The
delivery pays per piece as §4 says.

- **Why:** §1 made loading past S the margin, but a spilled piece cost nothing, so once the picker
  existed the only sensible pick was "all of it". With a price, an extra piece pays for itself only
  if it arrives more often than price ÷ pay of the time: about 28–55 % depending on pace. Pieces in
  the well still almost always arrive; the ones mounded over the rail are the real trade, money for
  rank insurance.
- **Cheap on purpose.** A failed haul (or freight) already costs money: the hard hit or the rollover
  that failed it wore the truck. The owner: *"I don't want them to gamble $20 on a $30 mission because
  a failure there would be crippling."* At half base the purchase is a quarter of the S pay.
- **What it changes:** an expired or abandoned haul costs its purchase (it otherwise pays nothing). A
  piece that misses the bed at the yard was still bought, so bad parking costs too. The picker's top
  is min(stock, hard limit, what the wallet affords).
- **Freight is not bought.** Its overload already costs money in wear. (Haul's weight wears the truck
  the same way, through the bump stops, brakes and engine; the price is not a wear substitute, it is
  what makes the spare pieces a choice.)

## 6. Bonus items on haul and freight

> **Freight changed by §2b (owner, 2026-10-22).** A freight bonus prints *"— on delivery"*, never
> a weight. It only rolls when the posted load's internal tier meets its gate.

**RULED.** The bonus gate prints as a number: "Bonus: tie-down kit — deliver 10+" or "400 kg+". A bonus
only rolls when the stock can meet its gate.

- **No new mechanism.** The gate is still a letter, and `bonusEarned` still reads the letter. Since the
  letter now *is* a count or a weight, the card simply prints the threshold behind it.
- Courier and fragile gates are unchanged.

## 7. Papers — the deadline returns

**RULED.**

- **Every customer is deliverable.** The player serves any N of them. Per-tier customer placement
  retires.
- **The plotter** finds the shortest route through N customers from the start and allows that time plus
  a margin. That's a small travelling-salesman pick: choosing which N of the customers, and in what
  order. It's cheap at these sizes (the existing Held-Karp planner already handles 15 stops).
- **The GPS draws that route.** The player may ignore it.
- **The route ends at the Nth delivery.** Going past N was rejected: a tight cluster of houses would
  give an absurd, repeatable payout that is hard to guard against.
- **Rank is time.** S needs lots of time left. Finishing right at the deadline is the bottom of D.
- **The term is "deadline", never "bell"**, in text and code.
- **The player may choose any unlocked route size** (4, 9, …), not only Larry's top rung.

**How this fits the game-wide convention — RULED:** keep **par as the C/D line**, exactly as every
other type. The deadline is par × (1 + margin), and it is the end of D. So D
is the band between par and the deadline, which is what "barely before the deadline = bottom of D"
describes. With margin 0.5, S (≤ 0.77 × par) means arriving with at least 0.73 × par to spare.

**Pay — RULED:** papers keep the shape they have today. The fare's base is guaranteed, **the time tip
stays**, and accuracy money is banked per throw on top. The owner: *"Time needs to influence money
somewhere — if it doesn't influence base pay, then it can be included in the tip."*

**RULED:**
- **Unfinished at the deadline:** the round expires. Accuracy money already banked per throw stays;
  there is no fare, no letter and no ladder rung.
- **Ladder advancement:** a finished round at **B or better** earns the next rung.
- **Bonus items on papers:** none for now. Route-size choice ships without one.

**OPEN — Larry's reward pool.** Larry has no items to give because he has little character yet. The
owner wants him to provide something **no other POI does**, possibly related to spirits. That is a
character question for the opening and spirits notes (`opening.md`, `spirits-and-pacts.md`, which is
deferred and carries flagged conflicts), not for this amendment.
- **The HUD deadline is a clock time, never a countdown.** The deadline is par plus a margin, so a
  running countdown would be par by proxy, which SM-INV-3 forbids. The FEAT-87 boundary bar (no digits)
  carries the "how close am I" reading, exactly as it does for courier.

## 8. Fragile

**RULED.** Rank is remaining health: no change, `fragileGrade` already does this. Tip is speed (§3).
Base is half guaranteed, half × health (§4).

## 9. The HUD strip

**RULED.** The strip shows the rank axis for the job's type **and** the live letter.

| Type | Strip | Live warning |
|---|---|---|
| Courier | unchanged: the FEAT-87 boundary bar + letter | the bar itself |
| Haul | `Haul · 12 aboard · A` | `lose 2 → B` |
| Freight | ~~`Freight · 710 kg · S`~~ **§2b:** `Freight · 710 kg`, no letter | the due time (fixed while driving: freight can't lose cargo) |
| Fragile | health bar + letter | **a live accelerometer** |
| Papers | `Papers · 3/4` + the FEAT-87 boundary bar + letter | the bar; the due time as a clock time |

- **Reverses** FEAT-96 (10-10) *"No number describing the cargo on the HUD"* and FEAT-97 / missions.md
  (10-06) *"No HUD number. The sound and the blink are the only readouts."* SM-INV-10 itself is about
  parts and is not touched.
- **The fragile health bar is for now.** Later, damage should show on the cargo itself: texture and
  deformation (owner).

**The accelerometer — RULED: one vertical bar of the combined felt g**, with two marks: the cargo's
**damage threshold** and its **instant-destruction limit**. Fragile damage reads the *magnitude* of
the felt g, vertical included (floors 1.15–1.3 g; a 1 m crest lands at 4.6–4.8 g, while hard paved
cornering peaks around 0.6 g), so a flat 2D g-g circle would almost never show what breaks the load.
The bar reads the same scalar `fragile.js` already computes, so no chassis-frame vector is needed.

## 9b. No letter on haul or fragile; the threshold is named (owner, 2026-10-23)

**RULED.** *"Rank isn't important. We already told the player how much they're making per piece …
Rank is only important insofar as it determines if you get the item or not."* Haul, and then fragile
("fragile can drop the letter"), show **no letter anywhere**: not on the offer card, the slider, the
HUD or the result card. Freight was already letterless (§2b). The letter stays **internal**. It still
decides the bonus item (`bonusEarned`) and the good deeds (`pointsFor`, SM-INV-14).

- **The card names the threshold:** haul "deliver 18+ bundles", fragile "arrives 83%+ intact".
- **The top bar keeps only the run readout** ("2.39 km to go"). The load sits on its own line under it:
  - haul: "carrying 14 bundles / 18 for the item reward" (live);
  - fragile: two vertical bars instead of a line (owner, 2026-10-23 second pass). **DAMAGE** is the §9 felt-g
    bar, marked **1%** (where one hit costs 1 % of health) and **100%** (the break). **HEALTH** runs full green
    to empty red, with its percent under it. A posted reward shows to its right: "Reward [icon] if health ≥ 83%";
  - freight: "carrying 710 kg".
- **The fragile floors are whole percents:** 90 / 83 / 77 / 70 %, moved from 83.3 / 76.7. The card prints
  them, so a line the player reads as 83 % is exactly 0.83. They now live in `economy.js` `RANK_TABLE.fragile`.
- The §9 table's haul row (`Haul · 12 aboard · A` / `lose 2 → B`) and the "+ letter" on fragile's row are
  **superseded** by this section.

## 9c. Fragility tiers: named, and each with its own line, eased by route length (owner, 2026-10-23)

**RULED.**
- **One set of words everywhere: Very fragile / Fragile / Sturdy.** These were the code's GLASSWARE /
  DELICATE / STURDY (floors 1.15 / 1.2 / 1.3 g, breaks 4.0 / 4.75 / 5.5 g). The card's terms line names
  the tier: "2.4 km · Very fragile · 9 kg".
- **The tier moves the line (lever A).** "It is patently true that durable cargo is easier to deliver
  at 90% than fragile cargo is." Each tier has its own health lines in `RANK_TABLE.fragile`:
  - Very fragile: 80 / 72 / 64 / 56 %. PROVISIONAL.
  - Fragile: 90 / 83 / 77 / 70 %, the old single row.
  - Sturdy: 95 / 90 / 85 / 80 %. PROVISIONAL.
  The items on offer are unchanged; the harder cargo gets the easier line.
- **Route length eases the line.** Every line drops `fragileLinePerKm` (0.02, so 2 points per km,
  PROVISIONAL) per km of the planned route. *"The more ground you cover, the more likely it is for those
  events to occur."* A short route keeps the full line on purpose. Short routes are the most lucrative
  per minute, so they are the ones to guard hardest. The km is frozen with the route, so the card, the
  HUD and the result card read the same line.
- The card's clocks ("expires in …", "deliver within …") moved to their own row, because the one terms
  row overflowed the map card.

## 10. Giver traits

**RULED.** Traits replace the idea of a random pay roll. (The audit found no random roll exists today:
offer pay is deterministic, and the only noise on the board is ±30 % on offer expiry.) The owner: every
job pays the same dollars per kilometre right now, and traits are how one stands out.

- 0–2 traits per offer. Opposed pairs never appear together.
- Shown bottom-left of the offer card. The terms they change are visible on the card anyway.
- Each trait is a data row that nudges contract terms the job already has. No new systems.
- Every trait is a trade, except Generous and Stingy.

| Trait | Applies to | What it changes (recommended values, tuned in FEAT-69) |
|---|---|---|
| **Impatient** | all but papers | +20 % pay; tighter deadline; on courier, tighter time thresholds |
| **Patient** | all but papers | −20 % pay; looser deadline and thresholds |
| **Collector** | fragile | more pay; the cargo is more sensitive (damage floors × < 1, multiplied like FEAT-116, never added) |
| **Easygoing** | fragile | less pay; more damage-tolerant (floors × > 1) |
| **Generous** | all but papers | more pay |
| **Stingy** | all but papers | less pay |
| **Big tipper** | all but papers | less base, a bigger tip pool |
| **Wholesale** | haul, freight | a big stock, enough to fill the truck; a lower rate per piece or kg |
| **Off the books** | all but papers | more pay; **no** good-deed point and no reputation (FEAT-117) |
| **The right thing to do** | all but papers | less pay; an extra good-deed point |

"After hours" was rejected: it doesn't fit the delivery-deadline system.

**Collisions:**
- **Big tipper** names the tip on the offer card. **Reverses** DESIGN.md (10-15) *"the tip is never
  mentioned on the offer"*, at wording level. Accepted with the trait.
- **Off the books** and **The right thing to do** move good-deed points, which SM-INV-14 says are
  *"impossible to inflate"* and *"a measure of competence, not of the offer you happened to be
  given."* **RULED:** The right thing to do adds **½** a point on top of the job's own, and only at C
  or better. A deed is still earned by driving, and a good run on a charity job gives 1.5.
- **RULED:** that extra point counts toward FEAT-103's six-deed boss gate. A deed is a deed.

## 11. RULED — how a bigger load is shown

> **Reversed by §2b (owner, 2026-10-22): as-built.** There is no picker, and every freight load keeps
> one as-built mass (*"as-built for now is simpler"*). FEAT-140 is cancelled. The light-freight roster
> pass below becomes "design heavy freight loads" (§2b answer 4). "Visible load, real mass" stands.

The owner's question: modify the cargo's existing mass, or fill the bed with more and more cases,
boxes or pallets as the weight rises?

**RULED: units.** Almost every freight load is already built from units: 8 crates of
tomatoes, 18 bags of soil, 45 cinder blocks, 5 railway ties, 4 drums. So:

- **A freight cargo becomes a unit plus a count.** 36 kg concrete bags, 17 kg blocks, 43 kg crates of
  fruit. The picker chooses the count, and the mass is the count × the unit (+ the pallet).
- **The bed fills visibly.** Units stack in layers on the pallet or the bed floor, so a heavy load
  *looks* heavy. This keeps the cargo asset rule: visible load, real mass.
- **Indivisible loads stay as they are.** A job box, a single drum, a rug: they keep their as-built mass.
  They can't reach S, which is the same "not enough stock to rank" rule as haul. They are the honest
  small jobs.
- **Haul needs none of this.** It already drops N separate pieces.
- **It stays one contract.** "Packing the bed with several contracts" stays rejected (10-14). This is
  many units of *one* job's cargo.

**Why not just raise the mass:** it breaks "masses stay as built" (10-11), and a 712 kg load that looks
like a 365 kg pallet is a lie about what the truck is carrying.

**The cost:** a procedural stacker (a unit model, a layer grid, one weld per unit or per layer), and
unit definitions for each freight cargo. That is FEAT-140.

**The freight roster needs a pass inside FEAT-140** (owner): *"we'll have to drop all of the lighter-weight
freight cargo, because it's very undesirable, and I think I have a lot of it."* Loads like the empty
propane tanks (43 kg), the small crate (30 kg) or the eight tyres (105 kg) can't rank above D and pay
little. Each one is dropped, moved to courier, or turned into a unit cargo. That is decided per load
during play-testing, not here.

**A blocker either way:** every R1 freight load posted today is 30–365 kg, at most 64 % of the rating.
Only the cinder blocks (785 kg, an R2 load) clear S. **Freight ranks are empty until this is built.**

## 11b. The difficulty ramp is per region, never per day

**RULED (owner, 2026-10-21).** No rank threshold moves with the day, on any type. Thresholds step **by
region**. The progression the owner wants a player to feel:

> *"A player should see the progression of themselves going from struggling to get B or A rank to
> getting S rank because of the upgrades they made to their truck within the region. Then in region
> 2, they should go back to being a B or A freight player until they get the region 2 upgrades to let
> them do S freight."*

**Why the day ramp retires.** DESIGN.md gave it one job: the brake on pay that rose with the day (day
tier). Day tier left pay on 2026-10-14 (pay now grows with reputation, which is earned). A raise you
earn needs no brake. Count and weight also can't tighten by day: they are physical facts about the bed,
so a day-ramped count soon passes what the bed can hold, which is gating, not difficulty.

**How each type steps:**

| Type | What steps by region | What never moves |
|---|---|---|
| **Freight** | The kg thresholds. R1's S is 125 % of the stock rating (§2). R2's and R3's S sit past what the stock truck can legally carry, so S needs that region's upgrades that raise the FEAT-112 limits (springs, bed upgrades — FEAT-115). Numbers set at play-test | — |
| **Haul** | The count thresholds, through the cargo: there is one yard per region and each has its own cargo, so per-cargo thresholds are already per region. R1's S is a brimming bed. Later regions set S **past** brimming for the stock bed: the bet is to over-fill and lose some, unless you own the upgrade that holds the load | — |
| **Fragile** | The cargo: later regions post more sensitive items (lower damage floors) | The health thresholds for each letter |
| **Courier, papers** | Optionally, the time thresholds, slightly (owner: *"I could maybe see wanting to scale timing slightly as well"*). Tentative; R1 keeps today's day-1 values | par itself (SM-INV-2) |

**What still ramps by day:** costs (the in-run cost escalation, ratified 2026-07-29). That stays the
financial squeeze. Upgrades making S reachable is the designed reward, as SM-INV-2 already says: *"A
better car raises payout, not lowers risk."* The region step is what makes the next region hard again.

**Code:** `rankThresholds(day)`, `rankDayLate` and `rankTightenDays` retire. Thresholds become a table
keyed by type and region. Offers stay the same for every vehicle (FEAT-112): a threshold reads the
region, never the player's truck.

## 12. The owner's rulings on the open list (2026-10-21)

1. **Haul S** = a brimming stock-Ranger bed, measured; the owner expects 22–26 firewood bundles. A, B
   and C at 85, 70 and 55 % of it (§1). RULED.
2. **Freight letters** at 125 / 100 / 75 / 50 % of the 570 kg rating (§2). **PROVISIONAL:** the owner
   play-tests and signs off once unit cargo exists. *(2026-10-22, §2b: internal item tiers, never
   shown.)*
3. **Freight knobs** stay as FEAT-69 balancing knobs (§2). RULED, tentatively.
4. **The card** quotes a rate; the picker shows the total (§4). RULED.
5. **The yard rate bonus retires** in favour of traits (§5). RULED.
6. **Papers C/D at par**, deadline = par × 1.5 (§7). RULED.
7. **Papers pay keeps its time tip**, plus accuracy money (§7). RULED.
8. **An unfinished papers round expires**; accuracy money stays (§7). RULED.
9. **Ladder:** a finished round at B or better advances (§7). RULED.
10. **No papers bonus for now.** Larry's reward pool is OPEN, a character question (§7).
11. **The right thing to do:** +½ point at C or better, and it counts toward FEAT-103 (§10). RULED.
12. ~~**Units** for divisible freight;~~ *(reversed 2026-10-22, §2b: every load as-built)* indivisible loads keep their mass; a freight roster pass follows
    (§11). RULED.
13. **The difficulty ramp is per region, never per day** (§11b). RULED.
14. **Good deeds use `pointsFor(letter)` on every type.** The share and health bands retire. RULED.
    *(2026-10-22: freight has no player letter now; its deeds read the internal letter, §2b answer 1.)*
15. **A one-piece fetch** (FEAT-132's stranded motorist) ranks on time, like courier. The owner: a
    stranded motorist never gives a rare reward, so an easy rank there costs nothing. RULED.

## 13. Tickets (minted 2026-10-21)

All sit in SM-3's "Places and Missions" half. Build them in this order; each has its own acceptance
list.

| # | Ticket | Scope | Blocked on |
|---|---|---|---|
| 1 | **FEAT-138** scoring core | Per-type grades (count, kg, health, time); the region threshold table; the day ramp retires; the speed tip on haul, freight and fragile; fragile's half-guaranteed base; deeds through `pointsFor`; the one-piece fetch on time | — |
| 2 | **FEAT-114** (rewritten) stock + load picker + count gates | *(§2b: haul only; freight keeps only its "on delivery" bonus line.)* The giver's stock; the picker for haul and freight; the verdict on the picked load; par and deadline after the pick; the rate on the card; bonus gates printed as counts or kg, rolled only when the stock meets them; the yard rate bonus retires | FEAT-138 |
| 3 | **FEAT-139** the HUD strip per type | Rank axis + live letter on every type; the fragile health bar; the combined-g bar with its damage and destruction marks | FEAT-138 |
| 4 | ~~**FEAT-140** freight units~~ | ~~Unit cargo + count; a procedural bed stacker; the freight roster pass.~~ *Cancelled 2026-10-22 (§2b): loads stay as-built; the roster becomes "design heavy freight loads" (cargo.md).* | — |
| 5 | **FEAT-141** papers deadline re-cut | Any-N customers; the subset plotter; the deadline; end at N; route-size choice; the GPS route; the B-or-better ladder; "bell" → "deadline" | FEAT-138 |
| 6 | **FEAT-142** giver traits | The TRAITS table, its roll stream, the card's bottom-left slot, term changes at accept and settle | FEAT-138 |

**Gates that will move:** `economy`, `haul-load`, `rank-timer`, `paper-route`, `offer-board`,
`fragile-cargo`, `load-verdict`. `test/economy.mjs` also re-checks "the day, in plain words" under the
new base pay.

**Untouched:** courier, the deadline system (FEAT-113) apart from papers, the load verdicts (FEAT-112)
apart from reading the picked load, and SM-INV-4 (money is never a function of the letter): every pay
term above reads the count, the kg, the health or the time, never the letter.

## 14. Conflict register

Every earlier ruling this file touches. **R** = reverses a ratified ruling or shipped behaviour,
**A** = amends, **W** = wording only.

| Old ruling | Where | Date | § | Sev |
|---|---|---|---|---|
| Haul: "no speed tip" | missions.md:443; amendments-10-14:262; feat-114; MILESTONES.md:577 | 10-16 | 3 | R |
| Haul letter blends time and load (`haulGrade`) | par.js:452-489; main.js:3890 | 10-05 | 1 | R (code) |
| Haul pay "(Base + tip) × share still aboard" | missions.md:415; feat-88; cargo.md:18 | 10-04 | 1, 4 | A |
| Haul deeds on share bands, later the count target | feat-88; economy.js:305; missions.md:450; feat-114 | 10-05 / 10-16 | 12.14 | A |
| Per-yard hand-set haul rates | feat-114 | 10-16 | 1 | A |
| Yard rate bonus is where the rare haul comes from | feat-114; amendments-10-14:147 | 10-14 | 5, 10 | A |
| Picker offers 1 up to the hard limit | feat-114 | 10-14 | 5 | A |
| Single wheel+tire fetch counts as a haul load | feat-132 | 10-19 | 12.15 | A |
| Freight is a margin job; `pointsFor(letter)` on time | missions.md:426; DESIGN.md:959; feat-96 | 10-06 | 2 | R |
| Freight's generous clock (× 1.15) and half tip | missions.md:444; cargo.md:184; data/offers.js:394-416 | 10-11 | 2 | A |
| Freight is the safe player's lane | amendments-10-12; missions.md:455 | 10-12 / 10-16 | 2 | A |
| A modelled load is ONE number, as built | data/offers.js:29; cargo.md:166 | 10-11 | 11 | R if mass, A if units |
| Packing the bed with several contracts is rejected | missions.md:469; amendments-10-14:38 | 10-14 | 11 | A (boundary restated) |
| No number describing the cargo on the HUD | feat-96 | 10-10 | 9 | R |
| Cargo assets are "never a scoring axis" | CLAUDE.md; items.md:882 | — | 2 | W — this amendment *is* the design act that adds one |
| Fragile tip and bonus by condition, not the clock | feat-97; missions.md:442; DESIGN.md:967; economy.js:266 | 10-14 / 10-15 | 3 | R |
| Condition does not cut fragile's base | DESIGN.md:970; feat-97 | 10-15 | 4 | R |
| Base pay is guaranteed and quoted on the card | DESIGN.md:638-646 | 09-30 / 10-15 | 4 | A |
| Completion pays half the max | DESIGN.md:603; economy.js:11 | 09-30 | 10 (Big tipper) | A |
| The tip is never mentioned on the offer | DESIGN.md:646 | 10-15 | 10 | R (wording) |
| Fragile deeds on health bands | feat-97; economy.js:418 | 10-06 | 12.14 | A |
| Fragile: no HUD number, sound and blink only | feat-97; missions.md:423; cargo.md:202 | 10-06 | 9 | R |
| Fragile signal is vertical shock, not lateral g | missions.md:495 | 07-29 | 9 (the combined-g bar) | kept |
| Fragile: "flat rate; the cost is time" | missions.md:48, 492, 512 | 07-29 / 08-17 | 3 | A |
| Par is a C, game-wide, papers included | missions.md:336; DESIGN.md:491; paper-route.js:34 | 08-16 | 7 | kept, if ruling 6 passes |
| Papers rank on `ratio ÷ coverage` (`parEff`) | missions.md:277; paper-route.js:215 | 08-15 | 7 | R (code) |
| Deadline is a backstop, shown as a fixed time, never a countdown | DESIGN.md:472; feat-113 | 10-15 | 7 | R for papers (still a fixed time) |
| Papers HUD counts elapsed time up | missions.md:236; paper-route.js:907 | 09-29 | 9 | A |
| Rank timer writes no digits (gated) | feat-87; test/rank-timer.mjs | 10-01 | 7, 9 | kept |
| Ladder rung per PERFECT route | paper-route.js:69, 274; feat-paper-route | 08-05 | 7 | A |
| Customers decided at placement, per tier | paper-route.js:72-93 | 10-15 | 7 | R |
| Larry posts only the top rung | main.js:4087 | 08-05 | 7 | A |
| Papers never roll a bonus | feat-67; offer-board.js:757 | 09-26 | 7 | kept, until Larry has a pool |
| "Bell" throughout papers text and code | missions.md; paper-route.js; economy.js; main.js | — | 7 | W |
| No time limits on any mission | DESIGN.md (09-30 re-cut) | 09-30 | 7 | R for papers |
| Bonus gates are letters on the card | DESIGN.md:937; feat-67; data/offers.js | 09-26 / 10-08 | 6 | A (text only) |
| Bonus share 25 % on every source | feat-67; data/offers.js:446 | 09-26 | 6 | A |
| SM-INV-14: deeds are competence, impossible to inflate | DESIGN.md:766-798 | 08-01 | 2, 10 | A |
| SM-INV-2: the performance ramp lives in the thresholds | DESIGN.md:445; economy.js:210 | 08-01 | 12.13 | A |
| Offers are the same for every vehicle | amendments-10-14:69; feat-112 | 10-14 | 1 | kept |
| The freight mass menu needs ratification | feat-96; items.md:110 | 08-18 / 10-06 | 5, 2b | W — this ratified it; **§2b (10-22) narrows it**: the choice is between posted offers (each a fixed load), never a quantity at the dock |
| Courier's strip is described as a "countdown" | (conversation wording) | — | 9 | W — it is the no-digit boundary bar |
| Freight: the player picks the load ("load what you dare") | this file §2, §5; DESIGN.md; missions.md; feat-114 | 10-21 | 2b | R |
| Freight's letter is chosen at the dock and shown | this file §2, §9; feat-139; DESIGN.md SM-INV-14 amendment | 10-21 | 2b | R |
| Freight's bonus gate prints as a weight ("400 kg+") | this file §6; DESIGN.md bonus-gate amendment; feat-114 | 10-21 | 2b | R |
| Haul and freight quote a rate on the card | DESIGN.md SM-INV-4 card pair; this file §4 | 10-21 | 2b | A — haul only |
| Freight deeds via `pointsFor(letter)` | this file §12.14; feat-138; DESIGN.md SM-INV-14 amendment | 10-21 | 2b | A — the internal letter (owner 10-22); SM-INV-14 tension accepted |
| Freight is units; the picker chooses the count | this file §11; feat-140; cargo.md 10-21 rulings | 10-21 | 2b | R — as-built (owner 10-22); FEAT-140 cancelled |
| Light freight gets a roster pass (drop / move / unitise) | this file §11; feat-140; cargo.md | 10-21 | 2b | A — becomes "design heavy freight loads" (owner 10-22) |
| The bonus's earning rank is declared on the card | DESIGN.md (10-08 amendment) | 10-08 | 2b | A — freight declares "on delivery" |
