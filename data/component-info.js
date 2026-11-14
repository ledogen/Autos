// FEAT-213 — component info texts: the owner's words, 2026-11-13, VERBATIM (authored lines; never reword).
// One table, read by the auto shop's (i) buttons (src/service-screen.js) and the diagnostics tip
// (src/damage-screen.js). Markup, stripped to plain text it is exactly the owner's sentence:
//   [[name]]  a component (coloured --accent-story)     {{name}}  an item (coloured --poi-text)
// "x%" is each text's real threshold, filled at render from DAMAGE_PARAMS by `infoHtml` (see XPCT).

export const COMPONENT_INFO = {
  tires: 'The [[tires]] are your only connection to the road (ideally). A worn tire will lose grip and be more vulnerable to puncture. Spinning your tires causes them to wear more quickly so keep a light touch. A punctured tire has little grip and wears very quickly so pull over and patch it or change it out for a {{spare}} immediately. A {{compressor}} can help you patch tires more quickly',
  wheels: '[[Wheels]] are damaged from impacts. Wear on your wheels will cause them to be out of round making them skip and bounce on the ground which is harder to control. Also, if you drive on a destroyed tire, the wheel begins to wear rapidly.',
  brakes: '[[Brakes]] are what bring you to a stop. The pads and shoes hold their stopping power for a while but below x% they get weaker rapidly.',
  springs: '[[Springs]] are what support the weight of the truck and load. Springs wear from bottoming out your travel. Wear on your springs will cause the [[suspension]] to sag.',
  dampers: '[[Dampers]] are what resist rapid movements of the [[suspension]]. Dampers wear from sharp bumps and washboard roads. Wear on your dampers will cause the suspension to be more bouncy.',
  filter: 'The [[air filter]] cleans the air entering the [[engine]]. This makes your engine last longer so make sure to check its condition regularly. It functions well down to about x%',
  radiator: 'The [[radiator]] cools the engine. For long steep uphills or heavy loads its important to have a radiator in good condition. It can be repaired with {{radiator stop leak}}',
  engine: 'The heart of your machine. As long as your [[air filter]] and {{oil}} are clean it should last a long time.',
  transmission: 'The [[transmission]] lets you shift gears. If its worn out it takes longer to do a shift. It is damaged by shifting without pulling the clutch in.',
  lights: '[[Headlights]] help you see at night. As they wear they get dimmer. They start flickering below x%. They can be repaired with {{zip ties}}',
  panels: '[[Body panels]] protect you and the rest of your truck from impacts so keep them in good condition. They can be repaired with good ol’ {{duct tape}} and {{zip ties}}.',
}

/** The "x%" of each text: the DAMAGE_PARAMS field that holds it (brake fade knee, air filter working floor,
 *  headlight flicker point). Values at 2026-11-14: brakes 50%, filter 20%, lights 50%. */
const XPCT = { brakes: 'brakeKnee', filter: 'filterKnee', lights: 'headlightFlickerCond' }

/** damage.js track class → text key. */
export const CLASS_INFO = { tire: 'tires', wheel: 'wheels', brake: 'brakes', spring: 'springs', damper: 'dampers',
  filter: 'filter', radiator: 'radiator', engine: 'engine', transmission: 'transmission', headlights: 'lights', armor: 'panels' }

/** The text as HTML with its names coloured; `P` is DAMAGE_PARAMS. */
export function infoHtml (key, P) {
  const t = COMPONENT_INFO[key]
  if (!t) return ''
  const x = XPCT[key] ? `${Math.round(P[XPCT[key]] * 100)}%` : 'x%'
  return t.replace('x%', x)
    .replace(/\[\[(.+?)\]\]/g, '<span class="info-part">$1</span>')
    .replace(/\{\{(.+?)\}\}/g, '<span class="info-item">$1</span>')
}
