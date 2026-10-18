# Amendments — load verdicts, job deadlines, the camp pause, cargo protection, pay by reputation, 2026-10-14

*Written in the doc's ratification ritual so it can be folded in directly. Every decision below is
the project owner's, from a design conversation held 2026-10-12 and the owner's review on
2026-10-14. Wording is a proposal; the decisions are not. Items marked **OPEN** are not decided.*

> **STATUS: FOLDED IN 2026-10-14.** DESIGN.md, missions.md, items.md, cargo.md and run-shape.md
> carry these inline. This file is the provenance record and the fuller argument. If it ever
> disagrees with DESIGN.md, **DESIGN.md wins.**

**This is a planning pass, not a build.** Nothing here is implemented by it. Every buildable piece
is a ticket (FEAT-112 to FEAT-118, plus amendments to FEAT-69, FEAT-88, FEAT-91, FEAT-97 and
FEAT-104), and MILESTONES.md carries the build order so the next task can be picked off the list.

| # | Amendment | What it changes | Ticket |
|---|---|---|---|
| 1 | **One mission at a time, reaffirmed.** Carrying several contracts and packing the bed is rejected. | Nothing. Kills the multi-contract idea before it is ticketed. | — |
| 2 | **Load verdicts: fits, warning, overload.** Read from the current truck configuration, triggered by size or weight. Overload is a hard cutoff. | New. Replaces "overloads roll for everyone" with a per-truck rule. | FEAT-112 |
| 3 | **Bed upgrades are parts:** roof rack, flatbed, stake bed, extended (long) bed, light bar. Each is a function on the truck configuration. | New part class. SM-INV-15 holds: an upgrade is not a different vehicle. | FEAT-115 |
| 4 | **Mission-type scoring written up:** courier on time, fragile on cargo condition, haul on pieces still aboard, freight on a generous clock and heavy, well-paying loads. | Confirms the shipped shapes; fragile's tip moves to condition. | FEAT-97 |
| 5 | **Every job gets a delivery deadline**, set by the cargo: lax 1–3 days, chill 6 h–1 day, stringent 1–4 h. Missing it cancels the job and locks the giver. | New. A taken job has no deadline today. | FEAT-113 |
| 6 | **The mission clock runs on world time, through the night.** Camping does not forfeit the tip; it spends time against it. | Changes `elapsed`: today it counts only driving frames. | FEAT-113 |
| 7 | **Idle at camp, with the map open, no time passes** — a planning period. | Ratified 2026-08-02 (run-shape.md "The clock") and never built. | FEAT-118 |
| 8 | **The player picks the haul quantity**, inside the truck's verdict limits. Yards run limited-time rate bonuses. | Reverses the rolled 10–15 bundle count (FEAT-88, 2026-10-05). | FEAT-114 |
| 9 | **Straps are not an item.** FEAT-110 is closed. Straps stay as fiction on strapped loads. | Closes FEAT-110; strikes the items.md straps row. | — |
| 10 | **Cargo protection consumables:** bubble wrap, furniture pad, heavy-duty pad. Every effect is proportional to the item's own thresholds, never additive. | New items. Needs a `furniture` tag on cargo. | FEAT-116 |
| 11 | **Parts are priced by the furthest region unlocked**, and shops do not stock everything. | New pricing rule. Kills "go back to region 1 and buy it out". | FEAT-104, FEAT-115 |
| 12 | **Pay scales with work done, not with the day.** Day tier leaves pay. Costs keep it, and the difficulty knobs scale them. | Retires two ratified rules (below). | FEAT-117, FEAT-69 |
| 13 | **A simple regional reputation**, earned by good deeds in the region, shown as "Reputation ×1.xx" on the result card. | New. Replaces day tier as pay's growth term. | FEAT-117 |
| 14 | **Alpha run shape: three regions of about a week**, provisionally 7 / 6 / 5 days. | Supersedes 2026-10-12's ~12–14 days. | FEAT-69 |
| 15 | **Re-solve the region pay step for three regions.** | `regionMult` is still solved for six. | FEAT-69 |
| 16 | **Haul RULED 2026-10-16: scored on the count delivered, no speed tip, item on a stated count target.** Freight still OPEN. | Unblocks FEAT-114. | FEAT-114 |

---

## 1. One mission at a time

The multi-contract idea was: buy a flatbed, take three or four contracts, pack them anywhere on the
bed, and deliver them in any order. The owner ruled it out. A world where several jobs are held at
once wants a dense network where you hop between places. A world of one job at a time suits a
sparse network, which is truer to the game's theme. It also asks for less analysis, which the owner
sees as getting in the way of driving: *"it might just feel like the game becomes about min-maxing
and you spend more time in menus than actually driving."*

