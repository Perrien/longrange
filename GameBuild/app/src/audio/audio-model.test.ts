// Audio model tests (task 1.5d): the distance-delay, attenuation, and energy
// scaling behind the shot report and delayed steel ping. Pure math (no
// AudioContext), so it runs in the node vitest env.
import { describe, it, expect } from 'vitest';
import {
  soundDelaySeconds,
  distanceAttenuation,
  impactAudio,
  impactSoundParams,
  SOUND_MIN_DISTANCE_M,
  SOUND_MAX_DISTANCE_M,
  SOUND_MIN_VOLUME,
} from './audio-model';

const ISA_SPEED_OF_SOUND = 340.3; // m/s at 15 °C

describe('audio-model/soundDelaySeconds', () => {
  it('delays the 500 yd ping ≈ 1.3–1.4 s (the task Done-when)', () => {
    const d = soundDelaySeconds(500 * 0.9144, ISA_SPEED_OF_SOUND);
    expect(d).toBeGreaterThan(1.3);
    expect(d).toBeLessThan(1.4);
  });

  it('is zero for a non-positive distance or speed', () => {
    expect(soundDelaySeconds(0, ISA_SPEED_OF_SOUND)).toBe(0);
    expect(soundDelaySeconds(100, 0)).toBe(0);
  });

  it('grows linearly with distance', () => {
    const near = soundDelaySeconds(100, ISA_SPEED_OF_SOUND);
    const far = soundDelaySeconds(400, ISA_SPEED_OF_SOUND);
    expect(far).toBeCloseTo(4 * near, 6);
  });
});

describe('audio-model/distanceAttenuation', () => {
  it('is full volume at/under the near threshold, floor at/over the far one', () => {
    expect(distanceAttenuation(SOUND_MIN_DISTANCE_M - 10)).toBe(1);
    expect(distanceAttenuation(SOUND_MIN_DISTANCE_M)).toBe(1);
    expect(distanceAttenuation(SOUND_MAX_DISTANCE_M)).toBe(SOUND_MIN_VOLUME);
    expect(distanceAttenuation(SOUND_MAX_DISTANCE_M + 1000)).toBe(SOUND_MIN_VOLUME);
  });

  it('decreases monotonically between the thresholds and stays in [floor,1]', () => {
    let prev = 1.0001;
    for (let d = SOUND_MIN_DISTANCE_M; d <= SOUND_MAX_DISTANCE_M; d += 20) {
      const v = distanceAttenuation(d);
      expect(v).toBeLessThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(SOUND_MIN_VOLUME);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
  });
});

describe('audio-model/impactAudio', () => {
  it('is louder and brighter for higher impact energy', () => {
    const weak = impactAudio(1200, 2500);
    const strong = impactAudio(3000, 2500);
    expect(strong.gain).toBeGreaterThan(weak.gain);
    expect(strong.playbackRate).toBeGreaterThan(weak.playbackRate);
  });

  it('clamps so the ring never vanishes or chipmunks', () => {
    const tiny = impactAudio(1, 2500);
    const huge = impactAudio(100000, 2500);
    expect(tiny.gain).toBeGreaterThanOrEqual(0.35);
    expect(huge.gain).toBeLessThanOrEqual(1.2);
    expect(huge.playbackRate).toBeLessThanOrEqual(1.2);
    expect(tiny.playbackRate).toBeGreaterThanOrEqual(0.85);
  });
});

describe('audio-model/impactSoundParams', () => {
  it('a close hit is louder than a far hit of the same round (energy + distance)', () => {
    // 6.5 CM: ~2936 J @ 50 yd vs ~1773 J @ 500 yd (from the trajectory solve).
    const near = impactSoundParams(50 * 0.9144, ISA_SPEED_OF_SOUND, 2936);
    const far = impactSoundParams(500 * 0.9144, ISA_SPEED_OF_SOUND, 1773);
    expect(near.volume).toBeGreaterThan(far.volume);
    expect(far.delaySeconds).toBeGreaterThan(near.delaySeconds);
  });
});
