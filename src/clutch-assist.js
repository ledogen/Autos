/**
 * src/clutch-assist.js — FEAT-126 clutch assistant: the layer BETWEEN the driver's controls and the
 * manual-gearbox sim (owner, 2026-10-19: "clutch assistant stands between the input and the sim").
 *
 * The sim (src/drivetrain.js stepManual) reads one analog clutch engagement, vehicleState.clutch ∈
 * [0,1], and a shift request. This module turns the raw controls into those two numbers:
 *   raw clutch PEDAL ∈ [0,1] (1 = pedal down = disengaged; a binary button today, an axis later)
 *   raw shift request (+1 up / −1 down, a rising edge)
 *
 * OFF — pass-through. clutch = 1 − pedal; the request goes straight on, so a shift with the clutch in
 *       reaches the sim and is rejected there (missShift → −2 % transmission, src/damage.js).
 * ON  — BeamNG-style:
 *   • anti-stall / launch: engagement follows engine speed like a centrifugal clutch, 0 at
 *     idle+assistEngageRPM, 1 at assistLaunchRPM + assistLaunchThrottleRPM × throttle. It declutches
 *     before the engine can be dragged to a stall, bites as the revs rise and slips into a launch.
 *   • shifts: a request opens the clutch first and is forwarded with it open; the clutch stays open
 *     while the sim's synchro has the box in N, then comes back at most assistReengageRate per second
 *     so the slip, not a snap, matches the revs.
 *   • the driver's pedal always wins: clutch = min(assist, 1 − pedal).
 *
 * Pure: no DOM, no engine types, no Three.js. State lives in the object makeClutchAssist returns.
 */

export function makeClutchAssist () {
    return { cmd: 1, pending: 0 }
}

/**
 * One step.
 * @param {object} a       makeClutchAssist() state (mutated)
 * @param {object} input   { pedal ∈[0,1] (1 = down), shift (−1|0|+1 rising edge), throttle ∈[0,1] }
 * @param {object} sim     { rpm, shifting } — the sim's engine speed and synchro flag (vehicleState.drivetrain)
 * @param {object} params  vehicle params (clutchAssist, engineIdleRPM, clutchShiftMax, assist* tuning)
 * @param {number} dt      s
 * @returns {{ clutch: number, shiftRequest: number }}
 */
export function stepClutchAssist (a, input, sim, params, dt) {
    const pedal = Math.max(0, Math.min(1, input.pedal || 0))
    if (!params.clutchAssist) {
        a.cmd = 1 - pedal
        a.pending = 0
        return { clutch: 1 - pedal, shiftRequest: input.shift || 0 }
    }

    // Anti-stall / launch engagement off engine speed.
    const lo = (params.engineIdleRPM || 750) + (params.assistEngageRPM ?? 100)
    const hi = Math.max(lo + 1, (params.assistLaunchRPM ?? 1400) + (params.assistLaunchThrottleRPM ?? 1200) * (input.throttle || 0))
    const engage = Math.max(0, Math.min(1, ((sim.rpm || 0) - lo) / (hi - lo)))

    // Shift sequencing: a request opens the clutch; it is forwarded once the command is open.
    if (input.shift && !a.pending && !sim.shifting) a.pending = Math.sign(input.shift)
    const target = (a.pending || sim.shifting) ? 0 : engage
    a.cmd = target < a.cmd ? target : Math.min(target, a.cmd + (params.assistReengageRate ?? 5) * dt)
    let shiftRequest = 0
    if (a.pending && a.cmd <= (params.clutchShiftMax ?? 0.15)) { shiftRequest = a.pending; a.pending = 0 }

    return { clutch: Math.min(a.cmd, 1 - pedal), shiftRequest }
}
