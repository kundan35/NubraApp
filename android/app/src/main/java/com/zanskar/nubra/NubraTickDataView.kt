package com.zanskar.nubra

import android.animation.ArgbEvaluator
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.widget.LinearLayout
import androidx.appcompat.widget.AppCompatTextView

/**
 * NubraTickDataView — Fabric native view component.
 *
 * A vertical LinearLayout holding two TextViews:
 *   - priceView  : LTP formatted as ₹X,XXX.XX
 *   - changeView : absolute change + % change, green or red
 *
 * All updates arrive via TickCountRegistry.updateTick() from the mock-feed
 * thread and are posted directly to the UI thread — no React setState,
 * no bridge roundtrip.
 *
 * Result: the parent WatchlistRow React render count stays at 1 permanently
 * while prices update on screen at full native speed.
 */
class NubraTickDataView(context: Context) : LinearLayout(context) {

    private val priceView  = AppCompatTextView(context)
    private val changeView = AppCompatTextView(context)
    private var symbol: String = ""

    init {
        orientation = VERTICAL

        priceView.apply {
            setTextColor(Color.parseColor("#F1EFE8"))
            textSize   = 16f
            typeface   = Typeface.DEFAULT_BOLD
            text       = "—"
        }

        changeView.apply {
            setTextColor(Color.parseColor("#888780"))
            textSize   = 12f
            text       = ""
        }

        addView(priceView)
        addView(changeView)
    }

    fun setSymbol(newSymbol: String) {
        if (newSymbol == symbol) return
        if (symbol.isNotEmpty()) TickCountRegistry.unregisterPriceView(symbol, this)
        symbol = newSymbol
        TickCountRegistry.registerPriceView(symbol, this)
    }

    /**
     * Called from TickCountRegistry on the UI thread via post().
     * Updates price + change text and flashes the row background.
     */
    fun updateTick(ltp: Double, change: Double, changePct: Double) {
        val isUp = changePct >= 0

        priceView.text = formatPrice(ltp)

        val sign = if (isUp) "+" else ""
        changeView.text = "$sign${formatDelta(change)}  $sign${String.format("%.2f", changePct)}%"
        changeView.setTextColor(
            if (isUp) Color.parseColor("#1D9E75") else Color.parseColor("#E24B4A")
        )

        // Native flash animation — no Animated API, no React involvement
        val flashColor = if (isUp) Color.parseColor("#331D9E75")
                         else      Color.parseColor("#33E24B4A")

        ValueAnimator.ofObject(ArgbEvaluator(), flashColor, Color.TRANSPARENT).apply {
            duration = 600
            addUpdateListener { setBackgroundColor(it.animatedValue as Int) }
            start()
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (symbol.isNotEmpty()) TickCountRegistry.registerPriceView(symbol, this)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        if (symbol.isNotEmpty()) TickCountRegistry.unregisterPriceView(symbol, this)
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private fun formatPrice(n: Double): String {
        return "₹" + String.format("%,.2f", n)
            .replace(",", ",")   // ensure en-IN style grouping
    }

    private fun formatDelta(n: Double): String = String.format("%.2f", n)
}
