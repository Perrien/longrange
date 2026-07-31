// LongRange target-system task T10 — `SteelTarget::setOrientation`, the seam a
// TS-animated pose needs so its impact paint lands on the correct FACE.
//
// WHY THIS EXISTS. The knockdown mode (T6) and the future flip mode compute their pose
// in TypeScript, not in `timeStep`, because a base hinge with a one-sided angular limit,
// a latch and a reset actuator are not things this solver models. But `hit()` decides
// which texture half to paint from `vel · normal_`, and stores the impact at
// `inverse(orientation_) · local_pos` — both read this body's own state. A TS-driven
// pose never updated either, so a flipped paddle kept painting the half the player can
// no longer see, at the un-flipped position.
//
// These tests pin the fix from both sides: an UN-flipped target must behave exactly as
// before (the invariant the game's whole two-sided paint system rests on), and a flipped
// one must paint the other half, at the mirrored local position.

#include <gtest/gtest.h>

#include "ballistics/bullet.h"
#include "math/quaternion.h"
#include "math/vector.h"
#include "rendering/steel_target.h"

#include <cmath>
#include <cstdint>

namespace
{
  constexpr int kTextureSize = 64; // small: these tests are about halves, not detail
  constexpr float kWidth = 0.3048f;
  constexpr float kHeight = 0.3048f;
  constexpr float kThickness = 0.0127f;

  /** A plate at the origin with the game's default downrange normal. */
  btk::rendering::SteelTarget makePlate()
  {
    return btk::rendering::SteelTarget(
      kWidth, kHeight, kThickness, true,
      btk::math::Vector3D(0.0f, 0.0f, 0.0f),
      btk::math::Vector3D(0.0f, 0.0f, -1.0f),
      kTextureSize);
  }

  /** A bullet travelling downrange (−Z) that strikes at `local_x` off centre. */
  btk::ballistics::Bullet makeShot(float local_x)
  {
    btk::ballistics::Bullet base(0.0091f, 0.0067f, 0.03f, 0.5f, btk::ballistics::DragFunction::G7);
    return btk::ballistics::Bullet(
      base,
      btk::math::Vector3D(local_x, 0.0f, 0.0f),
      btk::math::Vector3D(0.0f, 0.0f, -760.0f),
      0.0f);
  }

  /** Count texels in one horizontal half that are NOT the paint colour. */
  int chippedInHalf(const btk::rendering::SteelTarget& target, bool left_half)
  {
    const std::vector<uint8_t>& buf = target.getTexture();
    const int width = kTextureSize * 2;
    const int x_min = left_half ? 0 : kTextureSize;
    const int x_max = left_half ? kTextureSize : width;
    // The constructor fills the buffer with the default paint; sample a corner texel
    // (outside any splat) to learn what that is rather than hard-coding it.
    const uint8_t pr = buf[0], pg = buf[1], pb = buf[2];
    int chipped = 0;
    for(int y = 0; y < kTextureSize; ++y)
    {
      for(int x = x_min; x < x_max; ++x)
      {
        const size_t i = (static_cast<size_t>(y) * width + x) * 4;
        if(buf[i] != pr || buf[i + 1] != pg || buf[i + 2] != pb) ++chipped;
      }
    }
    return chipped;
  }

  /** Mean x of the chipped texels in one half, as a fraction of that half's width.
   *  0 = the half's left edge, 1 = its right edge. */
  double chipCentroidU(const btk::rendering::SteelTarget& target, bool left_half)
  {
    const std::vector<uint8_t>& buf = target.getTexture();
    const int width = kTextureSize * 2;
    const int x_min = left_half ? 0 : kTextureSize;
    const int x_max = left_half ? kTextureSize : width;
    const uint8_t pr = buf[0], pg = buf[1], pb = buf[2];
    double sum = 0.0;
    int count = 0;
    for(int y = 0; y < kTextureSize; ++y)
    {
      for(int x = x_min; x < x_max; ++x)
      {
        const size_t i = (static_cast<size_t>(y) * width + x) * 4;
        if(buf[i] != pr || buf[i + 1] != pg || buf[i + 2] != pb)
        {
          sum += static_cast<double>(x - x_min);
          ++count;
        }
      }
    }
    return count == 0 ? -1.0 : sum / count / static_cast<double>(kTextureSize);
  }

  btk::math::Quaternion flippedAboutY()
  {
    return btk::math::Quaternion::fromAxisAngle(btk::math::Vector3D(0.0f, 1.0f, 0.0f), 3.14159265359f);
  }
} // namespace

// --- the un-flipped behaviour must be exactly as before -----------------------

TEST(SteelTargetSetOrientation, DefaultOrientationIsIdentityAndNormalDownrange)
{
  btk::rendering::SteelTarget target = makePlate();
  const btk::math::Vector3D& n = target.getNormal();
  EXPECT_NEAR(n.x, 0.0f, 1e-5f);
  EXPECT_NEAR(n.y, 0.0f, 1e-5f);
  EXPECT_NEAR(n.z, -1.0f, 1e-5f);
}

TEST(SteelTargetSetOrientation, DownrangeHitStillPaintsRightHalfOnly)
{
  // The invariant the game's two-sided paint system rests on. A target nobody has
  // re-posed must behave identically to before this setter existed.
  btk::rendering::SteelTarget target = makePlate();
  target.hit(makeShot(0.0f));
  EXPECT_GT(chippedInHalf(target, false), 0); // shooter-facing (right) half painted
  EXPECT_EQ(chippedInHalf(target, true), 0);  // downrange (left) half untouched
}