**Consequence, accepted knowingly:** a bigger bed never lets you take more jobs. It lets you take
the biggest jobs, the ones limited by size. FEAT-67's "one active mission" rule stands.

## 2–3. Load verdicts and bed upgrades

Every offer card shows one of three verdicts for the truck as it is configured right now:

| Verdict | Meaning | Can you take it? |
|---|---|---|
| **Fits** | Inside every limit | Yes |
| **Warning** | Past a soft limit: heavy enough to squat the truck, sticking out past the tailgate, or a loose load on an open bed | Yes, at your own risk. The physics supplies the penalty |
| **Overload** | Past a hard limit: too long or too wide for the space, or too heavy to carry at all | No |

**Both size and weight trigger it.** A 12 ft board (3.66 m) is an overload in a stock bed by size
alone; a roof rack or an extended bed is what makes it fit. Overhang past the tailgate is a warning,
not an overload, so a player may carry it anyway. A sensible place for the overhang warning is where
real road rules ask for a red flag on the load, about 4 ft behind the vehicle in most US states.

**Each upgrade is a function on the truck configuration.** An extended bed raises the length limit.
A flatbed widens the deck but has no sides, so a loose (haul) load is a warning on it: you may take
the job, and the load will spill. A stake bed sits between them. Suspension and load-rated tires
raise the weight limits. The verdict code never names a vehicle or an upgrade; it compares the
cargo's size, mass and form with the configuration's limits.

**Offers stay the same for every vehicle.** The seed decides the board. A different vehicle, or a
different set of upgrades, changes which offers read as fits, warning or overload. That limit is the
trade the player chose, and it is the same for a car player who meets a bed-only job as for a truck
player who meets 12 ft boards.

**Bed upgrades are parts** (items.md §3), in the same class as suspension and tires: bought mid-run,
lost on death. A long bed can be read as a DIY bed swap or as a bolt-on extension; either way it is
an upgrade, not a different vehicle, so SM-INV-15 holds. The bedliner and rubber bed mat (items.md
§7) are already in this family.

**Open, for FEAT-112:** the stock Ranger's soft and hard weight limits. Cinder blocks (785 kg) and
concrete (670 kg) roll today on the stock truck (the 2026-10-10 ruling). If the stock hard limit sits
below them, they become jobs you need upgrades for, which is items.md §1a's load budget. If it sits
above them, they stay warnings. The owner sets the numbers.

## 4. Mission-type scoring

| Type | What the tip and the bonus item reward | State |
|---|---|---|
| **Courier** | Time against par | Shipped (FEAT-89) |
| **Fragile** | **Cargo condition**, for both the tip and the bonus item (owner, 2026-10-14) | Changes FEAT-97 before it is built |
| **Haul** | Pieces delivered, as a count; no speed tip; the item on a stated count target (ruled 2026-10-16, §16) | FEAT-114 |
| **Freight** | A generous clock and heavy loads that pay well. Fast freight still tips, but the speed lane is courier | Shipped shape (FEAT-96: thresholds × 1.15, tip × 0.5, +3 % pay per 100 kg); the item is OPEN, §16 |

Freight's draw is that it gives you time, so you can go slowly and spare a heavily loaded truck.
The owner: *"We still want to reward fast freight drivers but the true speed demons should be doing
courier."*

## 5–6. Deadlines, and a clock that runs through the night

Two clocks, kept separate:

- **Board expiry** exists today. It decides when an offer leaves the board and when a slot refills.
- **The delivery deadline** is new. It starts when the job is accepted. It comes from the cargo, so
  each thing in `data/offers.js` carries a window, with family defaults:

| Band | Window | Examples |
|---|---|---|
| Lax | 1–3 days | freight |
| Chill | 6 h – 1 day | most jobs |
| Stringent | 1–4 h | takeout, perishables |

A job still in hand when its deadline passes is cancelled, and the giver's slot locks under the
existing lock rule (data/offers.js, 2026-10-07). The card shows the deadline, so the player can tell
before accepting whether a night's sleep fits inside it.

**The mission clock runs on world time** (owner, 2026-10-14): *"camping doesn't automatically
forfeit your tip, it just burns time and challenges it. Simpler, and it makes sense from a customer
point of view."* Today `elapsed` counts only driving frames, and a sleep skips ahead without adding
to it, so a tip survives a night untouched. FEAT-113 changes that.

**What it does in practice.** The average region-1 job has a par of 180 s, which is 3 game hours. An
8 h night adds 480 s, so the ratio passes 2.7 and the tip (which runs out at 1.23) is gone. On an
average job, camping with the load means base pay. Only long jobs keep some tip through a night.
That is the "camp with a load, still get paid" opportunity from 2026-10-12, reached through the
customer's clock rather than a rule:

