---
id: DEC-275
status: standing
decided: 2026-11-15
area: ui
governs: FEAT-215, FEAT-218, src/gps.js _placeUturn
supersedes:
---
# DEC-275: The U-turn arrow floats over the road, never tied to the truck

**Ruling.** "I don't want the U-turn arrow to be tied to the orientation of the truck at all I want it to float above the road a specified distance in front of the truck but always be floating above the center of the road at a fixed height up of the road." Built as: position = the route's centreline `ahead` m (default 20) ahead of the truck measured along the road; height = `hover` m (default 1.5) above the road surface there, constant (no bob); yaw from the road tangent only. Both are sliders in the debug GPS folder. Rule for "ahead": the arrow shows only when the truck faces against the route, so ahead is back down the route (route s minus `ahead`); with less than that behind the truck it clamps to the route's start, still on the road.

**Why.** The owner's look at the 11-14 redesign: the glyph followed the truck's heading in the fallback and bobbed; it must read as a road sign.

**Replaces.** The FEAT-215 redesign's fallback (standing on the line the truck points along when < 20 m of route is behind), the 0.2 m hover and the bob. (No earlier DEC record existed for it; the 11-14 inbox 2e5a ruling in FEAT-215 stays for the shape and the hide-when-correct rule.)

**Source.** Owner, card feat217-try, 2026-11-15. Owner's words.

(Reissue of DEC-274, word for word: that record was filed with an area the check does not know. Nothing in the ruling changed.)
