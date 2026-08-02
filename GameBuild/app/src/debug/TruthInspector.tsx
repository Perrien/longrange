// Truth inspector (task 2.2d, D9) — a DEV-ONLY diagnostic that reveals the
// hidden truth behind gear: it rolls TWO copies of a chosen rifle model (sharing
// one ammo lot) and shows how each copy's effective MV, precision, and downrange
// vertical spread differ from the box and from each other — the increment-2.md
// §2.2 Done-when readout.
//
// This is the ONE place a UI-dir module reads hidden truth (via resolveTruth). It
// is legitimate because it is dev-only: imported solely by DevTools, which App
// renders behind `import.meta.env.DEV`, so Rollup drops this module — and, since
// nothing else calls it at runtime, game/hidden-truth's derivation code too —
// from the shipped bundle. The no-leak guard (hidden-truth.guard.test.ts)
// allowlists exactly this file; every other UI-dir module must stay truth-free.
//
// D2: this only READS the engine to compute a display number; it does NOT wire
// the active instance into the live shot loop.
import { useEffect, useState } from 'react';
import {
  AMMO_LOADS,
  RIFLE_MODELS,
  getAmmoLoad,
  getRifleModel,
  resolveLoadSpec,
  rifleRangesForSpec,
  lotRangesForSpec,
  trueBaseMvForSpec,
  twistMForSpec,
} from '../game/catalog';
import {
  cartridgeParams,
  presetsForCartridge,
  specFromPreset,
  type RifleSpec,
  type LoadSpec,
} from '../game/spec';
import { buildAmmoLot, buildRifleInstance, cryptoRng, newId } from '../game/acquire';
import { resolveLotTruth, resolveRifleTruth } from '../game/hidden-truth';
import { type AtmosphereInput } from '../engine-bridge';
import { createScatterSimulator, seedRandom } from '../engine-bridge/match-sim';
import { loadBtkModule } from '../engine-bridge/wasm-module';
import type { BtkModule, Dispersion, Load } from '../engine-bridge/types';
import { useGameStore } from '../state/store';
import { formatOffsetForDisplay, formatSpeedForDisplay } from '../units/display';
import { mpsToFps } from '../units/velocity';
import { radToMoa } from '../units/angle';

const ISA: AtmosphereInput = { temperatureK: 288.15, altitudeM: 0, humidity: 0.5, pressurePa: 0 };
const SPREAD_RANGES_YD = [100, 400, 800];
const YARD_M = 0.9144;
const N_SHOTS = 120;

/** Default (reference-barrel, first-twist-option) spec for a cartridge — this
 *  dev tool doesn't have its own barrel/twist sliders, so it inspects truth
 *  for the same default build the Store's holding view acquires (S4 step 7). */
function defaultRifleSpecFor(cartridgeId: string): RifleSpec {
  const c = cartridgeParams(cartridgeId);
  return { cartridgeId, barrelLengthIn: c.referenceBarrelIn, twistIn: c.twistOptionsInPerTurn[0] };
}

/** First authored preset matching this cartridge + grade — the closest S4
 *  equivalent of the old catalog's one-load-per-cartridge-per-grade shape. */
function presetLoadSpecFor(cartridgeId: string, grade: 'match' | 'bulk'): LoadSpec {
  const preset = presetsForCartridge(cartridgeId).find((p) => p.grade === grade);
  if (!preset) throw new Error(`TruthInspector: no preset for '${cartridgeId}' / '${grade}'`);
  return specFromPreset(preset.id);
}

/** 1σ of the vertical (y) impacts from a seeded volley — the honest vertical
 *  spread at a range for this true load + dispersion. */
function verticalSigmaM(
  module: BtkModule,
  load: Load,
  dispersion: Dispersion,
  rangeM: number,
  twistM: number,
): number {
  seedRandom(module, 20260717); // stable per compute; re-roll varies the draws, not the stream
  const sim = createScatterSimulator(module, load, dispersion, rangeM, ISA, twistM);
  let sum = 0;
  const ys: number[] = [];
  for (let i = 0; i < N_SHOTS; i++) {
    const y = sim.fire().y;
    ys.push(y);
    sum += y;
  }
  sim.delete();
  const mean = sum / N_SHOTS;
  const variance = ys.reduce((a, y) => a + (y - mean) ** 2, 0) / N_SHOTS;
  return Math.sqrt(variance);
}

