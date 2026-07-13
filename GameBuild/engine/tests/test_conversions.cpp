// LongRange task 0.3 — unit test (a): Conversions round-trips.
// The engine's unit conversions are the foundation everything else builds on;
// verify to-SI/from-SI pairs invert cleanly and a few anchor values are right.
// Cited against Wiki/mil-dots-subtensions.md conventions (1 MOA = 0.290888 mrad).

#include <gtest/gtest.h>

#include "math/conversions.h"

using btk::math::Conversions;

TEST(Conversions, DistanceRoundTrip)
{
  // yards -> meters -> yards
  const float yd = 100.0f;
  const float m = Conversions::yardsToMeters(yd);
  EXPECT_NEAR(m, 91.44f, 1e-3f);                        // 100 yd = 91.44 m exactly
  EXPECT_NEAR(Conversions::metersToYards(m), yd, 0.05f); // inverse (constants ~6 sig figs)
}

TEST(Conversions, AngleRoundTripAndAnchors)
{
  // MOA -> rad -> MOA
  const float rad = Conversions::moaToRadians(1.0f);
  EXPECT_NEAR(Conversions::radiansToMoa(rad), 1.0f, 1e-4f);

  // rad -> mrad -> rad
  const float mrad = Conversions::radiansToMrad(rad);
  EXPECT_NEAR(Conversions::mradToRadians(mrad), rad, 1e-7f);

  // Anchor: 1 MOA = 0.290888 mrad; 1 mrad = 3.43775 MOA
  EXPECT_NEAR(Conversions::moaToMrad(1.0f), 0.290888f, 1e-4f);
  EXPECT_NEAR(Conversions::mradToMoa(1.0f), 3.43775f, 1e-3f);
}

TEST(Conversions, TemperatureRoundTripAndAnchors)
{
  // Fahrenheit -> Kelvin -> Fahrenheit
  EXPECT_NEAR(Conversions::kelvinToFahrenheit(Conversions::fahrenheitToKelvin(59.0f)), 59.0f, 1e-2f);

  // Anchors: 59 F = 15 C = 288.15 K (ICAO standard temperature)
  EXPECT_NEAR(Conversions::fahrenheitToKelvin(59.0f), 288.15f, 1e-2f);
  EXPECT_NEAR(Conversions::celsiusToKelvin(15.0f), 288.15f, 1e-3f);
}
