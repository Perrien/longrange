// LongRange steel-target settle physics — pins the "twist, then untwist to face
// the shooter" behavior of a chain-hung btk::rendering::SteelTarget (plan:
// hanging-target settle fix, owner-approved 2026-07-18).
//
// Background: an off-centre hit spins the plate about the world vertical (Y)
// axis. The bare chain model leaves a strong ~180° "facing away / chains
// crossed" trap, and for LIGHT plates (small racks — the 300-yd 4″, the 500-yd
// 6″/4″) the chains actively destabilize the facing-forward position while a
// bullet imparts a cartoonish 100–400 rad/s spin. The fix combines: an angular-
// speed cap, a hard ±MAX_TWIST limit (chains bind — the plate physically can't
// flip), a torque-form torsional spring toward twist=0 (scales ∝1/inertia like
// the chains, so it wins at every plate size), and a twist-aware settle (won't
// report settled until facing forward). These tests fire hard off-centre hits
// across the full plate-size ladder and assert every one settles facing the
// shooter (normal ≈ (0,0,-1)), never lodged backward or leaning at the limit.

#include <gtest/gtest.h>

#include "ballistics/bullet.h"
#include "math/vector.h"
#include "rendering/steel_target.h"

#include <cmath>

using btk::ballistics::Bullet;
using btk::ballistics::DragFunction;
using btk::math::Vector3D;
using btk::rendering::SteelTarget;

namespace
{
  constexpr float kPlateThicknessM = 0.0127f;
  constexpr int kTextureSize = 32;

  // Chain rig constants mirrored from the app bridge (engine-bridge/steel-target.ts).
  constexpr float kChainAnchorAngleRad = 0.6f;
  constexpr float kChainOutwardOffsetM = 0.05f;

  // 6.5 CM-ish bullet, SI (matches the game's strike() call).
  const Bullet kBase(0.00907f, 0.00782f, 0.03f, 0.5f, DragFunction::G7);

  // Build a plate hung from two top chains, exactly as the bridge rigs it: local
  // attach at (±ax, ay, -t/2) near the top edge, beam anchor directly above with
  // a small inward X offset.
  SteelTarget makeHangingPlate(float diameterM)
  {
    const Vector3D center(0.0f, 2.0f, -100.0f);
    SteelTarget target(diameterM, diameterM, kPlateThicknessM, /*is_oval=*/true, center, Vector3D(0.0f, 0.0f, -1.0f), kTextureSize);

    const float radius = diameterM / 2.0f;
    const float ax = radius * std::sin(kChainAnchorAngleRad);
    const float ay = radius * std::cos(kChainAnchorAngleRad);
    const float az = -kPlateThicknessM / 2.0f;
    const float beam_height = center.y + ay + 0.5f; // ~0.5 m of chain

    for(int sx : {-1, 1})
    {
      Vector3D local_attach(sx * ax, ay, az);
      Vector3D world_attach = center + local_attach; // identity orientation at rest
      Vector3D world_fixed(world_attach.x - sx * kChainOutwardOffsetM, beam_height, world_attach.z);
      target.addChainAnchor(local_attach, world_fixed);
    }
    return target;
  }

  // Impact bullet at a world point with a world velocity (the bridge's strike()).
  Bullet impactAt(const Vector3D& point, const Vector3D& velocity)
  {
    return Bullet(kBase, point, velocity, 0.0f);
  }

  void settle(SteelTarget& target, float seconds)
  {
    const float dt = 1.0f / 60.0f;
    const int steps = static_cast<int>(seconds / dt);
    for(int i = 0; i < steps; ++i)
      target.timeStep(dt);
  }

  // Step until the engine first reports settled (isMoving()==false), or give up
  // after `max_seconds`. Returns the elapsed time. The plate's pose AT THIS
  // MOMENT is what the app snaps to — so that is what the assertions must check.
  float settleUntilStopped(SteelTarget& target, float max_seconds)
  {
    const float dt = 1.0f / 60.0f;
    const int max_steps = static_cast<int>(max_seconds / dt);
    for(int i = 0; i < max_steps; ++i)
    {
      target.timeStep(dt);
      if(!target.isMoving())
        return (i + 1) * dt;
    }
    return max_seconds;
  }

  // Fire a hard rim hit that spins the plate about vertical, then assert it
  // settles facing the shooter. Runs the whole plate-size ladder because the bug
  // this pins ONLY showed on light plates (the 300-yd 4″, the 500-yd 6″/4″).
  void expectUntwistsToFaceShooter(float diameterM)
  {
    SteelTarget target = makeHangingPlate(diameterM);
    const Vector3D center = target.getCenterOfMass();

    // Impact near the +X rim (proportional to plate size), bullet downrange (−Z):
    // torque about Y spins it. High speed to exercise the light-plate spin regime.
    target.hit(impactAt(Vector3D(center.x + 0.45f * diameterM, center.y, center.z), Vector3D(0.0f, 0.0f, -700.0f)));
    EXPECT_GT(std::fabs(target.getAngularVelocity().y), 1.0f) << "dia=" << diameterM << " did not spin";

    // Check the pose at the moment the engine reports settled — that is the pose
    // the app snaps the plate + chains to; it must already face the shooter.
    float t_settle = settleUntilStopped(target, 40.0f);
    EXPECT_LT(t_settle, 40.0f) << "dia=" << diameterM << " never settled";

    const Vector3D normal = target.getNormal();
    EXPECT_LT(normal.z, -0.85f) << "dia=" << diameterM << " settled facing away (normal.z=" << normal.z << ")";
    EXPECT_LT(std::fabs(normal.x), 0.25f) << "dia=" << diameterM << " settled twisted/leaning (normal.x=" << normal.x << ")";
    EXPECT_FALSE(target.isMoving()) << "dia=" << diameterM;
  }
}

