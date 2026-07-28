// Native twin of the golden-vector harness (`run.mjs` + `solve-driver.mjs`).
//
// WHY THIS EXISTS. The real check runs the OWNED engine's WASM artifact against
// vectors generated from PRISTINE BallisticsToolkit. That needs emsdk, which is
// not always available — and when a change lands inside `computeZero`, "does this
// alter the validated path?" is exactly the question you want answered BEFORE
// paying for a rebuild, not after.
//
// Compiled twice against the SAME source list — once with `-I BallisticsToolkit/
// include` + its sources (the oracle), once with `-I GameBuild/engine/include` +
// its sources (the change under test) — the two outputs must be byte-identical
// for every row the golden matrix samples. That is a strictly stronger statement
// than the 1e-4 tolerance `run.mjs` applies, and it is the honest way to claim a
// change is a no-op on the validated path.
//
// It does NOT replace `run.mjs`: this compares native float against native float,
// while the shipped engine is WASM. Run the real check after rebuilding. See
// GameBuild/validation/README-native-matrix.md for the exact commands.
//
// Mirrors solve-driver.mjs's `solve()` step for step — same 6-argument
// computeZero call (dt 0.001, 50 iterations, tolerance 1e-5), same
// `simulate(maxRange * 1.05, 0.001, 15.0)`, same sampling loop, same skip of
// unreachable ranges. Keep the two in sync by hand if either moves.

#include "ballistics/bullet.h"
#include "ballistics/simulator.h"
#include "physics/atmosphere.h"

#include <cmath>
#include <cstdio>

using namespace btk;

namespace
{
  struct Load
  {
    const char* id;
    float massKg, diameterM, lengthM, bc;
    ballistics::DragFunction drag;
    float mvMps, twistM;
    float maxRangeM, stepM;
  };

  struct Atmos
  {
    const char* name;
    float temperatureK, altitudeM, humidity;
  };

  struct Wind
  {
    const char* name;
    float x, y, z;
  };

  // The `validation` block of GameBuild/validation/loads.json, transcribed.
  // Ranges are the post-2026-07-28 extension (2000 m; .22 LR stays at 300).
  constexpr Load kLoads[] = {
    {"65cm-140-match", 0.0090718474f, 0.0067056f, 0.0353568f, 0.326f, ballistics::DragFunction::G7, 826.008f, 0.2032f, 2000.f, 100.f},
    {"22lr-40-standard", 0.0025919564f, 0.0057277f, 0.0155702f, 0.138f, ballistics::DragFunction::G1, 326.136f, 0.4064f, 300.f, 50.f},
    {"223-77-match", 0.0049895161f, 0.0057150f, 0.0248920f, 0.190f, ballistics::DragFunction::G7, 838.2f, 0.1778f, 2000.f, 100.f},
    {"308-175-match", 0.0113397925f, 0.0078232f, 0.0330200f, 0.243f, ballistics::DragFunction::G7, 792.48f, 0.2794f, 2000.f, 100.f},
    {"338lm-300-match", 0.0194396730f, 0.0085852f, 0.0442976f, 0.381f, ballistics::DragFunction::G7, 830.58f, 0.2286f, 2000.f, 100.f},
    {"50bmg-661-m33", 0.0428357f, 0.0129032f, 0.0619760f, 0.340f, ballistics::DragFunction::G7, 886.968f, 0.3810f, 2000.f, 100.f},
  };

  constexpr Atmos kAtmospheres[] = {
    {"ISA sea level", 288.15f, 0.f, 0.5f},
    {"hot and high", 308.15f, 1500.f, 0.2f},
    {"cold dense", 263.15f, 0.f, 0.8f},
  };

  constexpr Wind kWinds[] = {
    {"no wind", 0.f, 0.f, 0.f},
    {"10 mph crosswind +x", 4.4704f, 0.f, 0.f},
  };

  constexpr float kZeroRangeM = 100.f;

  float spinRate(const Load& load)
  {
    return (2.f * 3.14159265358979f * load.mvMps) / load.twistM;
  }
} // namespace

int main()
{
  for(const Load& load : kLoads)
  {
    for(const Atmos& atmosphere : kAtmospheres)
    {
      for(const Wind& wind : kWinds)
      {
        ballistics::Bullet bullet(load.massKg, load.diameterM, load.lengthM, load.bc, load.drag);
        physics::Atmosphere atmos(atmosphere.temperatureK, atmosphere.altitudeM, atmosphere.humidity, 0.f);
        ballistics::Simulator sim;
        sim.setInitialBullet(bullet);
        sim.setAtmosphere(atmos);
        sim.setWind(math::Vector3D(wind.x, wind.y, wind.z));
        // Six arguments, exactly as solve-driver.mjs calls it — so any change to
        // computeZero's DEFAULT arguments shows up here too.
        sim.computeZero(load.mvMps, math::Vector3D(0.f, 0.f, -kZeroRangeM), 0.001f, 50, 1e-5f, spinRate(load));
        sim.simulate(load.maxRangeM * 1.05f, 0.001f, 15.0f);
        auto& trajectory = sim.getTrajectory();

        for(float range = load.stepM; range <= load.maxRangeM + 1e-6f; range += load.stepM)
        {
          auto point = trajectory.atDistance(range);
          if(!point)
            continue; // matches solve-driver.mjs's bare `continue`
          const math::Vector3D p = point->getState().getPosition();
          // %.9e so the comparison is on the full float mantissa, not a rounded view.
          std::printf("%s|%s|%s|%.9e|%.9e|%.9e|%.9e|%.9e\n", load.id, atmosphere.name, wind.name,
                      static_cast<double>(point->getDistance()), static_cast<double>(p.y),
                      static_cast<double>(p.x), static_cast<double>(point->getVelocity()),
                      static_cast<double>(point->getTime()));
        }
      }
    }
  }
  return 0;
}
