// LongRange task 0.3 — unit test (b): ISA standard atmosphere spot values.
// The standard atmosphere anchors air density / speed of sound used by the drag
// model. Values per Wiki/atmosphere-air-density.md: ICAO sea-level standard is
// 15 C, 101325 Pa, dry-air density 1.225 kg/m^3, speed of sound 340.3 m/s.
//
// NOTE: btk's Atmosphere::standard() uses 50% relative humidity, which lowers
// density slightly below the dry-air 1.225 figure (moist air is less dense), so
// the tolerances below intentionally allow that small offset.

#include <gtest/gtest.h>

#include "physics/atmosphere.h"

using btk::physics::Atmosphere;

TEST(Atmosphere, StandardSeaLevelISA)
{
  const Atmosphere a = Atmosphere::standard();

  // 15 C = 288.15 K, sea level
  EXPECT_NEAR(a.getTemperature(), 288.15f, 0.1f);
  EXPECT_NEAR(a.getAltitude(), 0.0f, 1e-3f);

  // Density ~1.225 kg/m^3 (50% RH pulls it a touch lower than the dry figure)
  EXPECT_NEAR(a.getAirDensity(), 1.225f, 0.02f);

  // Speed of sound ~340.3 m/s at 15 C
  EXPECT_NEAR(a.getSpeedOfSound(), 340.3f, 3.0f);
}
