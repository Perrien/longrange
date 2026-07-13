// LongRange task 0.3 — unit test (c): computeZero convergence.
// Zeroing is the core of the firing-solution puzzle: given a muzzle velocity and
// a target, the solver finds the launch angles that put the bullet on the aim
// point. Verify it converges for a realistic 6.5 Creedmoor load at 100 m and that
// the resulting zeroed trajectory actually passes through the aim point.
//
// Coordinate convention (see ballistics/bullet.h): X=crossrange, Y=up,
// Z=-downrange, so a 100 m target is at (0, 0, -100).

#include <gtest/gtest.h>

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
