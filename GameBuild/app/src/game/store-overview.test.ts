// Store cartridge-list overview text (rifle-ammo-store S12) — pure/sync, so a
// component test on the assembly function is enough (same rationale as
// store-readouts.test.ts: no WASM, no canvas).
import { describe, expect, it } from 'vitest';
import { CARTRIDGE_IDS_V2 } from './spec';
import { cartridgeOverviewWords } from './store-overview';

const WEIGHT_WORDS = ['much lighter bullet', 'lighter bullet', 'about-average bullet weight', 'heavier bullet', 'much heavier bullet'];
const VELOCITY_WORDS = [
  'much slower, more arcing trajectory',
  'slower, more arcing trajectory',
  'about-average velocity',
  'faster, flatter-shooting',
  'much faster, flatter-shooting',
];

describe('cartridgeOverviewWords', () => {
  it('returns one of the known words per axis for every catalog cartridge', () => {
    for (const id of CARTRIDGE_IDS_V2) {
      const words = cartridgeOverviewWords(id);
      expect(WEIGHT_WORDS).toContain(words.weight);
      expect(VELOCITY_WORDS).toContain(words.velocity);
    }
  });

  it('.22 LR — far lighter than the list average (a 10-cartridge list running up to .50 BMG)', () => {
    const words = cartridgeOverviewWords('22lr');
    expect(words.weight).toBe('much lighter bullet');
  });

  it('.50 BMG — far heavier than the list average', () => {
    const words = cartridgeOverviewWords('50bmg');
    expect(words.weight).toBe('much heavier bullet');
  });

  it('is deterministic — same cartridge, same words across calls', () => {
    expect(cartridgeOverviewWords('308')).toEqual(cartridgeOverviewWords('308'));
  });
});
