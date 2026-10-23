# For more information about using CMake with Android Studio, read the
# documentation: https://d.android.com/studio/projects/add-native-code.html.
# For more examples on how to use CMake, see https://github.com/android/ndk-samples.

# Sets the minimum CMake version required for this project.
cmake_minimum_required(VERSION 3.22.1)

# Declares the project name. The project name can be accessed via ${ PROJECT_NAME},
# Since this is the top level CMakeLists.txt, the project name is also accessible
# with ${CMAKE_PROJECT_NAME} (both CMake variables are in-sync within the top level
# build script scope).
project("openbubblesextension")

set(BOX2D_BUILD_EXAMPLES OFF CACHE BOOL "Build Box2D examples")
set(BOX2D_INSTALL ON CACHE BOOL "Install Box2D libs, includes, and CMake scripts")
add_subdirectory("${CMAKE_CURRENT_LIST_DIR}/../../vendor/box2d/Box2D" "${CMAKE_CURRENT_BINARY_DIR}/box2d")

add_compile_options("-fno-fast-math")

# Creates and names a library, sets it as either STATIC
# or SHARED, and provides the relative paths to its source code.
# You can define multiple libraries, and CMake builds them for you.
# Gradle automatically packages shared libraries with your APK.
#
# In this top level CMakeLists.txt, ${CMAKE_PROJECT_NAME} is used to define
# the target library name; in the sub-module's CMakeLists.txt, ${PROJECT_NAME}
# is preferred for the same purpose.
#
# In order to load a library into your app from Java/Kotlin, you must call
# System.loadLibrary() and pass the name of the library defined here;
# for GameActivity/NativeActivity derived applications, the same library name must be
# used in the AndroidManifest.xml file.

add_library(${CMAKE_PROJECT_NAME} SHARED
        # Pool
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/pool/PoolJNI.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/pool/PoolTable.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/pool/PoolBall.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/pool/PoolContactListener.cpp

        # Knockout
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/knockout/KnockoutJNI.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/knockout/KnockoutTable.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/knockout/KnockoutPiece.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/knockout/KnockoutContactListener.cpp

        # Golf
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/golf/GolfJNI.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/golf/GolfTable.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/golf/GolfBall.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/golf/GolfContactListener.cpp

        # Shuffle
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/shuffle/ShuffleJNI.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/shuffle/ShuffleTable.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/shuffle/ShufflePuck.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/shuffle/ShuffleContactListener.cpp
)

set_source_files_properties(
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/pool/PoolJNI.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/pool/PoolTable.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/pool/PoolBall.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/pool/PoolContactListener.cpp

        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/knockout/KnockoutJNI.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/knockout/KnockoutTable.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/knockout/KnockoutPiece.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/knockout/KnockoutContactListener.cpp

        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/golf/GolfJNI.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/golf/GolfTable.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/golf/GolfBall.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/golf/GolfContactListener.cpp

        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/shuffle/ShuffleJNI.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/shuffle/ShuffleTable.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/shuffle/ShufflePuck.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../../vendor/openpigeon/app/src/main/cpp/shuffle/ShuffleContactListener.cpp

        PROPERTIES COMPILE_OPTIONS "-fno-fast-math;-ffp-contract=fast"
)

message(BOX2D_INCLUDE_DIRS="${BOX2D_INCLUDE_DIRS}")
target_include_directories(${CMAKE_PROJECT_NAME}
        PRIVATE "${CMAKE_CURRENT_LIST_DIR}/../../vendor/box2d/Include"
)

# Specifies libraries CMake should link to your target library. You
# can link libraries from various origins, such as libraries defined in this
# build script, prebuilt third-party libraries, or Android system libraries.
target_link_libraries(${CMAKE_PROJECT_NAME}
        # List libraries link to the target library
        android
        log
        Box2D
        c++_shared)
# Preserve compatibility with both 4 KB and 16 KB Android memory pages.
target_link_options(${CMAKE_PROJECT_NAME} PRIVATE "-Wl,-z,max-page-size=16384" "-Wl,-z,common-page-size=16384")
