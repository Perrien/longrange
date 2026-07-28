// LongRange task 0.3 — unit test (c): computeZero convergence.
// Zeroing is the core of the firing-solution puzzle: given a muzzle velocity and
// a target, the solver finds the launch angles that put the bullet on the aim
// point. Verify it converges for a realistic 6.5 Creedmoor load at 100 m and that
// the resulting zeroed trajectory actually passes through the aim point.
//
// Coordinate convention (see ballistics/bullet.h): X=crossrange, Y=up,
// Z=-downrange, so a 100 m target is at (0, 0, -100).

#include <gtest/gtest.h>

#include <cmath>
#include <stdexcept>

#include "ballistics/bullet.h"
#include "ballistics/simulator.h"
#include "math/conversions.h"
#include "math/vector.h"

using btk::ballistics::Bullet;
using btk::ballistics::DragFunction;
using btk::ballistics::Simulator;
using btk::math::Conversions;
using btk::math::Vector3D;

TEST(Zeroing, SixFiveCreedmoorAt100m)
{
  // 6.5 Creedmoor, 140 gr, 0.264" diameter, ~1.30" length, G7 BC 0.310 (box-ish).
  const Bullet bullet(
    Conversions::grainsToKg(140.0f),
    Conversions::inchesToMeters(0.264f),
    Conversions::inchesToMeters(1.30f),
    0.310f,
    DragFunction::G7);

  Simulator sim;
  sim.setInitialBullet(bullet);

  const float mv = Conversions::fpsToMps(2700.0f); // ~823 m/s
  const Vector3D target(0.0f, 0.0f, -100.0f);      // 100 m downrange, bore-height

  // Extra iterations + a realistic tolerance so convergence is unambiguous.
  sim.computeZero(mv, target, /*dt=*/0.001f, /*max_iterations=*/50, /*tolerance=*/1e-5f);

  // computeZero ends with resetToInitial() (clears the trajectory); re-simulate
  // the zeroed launch and confirm it passes through the aim point at 100 m.
  sim.simulate(110.0f, 0.001f, 5.0f);

  const auto pt = sim.getTrajectory().atDistance(100.0f);
  ASSERT_TRUE(pt.has_value());

  const Vector3D p = pt->getState().getPosition();
  EXPECT_NEAR(-p.z, 100.0f, 0.5f); // reached the target plane
  EXPECT_NEAR(p.x, 0.0f, 0.01f);   // windage within 1 cm at 100 m
  EXPECT_NEAR(p.y, 0.0f, 0.01f);   // elevation within 1 cm at 100 m
}

// ---------------------------------------------------------------------------
// Regression: the 2050 m zeroing wall that killed the ELR trigger (2026-07-28).
//
// `computeZero` flies each TRIAL 1.1x the target distance, under a time wall that
// used to be hard-coded at 5 s. A 6.5 CM cannot cover 2.2 km in 5 s, so zeroing
// past ~2050 m threw — and `MatchSimulator` zeroes AT THE TARGET, so the hit-sim
// could not be constructed for any station beyond that. On device it read as a
// dead FIRE button, because recoil is applied after the catch.
//
// Two things are locked in here, and BOTH matter: that a long zero now succeeds,
// and that the default is still 5 s. The default is load-bearing — the golden
// vectors were generated through call sites that omit the argument, so a changed
// default would silently invalidate them.
// ---------------------------------------------------------------------------

namespace {
/** The 6.5 CM used by the validation matrix (`GameBuild/validation/loads.json`). */
Bullet matchBullet()
{
  return Bullet(0.0090718474f, 0.0067056f, 0.0353568f, 0.326f, DragFunction::G7);
}
constexpr float kMatchMv = 826.008f;
constexpr float kMatchSpin = 2.0f * 3.14159265f * kMatchMv / 0.2032f;

/** Zero at `rangeM`; true if it converged rather than throwing. */
bool zeroSucceeds(float rangeM, float maxTime)
{
  Simulator sim;
  const Bullet bullet = matchBullet();
  sim.setInitialBullet(bullet);
  sim.setWind(Vector3D(0.0f, 0.0f, 0.0f));
  const Vector3D target(0.0f, 0.0f, -rangeM);
  try
  {
    sim.computeZero(kMatchMv, target, 0.001f, 1000, 1e-6f, kMatchSpin, maxTime);
    return true;
  }
  catch(const std::runtime_error&)
  {
    return false;
  }
}
} // namespace

