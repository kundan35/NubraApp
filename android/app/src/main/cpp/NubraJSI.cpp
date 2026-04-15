// NubraJSI.cpp
// JNI entry points:
//   1. installJSI   — installs global.nubraTickStore on the Hermes runtime.
//   2. writeTick    — called from Kotlin OkHttp thread to push a tick into C++.
//
// Threading model:
//   installJSI runs on the JS thread (called from Module.initialize via runOnJSQueueThread).
//   writeTick  runs on the OkHttp thread.
//   TickStore::drainDirty runs on the JS thread (from a requestAnimationFrame loop).
//   TickStore uses a mutex internally for write/read safety.

#include "TickStore.h"

#include <jni.h>
#include <jsi/jsi.h>
#include <android/log.h>
#include <memory>

#define LOG_TAG "NubraJSI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

using namespace facebook::jsi;
using namespace nubra;

// ── JSI Installation ───────────────────────────────────────────────────────
// Called from Kotlin: NubraTickStoreJNI.installJSI(jsContext.get())

extern "C" JNIEXPORT void JNICALL
Java_com_zanskar_nubra_NubraTickStoreJNI_installJSI(
    JNIEnv* /* env */,
    jobject /* thiz */,
    jlong runtimePtr)
{
  if (runtimePtr == 0) {
    LOGE("installJSI: null runtime pointer — skipping");
    return;
  }

  auto* runtime = reinterpret_cast<Runtime*>(runtimePtr);

  // Share the process-wide singleton without deleting it on shared_ptr destruction.
  auto hostObject = std::shared_ptr<TickStore>(
      &TickStore::shared(),
      [](TickStore*) { /* singleton — no-op deleter */ }
  );

  runtime->global().setProperty(
      *runtime,
      "nubraTickStore",
      Object::createFromHostObject(*runtime, std::move(hostObject))
  );

  LOGI("global.nubraTickStore installed");
}

// ── Tick write from Kotlin ─────────────────────────────────────────────────
// Called from OkHttp message callback on its thread pool.

extern "C" JNIEXPORT void JNICALL
Java_com_zanskar_nubra_NubraTickStoreJNI_writeTick(
    JNIEnv* env,
    jobject /* thiz */,
    jstring jSymbol,
    jdouble ltp,
    jdouble open,
    jdouble high,
    jdouble low,
    jdouble volume,
    jdouble oi,
    jlong   timestamp,
    jdouble bid,
    jdouble ask,
    jdouble change,
    jdouble changePct)
{
  const char* sym = env->GetStringUTFChars(jSymbol, nullptr);
  if (!sym) return;

  RawTick tick;
  tick.symbol    = sym;
  tick.ltp       = ltp;
  tick.open      = open;
  tick.high      = high;
  tick.low       = low;
  tick.volume    = volume;
  tick.oi        = oi;
  tick.timestamp = static_cast<int64_t>(timestamp);
  tick.bid       = bid;
  tick.ask       = ask;
  tick.change    = change;
  tick.changePct = changePct;

  env->ReleaseStringUTFChars(jSymbol, sym);

  TickStore::shared().writeTick(tick);
}