TEST(SteelTargetSetOrientation, SettingIdentityChangesNothing)
{
  // Re-asserting the pose a target already has must be a no-op, not a perturbation.
  btk::rendering::SteelTarget target = makePlate();
  target.setOrientation(target.getOrientation());
  target.hit(makeShot(0.0f));
  EXPECT_GT(chippedInHalf(target, false), 0);
  EXPECT_EQ(chippedInHalf(target, true), 0);
}

// --- the setter ---------------------------------------------------------------

TEST(SteelTargetSetOrientation, RecomputesTheSurfaceNormal)
{
  // The whole point: `hit()` reads `normal_`, so the setter must re-derive it. A setter
  // that stored the quaternion alone would leave the normal stale and the paint wrong.
  btk::rendering::SteelTarget target = makePlate();
  target.setOrientation(flippedAboutY());
  const btk::math::Vector3D& n = target.getNormal();
  EXPECT_NEAR(n.z, 1.0f, 1e-4f); // was −1; a 180° Y flip reverses it
  EXPECT_NEAR(n.x, 0.0f, 1e-4f);
  EXPECT_NEAR(n.y, 0.0f, 1e-4f);
}

TEST(SteelTargetSetOrientation, NormalisesAnUnnormalisedQuaternion)
{
  // Callers hand over whatever their animation produced; drift must not accumulate
  // into a scaling orientation.
  btk::rendering::SteelTarget target = makePlate();
  btk::math::Quaternion q = flippedAboutY();
  q.w *= 1.5f;
  q.x *= 1.5f;
  q.y *= 1.5f;
  q.z *= 1.5f;
  target.setOrientation(q);
  const btk::math::Vector3D& n = target.getNormal();
  EXPECT_NEAR(std::sqrt(n.x * n.x + n.y * n.y + n.z * n.z), 1.0f, 1e-4f);
}

TEST(SteelTargetSetOrientation, FlippedTargetPaintsTheOtherHalf)
{
  // THE POINT OF T10. After a 180° flip the face the shooter sees is the engine's
  // "front", so a downrange bullet must paint the LEFT half — and the right half, which
  // now faces away, must be left alone.
  btk::rendering::SteelTarget target = makePlate();
  target.setOrientation(flippedAboutY());
  target.hit(makeShot(0.0f));
  EXPECT_GT(chippedInHalf(target, true), 0); // downrange (left) half now painted
  EXPECT_EQ(chippedInHalf(target, false), 0);
}

TEST(SteelTargetSetOrientation, FlippedTargetMirrorsTheLocalPosition)
{
  // A flip also moves WHERE the mark goes: the impact is stored at
  // `inverse(orientation) · local_pos`, so a hit on the shooter's right lands on the
  // paddle's other side. Without the setter this would still read as un-flipped.
  btk::rendering::SteelTarget unflipped = makePlate();
  unflipped.hit(makeShot(0.08f)); // 8 cm to the shooter's right
  const double u_unflipped = chipCentroidU(unflipped, false);

  btk::rendering::SteelTarget flipped = makePlate();
  flipped.setOrientation(flippedAboutY());
  flipped.hit(makeShot(0.08f));
  const double u_flipped = chipCentroidU(flipped, true);

  ASSERT_GT(u_unflipped, 0.0);
  ASSERT_GT(u_flipped, 0.0);
  // Un-flipped: right of that half's centre. Flipped: mirrored to the left of it.
  EXPECT_GT(u_unflipped, 0.5);
  EXPECT_LT(u_flipped, 0.5);
  EXPECT_NEAR(u_unflipped + u_flipped, 1.0, 0.06);
}

TEST(SteelTargetSetOrientation, FlipBackRestoresTheOriginalFace)
{
  // A dueling-tree paddle flips repeatedly, so the mapping has to be reversible rather
  // than one-way: each face accumulates its own marks.
  btk::rendering::SteelTarget target = makePlate();
  target.setOrientation(flippedAboutY());
  target.hit(makeShot(0.0f));
  const int leftAfterFirst = chippedInHalf(target, true);
  ASSERT_GT(leftAfterFirst, 0);

  target.setOrientation(btk::math::Quaternion()); // back to facing the shooter
  target.hit(makeShot(0.0f));
  EXPECT_GT(chippedInHalf(target, false), 0);          // the other face now marked too
  EXPECT_EQ(chippedInHalf(target, true), leftAfterFirst); // and the first mark survives
}

TEST(SteelTargetSetOrientation, DoesNotDisturbVelocityOrAngularVelocity)
{
  // A caller driving the pose owns the motion; the setter must not fight it by
  // injecting or clearing momentum.
  btk::rendering::SteelTarget target = makePlate();
  target.hit(makeShot(0.05f)); // give it some motion
  const btk::math::Vector3D v_before = target.getVelocity();
  const btk::math::Vector3D w_before = target.getAngularVelocity();
  target.setOrientation(flippedAboutY());
  EXPECT_FLOAT_EQ(target.getVelocity().x, v_before.x);
  EXPECT_FLOAT_EQ(target.getVelocity().y, v_before.y);
  EXPECT_FLOAT_EQ(target.getVelocity().z, v_before.z);
  EXPECT_FLOAT_EQ(target.getAngularVelocity().x, w_before.x);
  EXPECT_FLOAT_EQ(target.getAngularVelocity().y, w_before.y);
  EXPECT_FLOAT_EQ(target.getAngularVelocity().z, w_before.z);
}