interface CopyReadout {
  mvOffsetMps: number;
  inherentPrecisionMoaRad: number;
  effectiveMeanMvMps: number;
  spread: { rangeYd: number; totalM: number; mvOnlyM: number }[];
}

function computeCopy(
  module: BtkModule,
  rifleSpec: RifleSpec,
  loadSpec: LoadSpec,
  rng: () => number,
): CopyReadout {
  const rifle = buildRifleInstance(rifleSpec, { rng, id: newId('dev-rifle') });
  const lot = buildAmmoLot(loadSpec, { rng, id: newId('dev-lot') });
  const rt = resolveRifleTruth(rifle, rifleRangesForSpec(rifleSpec));
  const lt = resolveLotTruth(lot, lotRangesForSpec(loadSpec));

  const geom = resolveLoadSpec(loadSpec); // mass/diameter/length/drag are believed==true
  const effectiveMeanMvMps = trueBaseMvForSpec(loadSpec) + rt.mvOffsetMps + lt.meanMvShiftMps;
  const trueLoad: Load = {
    massKg: geom.massKg,
    diameterM: geom.diameterM,
    lengthM: geom.lengthM,
    bc: lt.trueBc,
    dragModel: geom.dragModel,
    muzzleVelocityMps: effectiveMeanMvMps,
  };
  const twistM = twistMForSpec(rifleSpec);

  const zero = { scopeCantRad: 0, windSpeedSdMps: 0, headwindSdMps: 0, updraftSdMps: 0 };
  const dispTotal: Dispersion = {
    mvSdMps: lt.mvSdMps,
    bcSdFraction: lt.bcSdFraction,
    rifleAccuracyRad: rt.inherentPrecisionRad,
    ...zero,
  };
  const dispMvOnly: Dispersion = { ...dispTotal, bcSdFraction: 0, rifleAccuracyRad: 0 };

  const spread = SPREAD_RANGES_YD.map((rangeYd) => {
    const rangeM = rangeYd * YARD_M;
    return {
      rangeYd,
      totalM: verticalSigmaM(module, trueLoad, dispTotal, rangeM, twistM),
      mvOnlyM: verticalSigmaM(module, trueLoad, dispMvOnly, rangeM, twistM),
    };
  });

  return {
    mvOffsetMps: rt.mvOffsetMps,
    inherentPrecisionMoaRad: rt.inherentPrecisionRad,
    effectiveMeanMvMps,
    spread,
  };
}

const cell: React.CSSProperties = { padding: '2px 8px', textAlign: 'right' };

