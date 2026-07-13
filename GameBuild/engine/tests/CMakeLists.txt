# Native unit tests (LongRange task 0.3) — GoogleTest via find_package.
# Only built in the non-Emscripten (native) branch of the parent CMakeLists.

find_package(GTest REQUIRED)
include(GoogleTest)

add_executable(engine_tests
  test_conversions.cpp
  test_atmosphere.cpp
  test_zeroing.cpp
)

target_link_libraries(engine_tests PRIVATE
  ballistics_core
  GTest::gtest
  GTest::gtest_main
)

gtest_discover_tests(engine_tests)
