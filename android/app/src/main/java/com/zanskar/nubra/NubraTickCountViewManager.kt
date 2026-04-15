package com.zanskar.nubra

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * NubraTickCountViewManager — Fabric ViewManager.
 *
 * Registers "NubraTickCountView" as a native UI component usable from JS.
 * The only prop it accepts is `symbol` — everything else (tick count text,
 * colour, font) is managed entirely on the native side.
 *
 * Fabric renders this view once.  All subsequent text updates happen
 * natively via TickCountRegistry → NubraTickCountView.post() — React
 * never re-renders the component.
 */
class NubraTickCountViewManager : SimpleViewManager<NubraTickCountView>() {

    companion object {
        const val REACT_CLASS = "NubraTickCountView"
    }

    override fun getName(): String = REACT_CLASS

    override fun createViewInstance(context: ThemedReactContext): NubraTickCountView =
        NubraTickCountView(context)

    /** JS prop: symbol="RELIANCE" — tells the view which counter to track. */
    @ReactProp(name = "symbol")
    fun setSymbol(view: NubraTickCountView, symbol: String) {
        view.setSymbol(symbol)
    }
}