export function TruthInspector() {
  const unitsPrimary = useGameStore((s) => s.settings.unitsPrimary);
  const [module, setModule] = useState<BtkModule | null>(null);
  const [rifleId, setRifleId] = useState(RIFLE_MODELS[0].catalogId);
  const [lotId, setLotId] = useState(AMMO_LOADS[0].catalogId);
  const [roll, setRoll] = useState(0);
  const [copies, setCopies] = useState<CopyReadout[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadBtkModule().then(
      (m) => live && setModule(m),
      (e) => live && setError(String(e)),
    );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!module) return;
    try {
      const rng = cryptoRng();
      // Dropdowns are keyed on the old catalog ids (RIFLE_MODELS/AMMO_LOADS,
      // still valid until S7) purely for their curated cartridge×grade list;
      // computeCopy itself works in specs (S4), so translate at the boundary.
      const rifleModel = getRifleModel(rifleId);
      const ammoLoad = getAmmoLoad(lotId);
      const rifleSpec = defaultRifleSpecFor(rifleModel.cartridgeId);
      const loadSpec = presetLoadSpecFor(ammoLoad.cartridgeId, ammoLoad.grade);
      setCopies([
        computeCopy(module, rifleSpec, loadSpec, rng),
        computeCopy(module, rifleSpec, loadSpec, rng),
      ]);
    } catch (e) {
      setError(String(e));
    }
  }, [module, rifleId, lotId, roll]);

  const boxMvMps = getAmmoLoad(lotId).believedMvMps;
  const boxMv = formatSpeedForDisplay(boxMvMps, unitsPrimary);
  const mvFmt = (mps: number) => formatSpeedForDisplay(mps, unitsPrimary);
  const spreadFmt = (m: number) => formatOffsetForDisplay(m, unitsPrimary);

  return (
    <div style={{ fontFamily: 'monospace', padding: '1rem', color: '#1a222c', maxWidth: 720 }}>
      <h2 style={{ marginTop: 0 }}>Truth inspector (dev only)</h2>
      <p style={{ fontSize: 13, opacity: 0.7 }}>
        Two freshly-rolled copies of one rifle model, sharing one ammo lot. Shows how each copy's
        hidden truth differs from the box and from each other. Reveals hidden values — DEV ONLY.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <label>
          Rifle{' '}
          <select value={rifleId} onChange={(e) => setRifleId(e.target.value)}>
            {RIFLE_MODELS.map((m) => (
              <option key={m.catalogId} value={m.catalogId}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ammo{' '}
          <select value={lotId} onChange={(e) => setLotId(e.target.value)}>
            {AMMO_LOADS.map((a) => (
              <option key={a.catalogId} value={a.catalogId}>
                {a.cartridgeName} — {a.grade}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => setRoll((r) => r + 1)}>Re-roll</button>
      </div>

      {error && <p style={{ color: '#a33' }}>Engine error: {error}</p>}
      {!module && !error && <p>Loading engine…</p>}

      {copies && (
        <>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Box (believed) MV: <b>{boxMv.value.toFixed(0)} {boxMv.label}</b>{' '}
            ({mpsToFps(boxMvMps).toFixed(0)} fps)
          </div>
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...cell, textAlign: 'left' }}>Field</th>
                <th style={cell}>Copy A</th>
                <th style={cell}>Copy B</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...cell, textAlign: 'left' }}>MV offset (rifle)</td>
                {copies.map((c, i) => (
                  <td key={i} style={cell}>{mvFmt(c.mvOffsetMps).value.toFixed(1)} {mvFmt(c.mvOffsetMps).label}</td>
                ))}
              </tr>
              <tr>
                <td style={{ ...cell, textAlign: 'left' }}>Effective mean MV</td>
                {copies.map((c, i) => (
                  <td key={i} style={cell}>
                    <b>{mvFmt(c.effectiveMeanMvMps).value.toFixed(0)} {mvFmt(c.effectiveMeanMvMps).label}</b>
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ ...cell, textAlign: 'left' }}>Inherent precision</td>
                {copies.map((c, i) => (
                  <td key={i} style={cell}>{radToMoa(c.inherentPrecisionMoaRad).toFixed(2)} MOA</td>
                ))}
              </tr>
              {SPREAD_RANGES_YD.map((yd, rowIdx) => (
                <tr key={yd}>
                  <td style={{ ...cell, textAlign: 'left' }}>
                    Vert. spread @{yd} yd (1σ){rowIdx === 0 ? ' — total / MV-only' : ''}
                  </td>
                  {copies.map((c, i) => {
                    const s = c.spread[rowIdx];
                    const total = spreadFmt(s.totalM);
                    const mvOnly = spreadFmt(s.mvOnlyM);
                    return (
                      <td key={i} style={cell}>
                        {total.value.toFixed(1)} / {mvOnly.value.toFixed(1)} {total.label}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>
            SD (per-shot MV) + BC come from the ammo lot (shared); MV offset + precision come from
            the rifle copy. Vertical spread = seeded {N_SHOTS}-shot volley through the true-gear
            hit-sim; "MV-only" isolates the ammo's velocity-SD contribution from the rifle's angular
            precision.
          </p>
        </>
      )}
    </div>
  );
}