// Every plate on the Range A ladder (12″ … 2″) must untwist to face the shooter.
// The light ones (≤6″) are the regression: they spin fastest and the chains fight
// the restoring hardest.
TEST(SteelTargetSettle, OffCentreHitUntwistsToFaceShooterAllSizes)
{
  const float diametersM[] = {0.3048f, 0.254f, 0.2032f, 0.1524f, 0.1016f, 0.0508f};
  for(float d : diametersM)
    expectUntwistsToFaceShooter(d);
}

// An off-centre hit must produce a VISIBLE twist (the owner wants to see the plate
// spin, not just swing) — while never flipping past the ~95° clamp. Track the peak
// world-Y twist during the reaction: it must exceed ~30° yet stay under ~100°.
TEST(SteelTargetSettle, OffCentreHitProducesVisibleButBoundedTwist)
{
  for(float d : {0.3048f, 0.1524f, 0.1016f})
  {
    SteelTarget target = makeHangingPlate(d);
    const Vector3D center = target.getCenterOfMass();
    target.hit(impactAt(Vector3D(center.x + 0.45f * d, center.y, center.z), Vector3D(0.0f, 0.0f, -700.0f)));

    const float dt = 1.0f / 60.0f;
    float peak = 0.0f;
    for(int i = 0; i < 60 * 6; ++i)
    {
      target.timeStep(dt);
      // World-Y twist from the normal's horizontal heading.
      const Vector3D n = target.getNormal();
      float twist = std::fabs(std::atan2(-n.x, -n.z));
      if(twist > peak)
        peak = twist;
    }
    EXPECT_GT(peak, 0.52f) << "dia=" << d << " barely twisted (peak=" << peak * 57.2958f << "deg)";
    EXPECT_LT(peak, 1.75f) << "dia=" << d << " twisted past the flip guard (peak=" << peak * 57.2958f << "deg)";
  }
}

// An off-vertical hit swings the plate (rotation about X); it must still settle
// facing the shooter — guards against the twist spring over-damping the swing.
TEST(SteelTargetSettle, SwingHitSettlesFacingShooter)
{
  SteelTarget target = makeHangingPlate(0.3048f);
  const Vector3D center = target.getCenterOfMass();

  target.hit(impactAt(Vector3D(center.x, center.y + 0.1f, center.z), Vector3D(0.0f, 0.0f, -300.0f)));

  settle(target, 12.0f);

  const Vector3D normal = target.getNormal();
  EXPECT_LT(normal.z, -0.9f) << "plate settled facing away (normal.z=" << normal.z << ")";
  EXPECT_FALSE(target.isMoving());
}

// Marks must accumulate on the ONE shooter-facing texture half. Two sequential
// downrange shots (each let settle before the next) must both land on the back
// half — the half the shooter-facing UVs sample — leaving the front (left) half
// untouched. The old twisted-settle flipped the plate between shots, scattering
// the two marks onto opposite halves ("only 1 hit per side"); this pins that
// they stay together now that the plate always settles facing the shooter. Uses a
// light 4″ plate (the 300-yd middle target the owner reported).
TEST(SteelTargetSettle, SequentialHitsStayOnShooterFacingHalf)
{
  SteelTarget target = makeHangingPlate(0.1016f);
  const Vector3D center = target.getCenterOfMass();

  // Shot 1 left-of-centre, settle; shot 2 right-of-centre, settle.
  target.hit(impactAt(Vector3D(center.x - 0.03f, center.y, center.z), Vector3D(0.0f, 0.0f, -600.0f)));
  settle(target, 20.0f);
  ASSERT_LT(target.getNormal().z, -0.85f) << "did not settle facing shooter after shot 1";
  target.hit(impactAt(Vector3D(center.x + 0.03f, center.y, center.z), Vector3D(0.0f, 0.0f, -600.0f)));
  settle(target, 20.0f);
  ASSERT_LT(target.getNormal().z, -0.85f) << "did not settle facing shooter after shot 2";

  // Downrange hits paint the BACK half (right); the FRONT half (left, u∈[0,W/2))
  // must remain clean default paint (255,40,40). Both marks share the back half.
  const int w = target.getTextureWidth();
  const int h = target.getTextureHeight();
  const std::uint8_t* buf = target.getTexture().data();
  int front_marked = 0;
  int back_marked = 0;
  for(int y = 0; y < h; ++y)
  {
    for(int x = 0; x < w; ++x)
    {
      const std::uint8_t* p = buf + (static_cast<size_t>(y) * w + x) * 4;
      bool is_paint = (p[0] == 255 && p[1] == 40 && p[2] == 40);
      if(!is_paint)
      {
        if(x < w / 2)
          ++front_marked;
        else
          ++back_marked;
      }
    }
  }
  EXPECT_EQ(front_marked, 0) << "marks scattered onto the hidden (front) half";
  EXPECT_GT(back_marked, 0) << "no marks on the shooter-facing (back) half";
}

