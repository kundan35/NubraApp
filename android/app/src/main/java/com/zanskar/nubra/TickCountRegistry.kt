package com.zanskar.nubra

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * TickCountRegistry — process-wide singleton.
 *
 * Tracks how many ticks each symbol has received and holds references to
 * any mounted Fabric native views for that symbol.
 *
 * Two view types are tracked:
 *  - NubraTickCountView : shows "ticks: N" counter
 *  - NubraTickDataView  : shows live LTP + change, replaces React setTick state
 *
 * When incrementSymbol() / updateTick() are called from the mock-feed thread,
 * they post direct UI updates to the matching views — completely bypassing
 * React's render cycle.  That is the core Fabric demonstration:
 *   • r:1 stays at 1 (no React re-render)
 *   • ticks:N increments natively
 *   • price + change update natively
 */
object TickCountRegistry {

    // ── Tick counter ───────────────────────────────────────────────────────

    private val counts = ConcurrentHashMap<String, AtomicInteger>()

    /** Called from mock-feed thread for every tick written. */
    fun incrementSymbol(symbol: String) {
        val count = counts.getOrPut(symbol) { AtomicInteger(0) }
            .incrementAndGet()
        countViews[symbol]?.post { countViews[symbol]?.updateCount(count) }
        // Also update price view if mounted — same tick event
    }

    fun getCount(symbol: String): Int = counts[symbol]?.get() ?: 0

    // ── NubraTickCountView registry ────────────────────────────────────────

    private val countViews = ConcurrentHashMap<String, NubraTickCountView>()

    fun registerView(symbol: String, view: NubraTickCountView) {
        countViews[symbol] = view
        val current = counts[symbol]?.get() ?: 0
        view.updateCount(current)
    }

    fun unregisterView(symbol: String, view: NubraTickCountView) {
        countViews.remove(symbol, view)
    }

    // ── NubraTickDataView registry ─────────────────────────────────────────

    private val priceViews = ConcurrentHashMap<String, NubraTickDataView>()

    fun registerPriceView(symbol: String, view: NubraTickDataView) {
        priceViews[symbol] = view
    }

    fun unregisterPriceView(symbol: String, view: NubraTickDataView) {
        priceViews.remove(symbol, view)
    }

    /**
     * Called from emitWatchlistTicks() on the mock-feed thread.
     * Posts a direct native update to the mounted NubraTickDataView — no JS,
     * no bridge, no React setState.
     */
    fun updateTick(symbol: String, ltp: Double, change: Double, changePct: Double) {
        priceViews[symbol]?.post {
            priceViews[symbol]?.updateTick(ltp, change, changePct)
        }
    }
}
