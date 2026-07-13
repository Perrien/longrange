// Shared solve driver for the validation harness (task 0.7).
// Mirrors the app bridge's solve sequence (GameBuild/app/src/engine-bridge) —
// keep the two in sync by hand if the bridge solve ever changes.
// Deliberately Vite-free plain Node.

export function spinRate(si) {
  return (2 * Math.PI * si.muzzleVelocityMps) / si.twistM;
}

/** Solve one case; returns sampled rows (all SI). */
export function solve(module, si, atmosphere, wind, { zeroRangeM, maxRangeM, stepM }) {
  const drag = si.dragModel === 'G1' ? module.DragFunction.G1 : module.DragFunction.G7;
  const bullet = new module.Bullet(si.massKg, si.diameterM, si.lengthM, si.bc, drag);
  const atmos = new module.Atmosphere(
    atmosphere.temperatureK,
    atmosphere.altitudeM,
    atmosphere.humidity,
    atmosphere.pressurePa,
  );
  const windVec = new module.Vector3D(wind.x, wind.y, wind.z);
  const target = new module.Vector3D(0, 0, -zeroRangeM);
  const sim = new module.BallisticsSimulator();
  const owned = [bullet, atmos, windVec, target, sim];
  try {
    sim.setInitialBullet(bullet);
    sim.setAtmosphere(atmos);
    sim.setWind(windVec);
    sim.computeZero(si.muzzleVelocityMps, target, 0.001, 50, 1e-5, spinRate(si)).delete();
    sim.simulate(maxRangeM * 1.05, 0.001, 15.0);
    const trajectory = sim.getTrajectory(); // reference — do NOT delete
    const rows = [];
    for (let range = stepM; range <= maxRangeM + 1e-6; range += stepM) {
      const point = trajectory.atDistance(range);
      if (!point) continue;
      const state = point.getState();
      const pos = state.getPosition();
      rows.push({
        rangeM: point.getDistance(),
        dropM: pos.y,
        windageM: pos.x, // with zero wind this channel IS spin drift + aero jump
        velocityMps: point.getVelocity(),
        timeOfFlightS: point.getTime(),
      });
      pos.delete();
      state.delete();
      point.delete();
    }
    return rows;
  } finally {
    for (const h of owned) h.delete();
  }
}

export function relDiff(a, b) {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  return Math.abs(a - b) / scale;
}

export function rowDiff(a, b) {
  return Math.max(
    relDiff(a.rangeM, b.rangeM),
    relDiff(a.dropM, b.dropM),
    relDiff(a.windageM, b.windageM),
    relDiff(a.velocityMps, b.velocityMps),
    relDiff(a.timeOfFlightS, b.timeOfFlightS),
  );
}
