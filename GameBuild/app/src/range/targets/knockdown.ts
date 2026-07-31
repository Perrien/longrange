// Knockdown physics (Design/archive/target-system-plan.md §6, task T6).
//
// WHY THIS IS TS AND NOT C++. The engine's `SteelTarget::timeStep` has gravity,
// chain springs, a Y-twist spring and settle detection — but no base hinge, no
// one-sided angular limit, no ground contact, no latch and no reset actuator.
// Adding them would be 150–250 lines inside the function every other range's swing
// runs through, plus a ctest + golden-vector + WASM rebuild: the largest blast
// radius in the batch for the smallest fidelity gain. And a popper's fall is not
// emergent — it is a rod pivoting about its base, a hard stop, then a mechanical
// reset. There is nothing for a rigid-body solver to discover.
//
// The decisive argument is testability: scene behaviour cannot be unit-tested in this
// repo, so the one part of knockdown that CAN be proven has to live where tests
// reach it. That is here.
//
// Pure: no THREE, no engine, no RNG, no clock. Deterministic in (state, dt, cfg).

import type { KnockdownSpec } from './mount-type';

/** Standard gravity (m/s²) — the same value the engine's rigid body uses. */
const G = 9.80665;
/** Steel density (kg/m³), for deriving a plate's mass from its dimensions. */
const STEEL_DENSITY = 7850;

export type KnockdownPhase = 'standing' | 'falling' | 'down' | 'rising';

export interface KnockdownState {
  phase: KnockdownPhase;
  /** Angle off vertical (rad), 0 = standing upright. Always ≥ 0. */
  angleRad: number;
  /** Angular velocity (rad/s). Only meaningful while falling. */
  rateRadS: number;
  /** Seconds spent in the current phase — what drives the `down` dwell. */
  phaseSinceS: number;
}

export function standingState(): KnockdownState {
  return { phase: 'standing', angleRad: 0, rateRadS: 0, phaseSinceS: 0 };
}

/**
 * Mass of a steel plate from its bounding box.
 *
 * Bounding box rather than true outline area, deliberately: it matches the C++
 * `is_oval = false` mass model this batch gives non-round targets, and it is
 * CONSERVATIVE for a knockdown — an overstated mass falls more reluctantly, so a
 * target never tips more easily than the real thing would.
 */
export function steelPlateMassKg(widthM: number, heightM: number, thicknessM: number): number {
  return widthM * heightM * thicknessM * STEEL_DENSITY;
}

/**
 * Initial angular velocity imparted by a bullet strike (rad/s).
 *
 * Angular impulse about the hinge is `J·h` (linear impulse × moment arm); a uniform
 * rod pivoting about one end has `I = m·L²/3`. So `ω₀ = 3·J·h / (m·L²)`.
 *
 * `impulseNs` is the bullet's momentum `m·v` — full transfer, which is the
 * conservative choice for a knockdown (real steel keeps some of it as heat and
 * deformation, so this tips slightly more readily than reality; the alternative is
 * inventing a transfer coefficient with nothing to calibrate it against).
 */
export function seedFallRate(p: {
  impulseNs: number;
  /** Impact height above the hinge (m). A hit at the pivot imparts no rotation. */
  impactHeightM: number;
  massKg: number;
  stemLengthM: number;
}): number {
  const { impulseNs, impactHeightM, massKg, stemLengthM } = p;
  if (!(massKg > 0) || !(stemLengthM > 0)) return 0;
  return (3 * impulseNs * Math.max(0, impactHeightM)) / (massKg * stemLengthM * stemLengthM);
}

/** Whether a target in this state can be hit. Down and rising targets cannot —
 *  they are out of play until they are back up. */
export function isStandingPhase(phase: KnockdownPhase): boolean {
  return phase === 'standing' || phase === 'falling';
}

/**
 * Advance the knockdown state by `dt` seconds.
 *
 * `standing` → (struck) `falling` → (latch) `down` → (dwell) `rising` → `standing`.
 *
 * Falling integrates the rod-about-base equation `θ̈ = (3g / 2L)·sin θ`, so a plate
 * struck harder falls FASTER but latches at the same angle — the angle is a property
 * of the hardware, not of the shot. Rising is a CONSTANT rate, because a reset motor
 * or a pull-cable is mechanical rather than gravitational.
 */
export function stepKnockdown(
  state: KnockdownState,
  dt: number,
  cfg: KnockdownSpec,
): KnockdownState {
  if (dt <= 0) return state;
  const fallLatch = (cfg.fallAngleDeg * Math.PI) / 180;
  const riseRate = (cfg.resetRateDegS * Math.PI) / 180;
  const since = state.phaseSinceS + dt;

  switch (state.phase) {
    case 'standing':
      return state;

    case 'falling': {
      // Semi-implicit Euler: accelerate, then move. Stable at frame dt for this
      // stiffness, and it cannot step backwards through the latch.
      const accel = ((3 * G) / (2 * cfg.stemLengthM)) * Math.sin(state.angleRad);
      const rateRadS = state.rateRadS + accel * dt;
      const angleRad = state.angleRad + rateRadS * dt;
      if (angleRad >= fallLatch) {
        // Latched down. Clamp rather than overshoot — the stop is physical.
        return { phase: 'down', angleRad: fallLatch, rateRadS: 0, phaseSinceS: 0 };
      }
      return { phase: 'falling', angleRad, rateRadS, phaseSinceS: since };
    }

    case 'down': {
      if (since >= cfg.downDwellS) {
        return { phase: 'rising', angleRad: state.angleRad, rateRadS: 0, phaseSinceS: 0 };
      }
      return { ...state, phaseSinceS: since };
    }

    case 'rising': {
      const angleRad = state.angleRad - riseRate * dt;
      if (angleRad <= 0) return standingState();
      return { phase: 'rising', angleRad, rateRadS: 0, phaseSinceS: since };
    }
  }
}

/**
 * Begin a fall. A target already down or rising IGNORES the strike — it is out of
 * play, so a shot cannot re-knock it or interrupt its reset. A target already
 * falling takes the extra impulse (a second hit on a toppling plate does add to it).
 */
export function strikeKnockdown(state: KnockdownState, seedRateRadS: number): KnockdownState {
  if (!isStandingPhase(state.phase)) return state;
  // A dead-centre hit at the hinge imparts no rotation; nudge off zero so `sin θ`
  // has something to work with, otherwise the equation's fixed point holds it
  // upright forever despite a real impulse.
  const angleRad = state.angleRad > 0 ? state.angleRad : 1e-4;
  return {
    phase: 'falling',
    angleRad,
    rateRadS: state.rateRadS + Math.max(0, seedRateRadS),
    phaseSinceS: state.phase === 'falling' ? state.phaseSinceS : 0,
  };
}

/** Force a target back up immediately, whatever it was doing. */
export function resetKnockdown(): KnockdownState {
  return standingState();
}
