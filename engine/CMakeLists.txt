cmake_minimum_required(VERSION 3.16)
project(BallisticsToolkit VERSION 1.0.0 LANGUAGES CXX)

# C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Build type
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Compiler options
add_compile_options(-Wall -Wextra -Wpedantic -Werror -O3 -ffast-math)

# WebAssembly linker flags for embind
set(CMAKE_EXECUTABLE_SUFFIX ".js")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue','setValue','stackAlloc','stackSave','stackRestore']")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s EXPORTED_FUNCTIONS=['_malloc','_free']")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s ALLOW_MEMORY_GROWTH=1")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s MODULARIZE=1")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s EXPORT_NAME='BallisticsToolkit'")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s EXPORT_ES6=1")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s SINGLE_FILE=1")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s DISABLE_EXCEPTION_CATCHING=0")
# WebGL support - using OpenGL ES 3.0 via Emscripten
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s USE_WEBGL2=1")
set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -s FULL_ES3=1")

# WebAssembly executable with embind
file(GLOB_RECURSE SOURCES "src/*.cpp")
add_executable(ballistics_toolkit_wasm ${SOURCES})

# Link embind library
target_link_libraries(ballistics_toolkit_wasm embind)

# Include directories
target_include_directories(ballistics_toolkit_wasm PRIVATE
  include
)

# NOTE (LongRange task 0.2): the upstream `copy_web_files` custom target was removed
# here. It copied BTK's `web/` UI into the build dir, but `engine/` is our owned
# physics-core copy and intentionally does not include `web/`. This is a build-plumbing
# edit to our copy, not an oracle patch — pristine BallisticsToolkit/ is unchanged.