> *"Hey, I need to sleep tonight. I want to get over there to grab that cool mission. I might as
> well take this available mission because I can camp with it and I'll still make a little extra
> money by delivering it before I go pick up the mission I actually want."*

This supersedes DESIGN.md's 2026-07-19 wording that "short, perishable ones die overnight": the
deadline is now how a job dies overnight, and every job has one.

## 7. The camp is a planning pause

*"Players need spaces where the clock doesn't tick, otherwise the game is a mad rush slogfest for
hours straight."* Idle at camp with the map available, no game time passes. This is run-shape.md's
ratified 2026-08-02 rule (shops, service stations and camp pause the clock until you take an action;
the map is reachable from each). FEAT-104 already carries it for the shop. Nothing carries it for
camp, so FEAT-118 does.

## 8. Haul: the player picks the quantity

*"Lets the car players and the truck players both party."* At the yard the player chooses how many
pieces to load, inside the truck's verdict limits: past the soft limit is a warning, past the hard
limit is refused. This reverses the 2026-10-05 rolled count (`HAUL_BUNDLES`, "a range on purpose").

**The juicy offer comes from the rate, not the count.** A yard runs a limited-time rate bonus, a
higher pay per piece for a window, so a good haul is still a rare and exciting opportunity, and one
offer serves a car, a stock truck and an upgraded truck equally.

## 9. Straps

Straps do not work as an item. Rocks and firewood bundles cannot be strapped, and haul's chaos is
the point: *"what I really like about the haul missions is the chaotic nature of the physics and how
it is emergent gameplay."* An item you hold at one giver and lack at the next would also feel
arbitrary. So FEAT-110 (ratchet straps for haul) is closed, and straps stay as fiction on the
strapped families (freight, fragile). The idea of straps as a paid gate on fragile work is recorded
in IDEAS.md as unratified.

## 10. Cargo protection

**Every effect scales the item's own numbers.** Fragile prices each hit against two per-item
thresholds, `shockFloorG` and `breakG` (FEAT-97). A protection item multiplies them, or multiplies
the health a hit costs. It never adds a flat amount, so a vase and a piano are each protected in
proportion to how fragile they already are.

| Item | Uses | Works on | Effect |
|---|---|---|---|
| **Bubble wrap** | 1 | any fragile item | high threshold increase |
| **Furniture pad** | 3 | items tagged `furniture` | low threshold increase and low damage reduction |
| **Heavy-duty pad** | 3 | any fragile item | medium damage reduction |

"Threshold increase" multiplies `shockFloorG` (and `breakG` with it): small knocks are absorbed
completely, and a big hit still breaks the item. "Damage reduction" multiplies each hit's health
cost. The figures are open. The `furniture` tag goes on the dining chairs, the dining table, the
full-length mirror, the wardrobe and the piano (cargo.md § Fragile).

## 11. Parts pricing and availability

**A part's price follows the furthest region you have unlocked, not the shop you stand in.** Where
you are decides what is for sale; how far you have come decides what it costs. A player who goes
back to region 1 cannot buy out its shop for pennies, and a region-1 part is not trivial for a
region-2 player. The fiction is plain inflation.

**Finding upgrades is part of the challenge.** A shop does not carry every upgrade, and upgrades
also come as infrequent mission rewards. Lower-tier parts stay in the later pools (a player may
still want that bedliner), at the later price. FEAT-104 is minimal and has no stock; stock lands
with FEAT-115.

## 12–13. Pay grows with work; costs grow with the day

| | Grows with | Note |
|---|---|---|
| **Pay** | region step × reputation | `dayTier` leaves pay entirely |
| **Costs** (gas, repairs, upkeep, parts) | `dayTier` | The 2026-10-12 difficulty knobs (damage, gas, upgrade/item costs) scale this growth |

**Retired by this:**

- *"Accept at 1 a.m., buy tomorrow's rate"* (the reason `dayTierTable` steps per day). There is no
  tomorrow's rate on pay any more.
- *"Tips must not lose their value"* as worded on 2026-09-30, where the tip rode `dayTier`. The tip
  still holds its share of the max; the max now rides the region and reputation instead.

**Why.** Inside a region, costs climb every day and pay climbs only as you work. A working player
stays afloat for most of the region. Money gets tight toward its end, and moving on is the release.
A player who parks and waits gains nothing, because waiting raises costs and leaves pay where it was.
This answers the worry that pay should reflect *what* you do, not *when* you do it.

