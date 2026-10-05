// Word lists for the mission board's generated names (FEAT-67). Data only — no logic, no imports.
// OWNER-AUTHORED: these lists are the owner's to fill. Code only supplies the grammar and the
// seeded picks, so adding a word here changes what can appear and nothing else.
//
// Every pick is seed-driven and fixed for the run once rolled. Duplicates in a list just make that
// word more likely — handy for weighting, but usually a typo.
//
// ── THE GRAMMARS (ruled 2026-09-26) ─────────────────────────────────────────────────────────
//
// PERSON:   [firstname] "[nickname]"? [lastname]
//           Sex is rolled first (male / female) and picks the first-name list — and, later, the
//           portrait pool. The nickname is optional; NICKNAME_CHANCE sets how often one appears.
//           → Deb Hadley · Earl "Two-Tone" Pruitt
//
// POI NAME, two forms (which form a source uses is set per source in data/offers.js):
//   owned:  [person firstname]'s [adjective]? [business type]
//           → Deb's Burgers · Earl's Honest Tires
//   plain:  ["The"]? [adjective]? [business type / pseudonym]
//           → The Meatball · Big Mart · Cheese
//   Business types are per source (BUSINESS_TYPES below), so a burger joint never rolls "Tires".
//
// PLACE (mid-road destinations that aren't a POI) — PROPOSED, not yet ruled:
//           the [lastname] [place noun]  |  [landmark]
//           → the Hadley farm · the Pruitt place · Mile 4 pullout

// ── People ──────────────────────────────────────────────────────────────────────────────────

// A person is rolled as male or female FIRST; the first name then comes from that list. The same
// field will pick the character portrait (RPG-style picture, not built yet) from the matching pool,
// so a name and its picture always agree. Last names and nicknames are shared.
export const FIRST_NAMES = {
    male: [
        'Earl', 'Dale', 'Vern', 'Alec', 'Jon', 'Dan', 'Danny', 'Davis', 'Dave', 'Daniel', 'Mikia', 
        'Tyler', 'Trey', 'Dustin', 'Jonathan', 'Theo', 'Josh', 'Theodore', 'Eric', 'Erik',  
        'Brandon', 'Mike', 'Marlow', 'Mat', 'Matt', 'Matias', 'Christian', 'Chris', 'Cam', 'Cameron',  
        'Abel', 'Cain', 'Abra', 'Tom', 'Thomas', 'Tommy', 'Tobias', 'Will', 'William', 'Wilbur', 
        'Warren', 'Adam', 'Bob', 'Billy', 'Brent', 'Alfredo', 'Eugene', 'John', 'James', 'Jack', 
        'Jake', 'Jacob', 'George', 'Ryan', 'Bryce', 'Cory', 'Andrew', 'Brian', 'Forest', 'Henry',
        'Kevin', 'Gilbert', 'Stephen', 'Joel', 'Ken', 'Kam', 'Pete', 'Steve', 'Stan', 'Rolph',
        'Alabaster', 'Atlas', 'Elias',
        'Idris', 'Otis', 'Clyde', 'Merle', 'Lyle', 'Cletus', 'Rusty', 'Hank', 'Floyd', 'Dwayne', 'Virgil'
    ],
    female: [
        'Deb', 'Lorraine', 'Marlene', 'Nicole', 'Nikki', 'Chelsea', 'Sandra', 'May', 'Mae', 'Millie', 
        'Mary', 'Anabelle', 'Alice', 'Abra', 'Allie', 'Brianna', 'Bree', 'Barbara', 'Bonnie', 
        'Cassandra', 'Connie', 'Cassie', 'Cory', 'Doris', 'Dani', 'Darlene', 'Myleen', 'Eunice', 'Fanny', 
        'Fatima', 'Felicia', 'Gaby', 'Gertrude', 'Haifa', 'Horum', 'Belle', 'Betty', 'Iris', 'Janet', 'Jenny', 'Jessica', 'Jen', 'Molly', 'Jill', 'Kamilah', 'Karen', 'Liz', 
        'Lizzy', 'Lia', 'Leah', 'Nancy', 'Natalie', 'Nat', 'Olma', 'Penelope', 'Pia', 'Korrin', 'Corina',
        'Stacy', 'Stephanie', 'Kennedy', 'Sally', 'Rebecca',
        'Wanda', 'Opal', 'Loretta', 'Maybelle', 'Tammy', 'Rhonda', 'Dottie', 'Pearl', 'Irma', 'Ruby', 'Velma'
    ]
}

/** 0..1 — share of generated people who are female. */
export const FEMALE_CHANCE = 0.5

