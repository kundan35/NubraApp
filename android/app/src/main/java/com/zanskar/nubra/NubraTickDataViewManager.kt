package com.zanskar.nubra

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * NubraTickDataViewManager — Fabric ViewManager for NubraTickDataView.
 *
 * Registered name: "NubraTickDataView"
 * React-side wrapper: src/features/watchlist/presentation/TickDataView.tsx
 *
 * The only prop JS needs to set is `symbol`.  After that, all price updates
 * flow through TickCountRegistry.updateTick() → view.post() — zero React
 * re-renders required.
 */
class NubraTickDataViewManager : SimpleViewManager<NubraTickDataView>() {

    override fun getName(): String = "NubraTickDataView"

    override fun createViewInstance(context: ThemedReactContext): NubraTickDataView =
        NubraTickDataView(context)

    @ReactProp(name = "symbol")
    fun setSymbol(view: NubraTickDataView, symbol: String) {
        view.setSymbol(symbol)
    }
}
