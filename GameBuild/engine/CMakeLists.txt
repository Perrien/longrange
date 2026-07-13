cmake_minimum_required(VERSION 3.16)
project(BallisticsToolkit VERSION 1.0.0 LANGUAGES CXX)

# C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Build type
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# All C++ sources. `bindings.cpp` is the embind interface (Emscripten-only); the
# native branch filters it out below. The rendering sources keep their embind
# entry points behind `#ifdef __EMSCRIPTEN__`, so they build natively too.
file(GLOB_RECURSE ALL_SOURCES "src/*.cpp")

if(EMSCRIPTEN)
    # ------------------------------------------------------------------
    # WebAssembly build (embind) — unchanged from upstream BTK.
    # ------------------------------------------------------------------
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

    # WebAssembly executable with embind (all sources, as upstream)
    add_executable(ballistics_toolkit_wasm ${ALL_SOURCES})
    target_link_libraries(ballistics_toolkit_wasm embind)
    target_include_directories(ballistics_toolkit_wasm PRIVATE include)

    # NOTE (LongRange task 0.2): the upstream `copy_web_files` custom target was removed
    # here. It copied BTK's `web/` UI into the build dir, but `engine/` is our owned
    # physics-core copy and intentionally does not include `web/`. This is a build-plumbing
    # edit to our copy, not an oracle patch — pristine BallisticsToolkit/ is unchanged.
else()
    # ------------------------------------------------------------------
    # Native build (LongRange task 0.3) — for host-compiled unit tests via
    # CTest, with no Emscripten/embind. `bindings.cpp` is excluded (embind).
    # -Werror is intentionally dropped here: the host compiler (e.g. a newer
    # Apple clang) may emit warnings on upstream code that emscripten's clang
    # does not, and per the execution protocol we do not edit the copied C++
    # sources to satisfy them. Numeric flags (-O3 -ffast-math) match the WASM
    # build so native test behaviour tracks the shipped engine.
    add_compile_options(-Wall -Wextra -Wpedantic -O3 -ffast-math)

    set(CORE_SOURCES ${ALL_SOURCES})
    list(FILTER CORE_SOURCES EXCLUDE REGEX "bindings\\.cpp$")

    add_library(ballistics_core STATIC ${CORE_SOURCES})
    target_include_directories(ballistics_core PUBLIC include)

    enable_testing()
    add_subdirectory(tests)
endif()