export const LAST_NAMES = [
    'Hadley', 'Pruitt', 'Baker', 'Black', 'White', 'Halifax', 'Jenkins', 'Jones', 'Hamilton', 'Trask', 
    'Hatfield', 'McCoy', 'McGill', 'MacDonald', 'Adler', 'Brown', 'Ghavam', 'Palacios', 'Cruz', 'Opitz',
    'Bloomsfield', 'Blume', 'Blane', 'Comey', 'Dob', 'Nob', 'Pod', 'Fink', 'Heinz', 'Smith', 'Perlman', 
    'Marcon', 'Gonzalez', 'Martin',
    'Pickett', 'Tuttle', 'Crenshaw', 'Boggs', 'Whitlock', 'Scruggs', 'Haggard'
]

/** Written without the quotes — the renderer adds them. */
export const NICKNAMES = [
    'Two-Tone', 'Bud', 'Doc', 'Princess', 'Double-Dutch', 'Pappy', 'The Evil', 'The Good', 'Skeevy', 
    'Primus', 'Terrible', 'The Strong', 'The Wicked', 'Lean', 'Mean', 'Slippy', 'Baguette', 'Frog', 
    'Gangly', 'Yellow', 'Squeevy', 'The Juice', 'Squawk', 'Lil', 'The Wise', 'Hold-Up',
    'Tater', 'Gravel', 'Two-Stroke', 'Biscuit', 'Knuckles', 'Sweet Tea', 'Lugnut', 'Catfish', 'Mud Flap', 'Buckshot'
]

/** 0..1 — share of generated people who get a nickname. */
export const NICKNAME_CHANCE = 0.15

// ── POI names ───────────────────────────────────────────────────────────────────────────────

/** The optional [adjective] slot in both POI-name forms. */
export const POI_ADJECTIVES = [
    'Big', 'Honest', 'Little', 'Honorable', 'Frugal', 'Extravagant', 'Placated', 'Slippery', 'Tasteful',
    'Awful', 'Pleasant', 'Humble', 'Nice', 'Plain', 'Good Old-Fashioned', 'Epic', 'Neat', 'Pitiful',
    'Questionable', 'Chill', 'Jolly', 'Weird', 'Mundane', 'Independent', 'Incredible',
    'Reliable', 'Famous', 'Genuine', 'Discount', 'Family', 'Original', 'Lucky', 'Allegedly Fresh'
]

/** 0..1 — how often the optional slots fill. */
export const POI_ADJECTIVE_CHANCE = 0.4
export const POI_THE_CHANCE       = 0.5   // plain form only

/**
 * [business type / pseudonym] per source — keyed by the POI roster type (src/poi.js POI_ROSTER).
 * Mix plain descriptions ("Burgers") with pseudonyms ("The Meatball") freely; both fill the slot.
 */
export const BUSINESS_TYPES = {
    // FEAT-88/91 haul yard. PLACEHOLDERS — owner authors names.
    firewoodYard: ['Firewood', 'Cordwood', 'Wood Lot', 'Splitting', 'Logs', 'Wood Yard', 'Kindling'],
    burgerJoint:  ['Burgers', 'Meatball', 'Sandwich', 'Subs', 'Pie', 'Pizza', 'Ice Cream', 'Bakery', 
        'Bite', 'Restaurant', 'Deli', 'Brew', 'Sweets', 'Crust', 'Pickles', 'Brews',
        'Diner', 'Grill', 'Smokehouse', 'Fry Shack', 'Dogs', 'Tacos', 'Donuts', 'Chili'
    ],
    generalStore: ['Market', 'Mart', 'Shoppe', 'General Store', 'Goods', 'Wares', 'Emporium', 'Shop', 
        'Stop', 'Corner', 'Place',
        'Supply', 'Feed & Seed', 'Trading Post', 'Five & Dime', 'Outfitters'
    ],
    serviceShop:  ['Tires', 'Auto', 'Garage', 'Service', 'Maintenance', 'Pit-Stop', 'Wheels',
        'Lube', 'Body Shop', 'Muffler', 'Towing', 'Salvage', 'Radiator'
    ],
}

// ── Places (proposed grammar — see header) ──────────────────────────────────────────────────

/** The [place noun] in "the Hadley farm". */
export const PLACE_NOUNS = [
    'farm', 'place', 'ranch', 'house', 'court', 'corner', 'orchard', 'barn', 'field', 'acres',
    'homestead', 'estate', 'cabin', 'hollow', 'quarry', 'dairy'
]

/**
 * Stand-alone landmark names for road-side drop points. `#` is replaced with a small number.
 * BELIEVABLY EMPTY (owner, 2026-09-26): picked at random for any stretch of road, so a name must
 * not promise an object that won't be there — "the dead tractor" with no tractor breaks the spell.
 */
export const LANDMARKS = [
    'Mile # pullout', 'the rendezvous', 'the drop point', 'the marker', 'marker post #',
    "Jim's spot", 'the rest stop', 'the pullout', 'the gravel pit', 'the county line',
    'the wide spot', 'the turnaround', 'the halfway point', 'the usual spot', 'the meet-up',
    'the bend', 'the flats', 'the switchback',
]
