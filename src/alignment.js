/**
 * Static wheel alignment — toe and camber. Pure math, no Three.js, no engine types.
 *
 * Both angles are stored in DEGREES on RANGER_PARAMS (that is how an alignment sheet reads)
 * and converted to radians here; nothing else in the codebase should do the conversion.
 *
 * SIGN CONVENTIONS (industry standard, matched to this project's axes: forward = −Z,
 * right = +X, up = +Y, and a POSITIVE steer angle turns the vehicle LEFT):
 *
 *   toe   > 0  ⇒ TOE-IN.  The LEADING edge of each wheel points toward the vehicle centerline,
 *                so the pair converges ahead of the axle. Toe-out is negative.
 *   camber < 0 ⇒ NEGATIVE CAMBER. The TOP of each wheel leans toward the centerline, so the
 *                contact patches splay outward and the wheel stands out at the bottom. This is
 *                the normal street setting and what the 2002 Ranger's spec sheet lists.
 *
 * Both are expressed per-side: the same sheet value produces mirrored geometry left vs right,
 * which is what makes toe-in cancel in a straight line instead of steering the truck.
 */

const DEG = Math.PI / 180

/** True for the two wheels on the vehicle's left side. Wheel index 0=FL, 1=FR, 2=RL, 3=RR. */
const isLeft = (corner) => corner === 0 || corner === 2
const isFront = (corner) => corner < 2

/**
 * Steer-angle offset contributed by static toe, in radians, ready to ADD to the corner's
 * steer angle (rotation about body up).
 *
 * Toe-in on the LEFT wheel points its nose to the right = a right-hand (negative) steer;
 * on the RIGHT wheel it points the nose left = positive. Hence the mirrored sign.
 *
 * @param {number} corner - 0-3 (FL, FR, RL, RR).
 * @param {object} params - uses toeFront, toeRear (degrees, + = toe-in).
 * @returns {number} radians, signed for this corner.
 */
export function toeOffset (corner, params) {
  const toeDeg = isFront(corner) ? (params.toeFront || 0) : (params.toeRear || 0)
  if (toeDeg === 0) return 0
  return (isLeft(corner) ? -toeDeg : toeDeg) * DEG
}

/**
 * Camber lean for this corner, in radians, as a rotation about the wheel's own FORWARD axis
 * under the right-hand rule — i.e. positive leans the top of the wheel toward +X (vehicle right).
 *
 * Negative camber leans each top INBOARD, so the left wheel leans toward +X (positive lean) and
 * the right wheel toward −X (negative lean) — that mirroring is the whole sign expression here.
 *
 * @param {number} corner - 0-3 (FL, FR, RL, RR).
 * @param {object} params - uses camberFront, camberRear (degrees, − = top leans inboard).
 * @returns {number} radians, signed for this corner about its forward axis.
 */
export function camberLean (corner, params) {
  const camDeg = isFront(corner) ? (params.camberFront || 0) : (params.camberRear || 0)
  if (camDeg === 0) return 0
  return (isLeft(corner) ? -camDeg : camDeg) * DEG
}
