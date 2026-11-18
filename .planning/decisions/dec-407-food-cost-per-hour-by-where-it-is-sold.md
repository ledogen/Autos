---
id: DEC-407
status: standing
decided: 2026-11-17
area: economy
governs: food-1117, FEAT-250, FEAT-260, data/items.js, data/shop-stock.js, food, DEC-388, DEC-377, DEC-293, DEC-390, DEC-380
supersedes:
---

# DEC-407: Food costs per hour of satiety by where it is sold: groceries cheapest, the gas station worst

**Ruling.** "Drop peanuts to be in line with the rest of the food prices. Some food needs to be objectively better than other food. allow +100% - 30% on the .35 cost/hr figure. That means groceries should have a lower cost per hour than other food because it requires the player to invest time. Food at the food vendor should Have relatively high satiety but relatively high cost. Food at the grocery store is going to be relatively low satiety but also low cost/hr except for cookable items which will be higher satiety low cost but require the cooking act. Gas station snacks should be the worst deal of the bunch and none of the items should have exceptional satiety. Your proposed additions are approved but rebalance the cost per hour as outlined above."

Readings (the lane's): the band is $0.245 to $0.70 an hour (0.35 less 30 %, 0.35 plus 100 %). Cookables (potato, can of beans, groceries; priced by the meal they cook into) are $0.25; grocery-store staples $0.27 to $0.33, at most 5 h each; food vendor $0.50 to $0.60, 8 h and up; gas-station snacks $0.67 to $0.70, at most 5 h. The five proposed foods (beef jerky, apple, breakfast burrito, can of beans, fried chicken bucket) are built. test/inventory.mjs holds the band and the order.

**Why.** One flat $0.35 line made every food the same deal. A choice needs a better and a worse: time spent (cooking) or a trip (the vendor) buys a cheaper hour or a longer one; the gas station's convenience costs most.

**Replaces.** DEC-388's single $0.35 an hour level becomes the centre of a band, $0.245 to $0.70 (-30 % / +100 %); DEC-388 stays standing (its oil-change cut is untouched, and $0.35 is still the centre). DEC-377's flat line and its peanuts exception (DEC-293, "keep $3") are replaced for food prices; DEC-293 is otherwise untouched. DEC-380 (draft) is left as it is: the four general-store foods stand, the bread and the deli sandwich lose an hour or two of satiety (6 to 5, 7 to 5) to stay "low satiety".

**Source.** Owner's answer on card food-1117-numbers, 2026-11-17. Owner's words; readings marked.
