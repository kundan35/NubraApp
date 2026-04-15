cmake_minimum_required(VERSION 3.22.1)
project(nubra_native)

# React Native provides JSI headers and the JSI library via a prefab AAR.
find_package(ReactAndroid REQUIRED CONFIG)
find_package(fbjni       REQUIRED CONFIG)

add_library(nubra_native SHARED
    TickStore.cpp
    NubraJSI.cpp
)

target_compile_options(nubra_native PRIVATE -std=c++17 -Wall -Wextra)

target_include_directories(nubra_native PRIVATE ${CMAKE_SOURCE_DIR})

target_link_libraries(nubra_native
    ReactAndroid::jsi   # JSI runtime headers + lib
    fbjni::fbjni        # JNI helpers (for JNIEnv safety)
    android
    log
)