TEST(Zeroing, LongRangeZeroSucceedsWithAGenerousTimeWall)
{
  // 2100 m is just past the old wall; 3000 m is the ELR probe's far station.
  EXPECT_TRUE(zeroSucceeds(2100.0f, 30.0f));
  EXPECT_TRUE(zeroSucceeds(2500.0f, 30.0f));
  EXPECT_TRUE(zeroSucceeds(3000.0f, 30.0f));
}

TEST(Zeroing, TheOldFiveSecondWallStillBehavesExactlyAsItDid)
{
  // Characterisation, not aspiration: this is the behaviour the golden vectors
  // were generated under, so it must not drift. Short zeros pass, long ones throw.
  EXPECT_TRUE(zeroSucceeds(1500.0f, 5.0f));
  EXPECT_TRUE(zeroSucceeds(2000.0f, 5.0f));
  EXPECT_FALSE(zeroSucceeds(2100.0f, 5.0f));
  EXPECT_FALSE(zeroSucceeds(3000.0f, 5.0f));
}

TEST(Zeroing, OmittingMaxTimeKeepsTheFiveSecondDefault)
{
  // The trailing parameter must be a DEFAULT, not a required argument — every
  // pre-existing call site omits it, including the validation harness.
  Simulator sim;
  const Bullet bullet = matchBullet();
  sim.setInitialBullet(bullet);
  sim.setWind(Vector3D(0.0f, 0.0f, 0.0f));
  const Vector3D farTarget(0.0f, 0.0f, -3000.0f);
  EXPECT_THROW(sim.computeZero(kMatchMv, farTarget, 0.001f, 1000, 1e-6f, kMatchSpin),
               std::runtime_error);
}

// ---------------------------------------------------------------------------
// Regression: the long-zero FREEZE (2026-07-28), separate from the wall above.
//
// Once the time wall stopped throwing, zeroing at long range still cost ~1 s —
// 1111 ms at 3000 m against 10 ms at 1500 m. The cause was NOT a bad root-finder:
// the iteration converges at a clean 0.50 error ratio per step at every range.
// It was an UNREACHABLE tolerance. `MatchSimulator` asks for 1e-6 m, and at long
// range the float32 residual of a 9,000-step trajectory bottoms out near 5e-6 m,
// so the loop ran its full 1000-trial ceiling chasing a target arithmetic could
// not deliver. It now stops when six straight trials fail to beat the best error.
//
// These assert BEHAVIOUR (converged quality, and that a short zero is unaffected)
// rather than wall-clock, which would be flaky on shared CI.
// ---------------------------------------------------------------------------

/** Zero at `rangeM`, then re-fly and report the residual miss at the aim point. */
static float zeroResidualM(float rangeM, float tolerance)
{
  Simulator sim;
  const Bullet bullet = matchBullet();
  sim.setInitialBullet(bullet);
  sim.setWind(Vector3D(0.0f, 0.0f, 0.0f));
  sim.computeZero(kMatchMv, Vector3D(0.0f, 0.0f, -rangeM), 0.001f, 1000, tolerance, kMatchSpin, 30.0f);
  sim.simulate(rangeM * 1.1f, 0.001f, 30.0f);
  const auto pt = sim.getTrajectory().atDistance(rangeM);
  if(!pt)
    return 1e9f;
  const Vector3D p = pt->getState().getPosition();
  return std::sqrt(p.x * p.x + p.y * p.y);
}

TEST(Zeroing, BailingOutEarlyDoesNotDegradeTheZero)
{
  // The early exit keeps the BEST iterate, so the answer is still the closest
  // float can get — well inside a millimetre even where 1e-6 m is unreachable.
  EXPECT_LT(zeroResidualM(2500.0f, 1e-6f), 1e-3f);
  EXPECT_LT(zeroResidualM(3000.0f, 1e-6f), 1e-3f);
}

TEST(Zeroing, ShortZerosStillMeetTheRequestedToleranceExactly)
{
  // The no-op guarantee, stated as a test: where the tolerance IS reachable the
  // loop must still reach it, not stop early. The golden vectors depend on this.
  EXPECT_LT(zeroResidualM(100.0f, 1e-5f), 1e-5f);
  EXPECT_LT(zeroResidualM(300.0f, 1e-5f), 1e-5f);
  EXPECT_LT(zeroResidualM(1000.0f, 1e-5f), 1e-5f);
}