**Reputation, kept simple.** Each region has one reputation, earned by good deeds there (the mission
points the economy already tracks: 1 at B or better, ½ at C). It is capped, and it starts over in
each new region. The result card shows it as "Reputation ×1.xx". **The cap must sit below the region
step**, so a new region's starting pay always beats the old one at full reputation, and moving on is
always a raise. Reputation per job type and per customer were considered and rejected: the first
rewards narrow min-maxing and doubles up on bed upgrades, and both cost far more to build and to
explain.

**Sizing it.** Take a good day's pay on arrival in a region as 1. Costs on arrival are `c₀` of that,
and grow by `g` a day. A good day's pay can grow to `repCap`. The region stops paying for itself
after about `ln(repCap / c₀) / ln(g)` days. Costs ride the run's day, not the day inside the region,
so a later region's `c₀` already carries every day spent before it: the region step has to cover
that growth as well as being a raise. FEAT-69 solves `c₀`, `g`, the cap and the step against the
7 / 6 / 5 shape.

## 14–15. Run shape and the region step

**Alpha targets three regions of about a week each, provisionally 7 / 6 / 5 days** (18 days). The
owner floated the shrinking shape as possibly better than 7 / 7 / 7. This supersedes 2026-10-12's
~12–14 days. The authored point and day budgets were already owed a re-cut (DESIGN.md open
question 2), and this sets its target.

`regionMult` is `[1.0, 1.6, 2.7, 4.4, 7.3, 12.0]`, solved for six regions. Re-solve it for three in
FEAT-69, against the reputation cap (§13).

## 16. OPEN — the tip and the bonus item on haul and freight

The owner's question: if courier tips for speed and gives its bonus item for speed, should every
other type use its own criteria? Fragile is decided (condition, §4). Haul and freight are not.

**The haul problem.** A full 15 of 15 bundles delivered is hard and earns a good reward. A car player
can only load 8 and can't afford to lose any. Fixed rewards suit fixed cargo; haul's cargo is now
the player's choice.

**Recommendation, not ruled: the load sets the pool, the driving earns it.**

- **Haul.** The tip is speed × share aboard, as pay already works. The bonus item is earned by the
  **share** aboard (8 of 8 counts the same as 15 of 15), and the size of the load picks **which
  pool** it comes from. The car player earns a reward; the 15-bundle truck earns from a better pool.
- **Freight.** The tip stays speed on the slackened clock. The bonus item is earned by **arriving
  without a heavy hit to the truck** (the truck is freight's fear), and the load's mass picks the
  pool.

Alternatives the owner raised: haul on a combined score (pieces aboard and speed), and freight on
pure completion with heavy loads gating the better rewards, or a lesser pool. Needs a ruling before
FEAT-114 and before freight's bonus item is wired.

**Haul RULED (owner, 2026-10-16) — the recommendation above is superseded.** The owner's objection:
a car can't lose a haul piece, so on a share it always earns the item; only its capacity holds it to
a lesser pool. The ruling scores the **count delivered**:

- **Pay** = pieces delivered × the yard's per-piece rate. **No speed tip**: haul is decoupled from
  courier, and the job's deadline (FEAT-113) is its only clock.
- **Bonus item** = a delivered-count target stated on the offer ("bring 12 for the item"). The target
  sets the rarity. A car caps at 8, so it chases low targets and gets them reliably; a truck chasing a
  high target loads extra for margin, toward its soft limit, and has to keep it aboard.
- Hauling in a car is safe, low-yield work by design. A car career's driving skill is courier.
- *Option B, not ruled:* the item on throughput across the yard's rate-bonus window.

- **Good deeds follow the count target too** (owner, 2026-10-16), replacing the share bands.

**Freight's bonus-item POOL, ruled 2026-10-16 (owner).** Freight is **the trucker role**: it rewards
the slow-but-sturdy build.

- **Pool:** bubble wrap, furniture pad, heavy-duty pad (the fragile protection items, included on
  purpose to encourage cross-specialisation); rubber bed mat and bedliner; **standard-duty** springs,
  tires and dampers (fitted parts installed at a service station, not the spare tire); heavy-duty
  anti-roll bars; extended bed, flatbed, stake bed, roof rack; heavy-duty radiator.
- **Super-rare tier:** heavy-duty springs, dampers and tires.
- Tiers for the rest are not yet set. **What earns** the item is still open (recommendation on
  record: arriving without a heavy hit to the truck, the mass picks the pool).
- Today `REWARDS` pools by **source POI**, not by mission family; a family pool is a new axis. The
  owner wants **a separate conversation on mission rewards in general**: the major categories, and
  how much they overlap and cross-pick. Build no freight pool before it.
