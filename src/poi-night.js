// FEAT-214 — places light up at night. NO real lights: the fixtures are the models' own EMISSIVE
// materials (window curtains, soffit lenses, signs, pump faces), switched by the day clock. A
// real PointLight per POI would add work to every lit material's shader for all of them.
//
// Rules (owner, 2026-11-13): shops and pumps are open 24 h — lit from 19:00 until the day opens
// again. A residence is lit from 19:00 to 23:00, and stays lit past 23:00 only while it offers a
// mission or the player is delivering there. The 19:00 / 23:00 are CLOCK times, not dusk-following
// (the open question on the ticket — one number each, easy to change).
//
// Materials are matched by substring like model-service's palette (names must stay stable).
// SHARED materials (shops, pumps) flip once for every instance. A RESIDENCE gets its own clone of
// its lamp material per POI, because two houses of the same model can differ (one offering, one not).
// Materials only: never setAttribute on pooled geometry (DEC-073).
import * as THREE from 'three'

export const NIGHT_PARAMS = {
  onHour: 19,       // h — every lamp comes on
  homeOffHour: 23,  // h — a residence's light goes off (unless offering / delivery target)
  dayOpenHour: 7,   // h — the lamps go out in the morning (the run's day starts here)
  glow: 1.6,        // emissiveIntensity when lit
  warm: 0xffd27a,   // window / lens glow where the file carries no glow of its own
}

// material-name substring → glow colour (null = the material's own colour, for signs and faces).
// ponytail: free-roam / non-story clocks use the same table; a new model's hooks are one line here.
const SHOP_LAMPS = [['ShopLight', null], ['ShopSign', null], ['StationLamp', null], ['StationSign', null],
  ['BurgerLight', null], ['StoreSign', null], ['TackleSign', null], ['PumpGraphic', null]]
const HOME_LAMPS = [['Curtain', NIGHT_PARAMS.warm]]

/** Lit or not. `kind` 'shop' | 'home'; `keep` = offering a mission or the delivery target. */
export function lampsOn (kind, hour, keep = false) {
  const P = NIGHT_PARAMS
  if (hour >= P.dayOpenHour && hour < P.onHour) return false
  if (kind === 'shop') return true
  return keep || (hour >= P.onHour && hour < P.homeOffHour)
}

const _lampOf = (table, mat) => table.find(([s]) => mat.name?.includes(s))

/**
 * Walk a spawned POI model. SHOP kinds return nothing to keep (their materials are shared and
 * found with `shopLamps`); HOME kinds clone their lamp materials and return them.
 */
export function homeLamps (root) {
  const out = []
  root.traverse((o) => {
    if (!o.isMesh) return
    const hit = [].concat(o.material).some(m => _lampOf(HOME_LAMPS, m))
    if (!hit) return
    o.material = Array.isArray(o.material)
      ? o.material.map(m => _own(m, out)) : _own(o.material, out)
  })
  return out
}
function _own (m, out) {
  const hit = _lampOf(HOME_LAMPS, m)
  if (!hit) return m
  const c = m.clone(); c.userData.lampHex = hit[1]; c.emissive = new THREE.Color(hit[1]); out.push(c); return c
}

/** The SHARED lamp materials of a shop model (deduped across instances by the Set the caller owns). */
export function shopLamps (root, into) {
  root.traverse((o) => {
    if (!o.isMesh) return
    for (const m of [].concat(o.material)) {
      const hit = _lampOf(SHOP_LAMPS, m)
      if (!hit || into.has(m)) continue
      if (hit[1] != null) m.emissive.setHex(hit[1])
      else if (m.map) { m.emissive.setHex(0xffffff); m.emissiveMap = m.map; m.needsUpdate = true }   // BUG-177: a textured face glows AS its picture; copying the (white) base colour made a flat white panel
      else if (m.emissive.getHex() === 0) m.emissive.copy(m.color)
      into.add(m)
    }
  })
}

export const setGlow = (mats, on) => { for (const m of mats) m.emissiveIntensity = on ? NIGHT_PARAMS.glow : 0 }
