cmake_minimum_required(VERSION 3.13)

# This builds libappmodules.so — the TurboModule registry required by RN 0.74+.
# No *.cpp files in this directory so ReactNative-application.cmake
# falls back to its default OnLoad.cpp automatically.
project(appmodules)

include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

# ── Nubra custom native library ───────────────────────────────────────────────
# Separate shared library so NubraTickStoreJNI.loadLibrary("nubra_native") works.
# Depends on jsi (already found by ReactNative-application.cmake above).

add_library(nubra_native SHARED
    ${CMAKE_CURRENT_SOURCE_DIR}/../cpp/TickStore.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/../cpp/NubraJSI.cpp
)
target_compile_options(nubra_native PRIVATE -std=c++17 -Wall -Wextra)
target_include_directories(nubra_native PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/../cpp
)
target_link_libraries(nubra_native
    ReactAndroid::jsi
    android
    log
)
