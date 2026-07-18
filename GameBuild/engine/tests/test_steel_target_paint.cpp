// LongRange target-surface task A — impact-paint texture behavior of
// btk::rendering::SteelTarget, which the game's persistent hit marks are built
// on (plan: BTK texture-paint port, owner-approved 2026-07-18). These pin the
// exact contracts the app-side atlas code (tasks B/C) depends on:
//
//   - buffer layout: RGBA, width = 2 × texture_size (front face on the left
//     half u∈[0,0.5), back face on the right), height = texture_size;
//   - the game's plates use the default normal (0,0,-1) at identity
//     orientation, and bullets fly downrange (−Z), so vel·normal > 0 and the
//     engine paints the RIGHT half — that is the half the shooter-facing UVs
//     must sample (task B);
//   - setColors + initializeTexture repaint the whole buffer;
//   - clearImpacts() is the "repaint the plate" hook (marks wiped).
//
// The splatter's radiating spikes are randomized, so assertions are limited to
// what is guaranteed: the splat center is NEAR-metal (the ellipse writes pure
// metal at blend = 0, but a random spike segment at small t can re-write the
// center texel via integer truncation with fade = t² > 0, nudging channels a
// few counts toward paint — observed off-by-one in practice), and the other
// texture half is untouched exactly (both splat and spike loops clamp to the
// struck face's half).

#include <gtest/gtest.h>

#include "ballistics/bullet.h"
#include "math/vector.h"
#include "rendering/steel_target.h"

#include <cstdint>
#include <cstdlib>

using btk::ballistics::Bullet;
using btk::ballistics::DragFunction;
using btk::math::Vector3D;
using btk::rendering::SteelTarget;

namespace
{
  // 12" round plate, 1/2" thick — the game's plate proportions (RangeScene).
  constexpr float kPlateDiameterM = 0.3f;
  constexpr float kPlateThicknessM = 0.0127f;
  constexpr int kTextureSize = 64; // → buffer 128 × 64

  // 6.5 CM-ish bullet, SI (matches the game's strike() call).
  const Bullet kBase(0.00907f, 0.00782f, 0.03f, 0.5f, DragFunction::G7);

  SteelTarget makePlate()
  {
    // Default constructor: origin, normal (0,0,-1), identity orientation —
    // exactly the frame the game's steel-target bridge sets up.
    return SteelTarget(kPlateDiameterM, kPlateDiameterM, kPlateThicknessM, /*is_oval=*/true, kTextureSize);
  }

  const std::uint8_t* texel(const SteelTarget& t, int x, int y)
  {
    return t.getTexture().data() + (static_cast<size_t>(y) * t.getTextureWidth() + x) * 4;
  }

  ::testing::AssertionResult texelIs(const SteelTarget& t, int x, int y, std::uint8_t r, std::uint8_t g, std::uint8_t b)
  {
    const std::uint8_t* p = texel(t, x, y);
    if(p[0] == r && p[1] == g && p[2] == b && p[3] == 255)
      return ::testing::AssertionSuccess();
    return ::testing::AssertionFailure() << "texel(" << x << "," << y << ") = [" << int(p[0]) << "," << int(p[1]) << "," << int(p[2]) << "," << int(p[3]) << "], expected [" << int(r) << ","
                                         << int(g) << "," << int(b) << ",255]";
  }

  // Splat-center check: within a few counts of the metal color. A spike
  // segment can graze the center texel with a tiny fade (see header note); the
  // bound below caps that at ~fade 0.03 of the metal→paint span, far from any
  // paint channel value used in these tests.
  ::testing::AssertionResult texelNear(const SteelTarget& t, int x, int y, std::uint8_t r, std::uint8_t g, std::uint8_t b, int tol = 12)
  {
    const std::uint8_t* p = texel(t, x, y);
    if(std::abs(int(p[0]) - int(r)) <= tol && std::abs(int(p[1]) - int(g)) <= tol && std::abs(int(p[2]) - int(b)) <= tol && p[3] == 255)
      return ::testing::AssertionSuccess();
    return ::testing::AssertionFailure() << "texel(" << x << "," << y << ") = [" << int(p[0]) << "," << int(p[1]) << "," << int(p[2]) << "," << int(p[3]) << "], expected within ±" << tol
                                         << " of [" << int(r) << "," << int(g) << "," << int(b) << ",255]";
  }

  ::testing::AssertionResult halfIsSolid(const SteelTarget& t, bool left_half, std::uint8_t r, std::uint8_t g, std::uint8_t b)
  {
    const int half = t.getTextureWidth() / 2;
    const int x0 = left_half ? 0 : half;
    const int x1 = left_half ? half : t.getTextureWidth();
    for(int y = 0; y < t.getTextureHeight(); ++y)
      for(int x = x0; x < x1; ++x)
      {
        auto res = texelIs(t, x, y, r, g, b);
        if(!res) return res;
      }
    return ::testing::AssertionSuccess();
  }

