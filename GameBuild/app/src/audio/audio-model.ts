// Pure audio model (task 1.5d) — the distance/energy math behind the shot report
// and the delayed steel ping. Kept framework- and WebAudio-free so it unit-tests
// in the node vitest env (no AudioContext). The AudioManager class consumes these.
//
// Two independent physical effects combine on an impact sound:
//  1. Sound travel: the ping is heard `distance / speedOfSound` after impact, and
//     attenuates with distance as it propagates back to the shooter.
//  2. Impact energy: how hard the steel was struck sets the ring's intrinsic
//     loudness/brightness at the source — a close/heavy hit rings louder and
//     sharper than a distant/light one. Energy (½mv²), not momentum, governs the
//     *sound* (momentum governs the swing — see steel-target.ts).

/** At/under this range the impact is heard at full volume. */
export const SOUND_MIN_DISTANCE_M = 100 * 0.9144; // 100 yd
/** At/over this range the impact is heard at the floor volume. */
export const SOUND_MAX_DISTANCE_M = 500 * 0.9144; // 500 yd
/** Floor of the distance attenuation (never fully silent). Raised from 0.1 so a
 * 500 yd hit stays audible after per-clip normalization (task 1.5d tuning). */
export const SOUND_MIN_VOLUME = 0.25;

/** Reference impact energy (J): roughly a solid centre-fire hit. The current
 * 6.5 CM load lands near 1× across Range A, so its pings sit at full intrinsic
 * loudness; a weak round (e.g. a future .22) would ring proportionally quieter.
 * A fixed absolute reference (not per-load) is what makes cartridges differ.
 * Tuning knob. */
export const REFERENCE_IMPACT_ENERGY_J = 2500;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Seconds between the bullet's impact and hearing it: sound-travel time back to
 * the shooter. 500 yd (≈457 m) at the ISA speed of sound (≈340 m/s) ≈ 1.34 s. */
export function soundDelaySeconds(distanceM: number, speedOfSoundMps: number): number {
  if (!(distanceM > 0) || !(speedOfSoundMps > 0)) return 0;
  return distanceM / speedOfSoundMps;
}

/** Linear volume falloff with distance: 1.0 at/under MIN, SOUND_MIN_VOLUME at/over
 * MAX (models the ping getting quieter as it travels back). */
export function distanceAttenuation(
  distanceM: number,
  minDistanceM: number = SOUND_MIN_DISTANCE_M,
  maxDistanceM: number = SOUND_MAX_DISTANCE_M,
): number {
  if (distanceM <= minDistanceM) return 1;
  if (distanceM >= maxDistanceM) return SOUND_MIN_VOLUME;
  const t = (distanceM - minDistanceM) / (maxDistanceM - minDistanceM);
  return 1 - t * (1 - SOUND_MIN_VOLUME);
}

/** Intrinsic ping character from impact energy: a gain multiplier and a playback
 * rate (pitch). Harder hits are louder and a touch brighter; both clamped so the
 * ring never disappears or chipmunks. */
export function impactAudio(
  energyJ: number,
  refEnergyJ: number = REFERENCE_IMPACT_ENERGY_J,
): { gain: number; playbackRate: number } {
  const r = refEnergyJ > 0 ? Math.max(0, energyJ) / refEnergyJ : 1;
  return {
    gain: clamp(Math.sqrt(r), 0.35, 1.2),
    playbackRate: clamp(0.9 + 0.2 * r, 0.85, 1.2),
  };
}

/** Final playback parameters for a HIT's steel ping (a miss has no impact sound —
 * a bullet into dirt/berm doesn't ring or ricochet; owner 2026-07-14). Volume is
 * the distance attenuation × the energy gain; the ping is delayed by sound travel. */
export function impactSoundParams(
  distanceM: number,
  speedOfSoundMps: number,
  energyJ: number,
  refEnergyJ: number = REFERENCE_IMPACT_ENERGY_J,
): { delaySeconds: number; volume: number; playbackRate: number } {
  const { gain, playbackRate } = impactAudio(energyJ, refEnergyJ);
  return {
    delaySeconds: soundDelaySeconds(distanceM, speedOfSoundMps),
    volume: distanceAttenuation(distanceM) * gain,
    playbackRate,
  };
}
