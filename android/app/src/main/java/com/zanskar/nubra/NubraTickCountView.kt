package com.zanskar.nubra

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import androidx.appcompat.widget.AppCompatTextView

/**
 * NubraTickCountView — Fabric native view component.
 *
 * A plain TextView that registers itself with TickCountRegistry when
 * mounted.  Its text is updated directly from the native mock-feed thread
 * via post() — no React setState, no bridge roundtrip.
 *
 * This is the core Fabric demonstration:
 *   - React renders this view once (render count = 1).
 *   - Every subsequent tick update goes: native thread → post() → setText()
 *   - React never sees the update → React render count stays at 1.
 */
class NubraTickCountView(context: Context) : AppCompatTextView(context) {

    private var symbol: String = ""

    init {
        setTextColor(Color.parseColor("#6060AA"))
        textSize   = 9f
        typeface   = Typeface.MONOSPACE
        text       = "ticks: 0"
    }

    /** Called by ViewManager when the JS `symbol` prop is set. */
    fun setSymbol(newSymbol: String) {
        if (newSymbol == symbol) return
        if (symbol.isNotEmpty()) TickCountRegistry.unregisterView(symbol, this)
        symbol = newSymbol
        TickCountRegistry.registerView(symbol, this)
    }

    /** Called directly from TickCountRegistry on the UI thread via post(). */
    fun updateCount(count: Int) {
        text = "ticks: $count"
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (symbol.isNotEmpty()) TickCountRegistry.registerView(symbol, this)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        if (symbol.isNotEmpty()) TickCountRegistry.unregisterView(symbol, this)
    }
}
