// Wind-field tuning constants (task 1.7a, D3b). Kept as their own tiny module
// (not folded into loads.ts, which is load/rifle data) since these are
// game-feel knobs for the Realistic-mode gust superposition, tuned in 1.7d.
import { mphToMps } from '../units';

/**
 * The mean wind speed a BTK preset's turbulence magnitudes were authored
 * around. `gustScale = meanSpeedMps / GUST_REFERENCE_MPS` scales the sampled
 * field proportionally to the player's dialed mean (D3b): a light breeze
 * wanders gently, a gale swings hard, and a 0 mph mean is dead calm. Starting
 * value ≈ 10 mph per the plan; a pure feel knob, re-tuned on-device in 1.7d.
 */
export const GUST_REFERENCE_MPS = mphToMps(10);
