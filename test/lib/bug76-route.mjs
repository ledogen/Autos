// BUG-76 fixture: the owner's free-roam route on seed "w" (autos-capture-1790494688182.json's
// stream-centre history, rounded to 1 m), ending beside the mark (245.24, 603.59) where a
// window-dependent T promotion flips the road 0.6 m. Driving it at the Normal-quality road radius
// (320 m) reproduces both the flip and, before the fix, the stale carve. Shared by
// adopt-reconcile.mjs and road-flip-distance.mjs so the route is stated once.
export const BUG76_SEED_STRING = 'w'
export const BUG76_MARK = { x: 245.24, z: 603.59 }
export const BUG76_ROUTE = [[-124,-34],[-133,-21],[-142,-7],[-151,7],[-160,21],[-168,35],[-177,49],[-186,63],[-193,78],[-199,93],[-205,109],[-211,124],[-218,140],[-224,155],[-230,171],[-236,186],[-243,201],[-249,217],[-255,232],[-262,248],[-268,263],[-282,272],[-290,287],[-293,303],[-284,318],[-275,333],[-271,349],[-270,368],[-260,381],[-244,382],[-229,388],[-213,390],[-197,392],[-181,396],[-166,400],[-151,407],[-137,416],[-125,426],[-114,439],[-104,451],[-94,464],[-84,476],[-75,490],[-65,503],[-56,516],[-46,529],[-36,542],[-26,555],[-16,568],[-7,581],[3,594],[13,607],[23,619],[33,632],[43,645],[53,657],[64,669],[78,677],[94,681],[110,679],[125,672],[139,664],[152,655],[165,646],[178,636],[192,627],[205,618],[219,610],[234,604]]