  // A flying bullet at `pos` (plate-local == world here: identity orientation
  // at the origin) travelling straight downrange (−Z, the game's shot
  // direction) or uprange (+Z).
  Bullet flyingBullet(float x, float y, float vz)
  {
    return Bullet(kBase, Vector3D(x, y, 0.0f), Vector3D(0.0f, 0.0f, vz), 0.0f);
  }
} // namespace

TEST(SteelTargetPaint, BufferMatchesConstructorSize)
{
  SteelTarget plate = makePlate();
  EXPECT_EQ(plate.getTextureWidth(), kTextureSize * 2);
  EXPECT_EQ(plate.getTextureHeight(), kTextureSize);
  EXPECT_EQ(plate.getTexture().size(), static_cast<size_t>(kTextureSize * 2) * kTextureSize * 4);
}

TEST(SteelTargetPaint, InitializesToDefaultPaintColor)
{
  // Upstream default: bright red paint (255,40,40), fully opaque.
  SteelTarget plate = makePlate();
  EXPECT_TRUE(halfIsSolid(plate, /*left*/ true, 255, 40, 40));
  EXPECT_TRUE(halfIsSolid(plate, /*left*/ false, 255, 40, 40));
}

TEST(SteelTargetPaint, SetColorsTakesEffectOnRepaint)
{
  // The game's plate color (PLATE_COLOR 0xf0f0ea) as paint.
  SteelTarget plate = makePlate();
  plate.setColors(240, 240, 234, 90, 90, 90);
  plate.initializeTexture();
  EXPECT_TRUE(halfIsSolid(plate, true, 240, 240, 234));
  EXPECT_TRUE(halfIsSolid(plate, false, 240, 240, 234));
}

TEST(SteelTargetPaint, DownrangeHitPaintsRightHalfOnly)
{
  // vel (0,0,-800) · normal (0,0,-1) > 0 → engine "back face" → RIGHT half.
  // This is the game's geometry: the shooter-facing surface maps there.
  SteelTarget plate = makePlate();
  plate.setColors(200, 10, 10, 7, 8, 9);
  plate.initializeTexture();

  plate.hit(flyingBullet(0.0f, 0.0f, -800.0f));

  EXPECT_EQ(plate.getImpacts().size(), 1u);
  // Splat center (u=0.5, v=0.5 of the right half) is metal (± spike graze).
  EXPECT_TRUE(texelNear(plate, kTextureSize + kTextureSize / 2, kTextureSize / 2, 7, 8, 9));
  // The other (left) half is untouched — splat and spikes clamp to the struck half.
  EXPECT_TRUE(halfIsSolid(plate, /*left*/ true, 200, 10, 10));
}

TEST(SteelTargetPaint, UprangeHitPaintsLeftHalfOnly)
{
  SteelTarget plate = makePlate();
  plate.setColors(200, 10, 10, 7, 8, 9);
  plate.initializeTexture();

  plate.hit(flyingBullet(0.0f, 0.0f, 800.0f));

  EXPECT_TRUE(texelNear(plate, kTextureSize / 2, kTextureSize / 2, 7, 8, 9));
  EXPECT_TRUE(halfIsSolid(plate, /*left*/ false, 200, 10, 10));
}

TEST(SteelTargetPaint, OffsetHitMapsLocalXYToTexel)
{
  // Local (+0.06, +0.06) on a 0.3 m plate → u = v = 0.7 →
  // center_x = 64 + int(0.7·64) = 108, center_y = int(0.7·64) = 44.
  SteelTarget plate = makePlate();
  plate.setColors(200, 10, 10, 7, 8, 9);
  plate.initializeTexture();

  plate.hit(flyingBullet(0.06f, 0.06f, -800.0f));

  EXPECT_TRUE(texelNear(plate, 108, 44, 7, 8, 9));
  // A far corner of the same half stays paint: splat radius is ~5 px and
  // spikes reach ~3× that (+ a few px of width), nowhere near ~45 px away.
  EXPECT_TRUE(texelIs(plate, 126, 1, 200, 10, 10));
}

TEST(SteelTargetPaint, ClearImpactsRepaintsClean)
{
  // clearImpacts() is the repaint hook the game will expose (wipe marks).
  SteelTarget plate = makePlate();
  plate.setColors(240, 240, 234, 90, 90, 90);
  plate.initializeTexture();
  plate.hit(flyingBullet(0.0f, 0.0f, -800.0f));
  ASSERT_FALSE(plate.getImpacts().empty());

  plate.clearImpacts();

  EXPECT_TRUE(plate.getImpacts().empty());
  EXPECT_TRUE(halfIsSolid(plate, true, 240, 240, 234));
  EXPECT_TRUE(halfIsSolid(plate, false, 240, 240, 234));
}
