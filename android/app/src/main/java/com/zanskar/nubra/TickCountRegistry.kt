package com.zanskar.nubra

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * TickCountRegistry — process-wide singleton.
 *
 * Tracks how many ticks each symbol has received and holds weak
 * references to any mounted NubraTickCountView for that symbol.
 *
 * When incrementSymbol() is called from the mock-feed thread,
 * it posts a direct UI update to the matching view — completely
 * bypassing React's render cycle. That is the Fabric demonstration:
 * the native view text changes while the React render count stays at 1.
 */
object TickCountRegistry {

    // Tick count per symbol — thread-safe
    private val counts = ConcurrentHashMap<String, AtomicInteger>()

    // One view per symbol (the mounted NubraTickCountView)
    private val views = ConcurrentHashMap<String, NubraTickCountView>()

    /** Called from mock-feed thread for every tick written. */
    fun incrementSymbol(symbol: String) {
        val count = counts.getOrPut(symbol) { AtomicInteger(0) }
            .incrementAndGet()
        // Direct native update — no JS bridge, no React setState
        views[symbol]?.post { views[symbol]?.updateCount(count) }
    }

    fun registerView(symbol: String, view: NubraTickCountView) {
        views[symbol] = view
        // Show current count immediately when view mounts
        val current = counts[symbol]?.get() ?: 0
        view.updateCount(current)
    }

    fun unregisterView(symbol: String, view: NubraTickCountView) {
        views.remove(symbol, view)
    }

    fun getCount(symbol: String): Int = counts[symbol]?.get() ?: 0
}
