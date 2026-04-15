package com.zanskar.nubra

import com.facebook.soloader.SoLoader

/**
 * JNI bridge to the C++ TickStore.
 *
 * installJSI  — registers global.nubraTickStore on the Hermes runtime.
 *               Must be called on the JS thread.
 *
 * writeTick   — writes a tick into the C++ store from any thread
 *               (typically OkHttp's thread pool).
 */
object NubraTickStoreJNI {

    init {
        SoLoader.loadLibrary("nubra_native")
    }

    @JvmStatic
    external fun installJSI(jsiRuntimePointer: Long)

    @JvmStatic
    external fun writeTick(
        symbol:    String,
        ltp:       Double,
        open:      Double,
        high:      Double,
        low:       Double,
        volume:    Double,
        oi:        Double,
        timestamp: Long,
        bid:       Double,
        ask:       Double,
        change:    Double,
        changePct: Double,
    )
}
