package com.zanskar.nubra

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import kotlin.random.Random

/**
 * NubraMarketWebSocket — React Native NativeModule
 *
 * Responsibilities:
 *  - Opens a WebSocket to a real market data server (when available).
 *  - Parses incoming JSON tick messages and writes them to the C++ TickStore
 *    via JNI so JS can read them synchronously at 60fps without the bridge.
 *  - Fires DeviceEventEmitter events for connection state.
 *  - Installs global.nubraTickStore on the Hermes JSI runtime at startup.
 *  - Runs a watchlist mock feed (100–300ms random intervals) when no real
 *    server is connected — same code path a live server tick would take.
 *
 * Expected WebSocket message formats:
 *  {"type":"tick",  "data":{symbol, ltp, open, high, low, volume, oi,
 *                            timestamp, bid, ask, change, changePct}}
 *  {"type":"ticks", "data":[...]}
 */
class NubraMarketWebSocketModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG           = "NubraWS"
        private const val MAX_RETRIES   = 5
        private const val BASE_DELAY_MS = 1_000L

        /** Reference prices for the 20 NSE watchlist instruments. */
        private val WATCHLIST_BASE_PRICES = mapOf(
            "RELIANCE"   to 2_850.0,
            "TCS"        to 3_900.0,
            "HDFCBANK"   to 1_680.0,
            "INFY"       to 1_750.0,
            "ICICIBANK"  to 1_250.0,
            "KOTAKBANK"  to 1_800.0,
            "LT"         to 3_500.0,
            "SBIN"       to   800.0,
            "AXISBANK"   to 1_150.0,
            "BAJFINANCE" to 7_200.0,
            "HINDUNILVR" to 2_450.0,
            "BHARTIARTL" to 1_700.0,
            "ITC"        to   460.0,
            "ASIANPAINT" to 2_300.0,
            "MARUTI"     to 12_500.0,
            "WIPRO"      to   530.0,
            "TITAN"      to 3_500.0,
            "ULTRACEMCO" to 11_500.0,
            "SUNPHARMA"  to 1_700.0,
            "NESTLEIND"  to 2_250.0,
        )
    }

    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    private val mainHandler   = Handler(Looper.getMainLooper())
    private val mockExecutor: ScheduledExecutorService =
        Executors.newSingleThreadScheduledExecutor { r ->
            Thread(r, "nubra-mock-ticker").also { it.isDaemon = true }
        }

    @Volatile private var socket:          WebSocket? = null
    @Volatile private var shouldReconnect: Boolean    = false
    @Volatile private var jsiInstalled:    Boolean    = false
    @Volatile private var isConnected:     Boolean    = false

    private var wsUrl:      String = ""
    private var retryCount: Int    = 0

    // Watchlist mock feed state
    private data class MockSpotState(var spot: Double, val base: Double)

    private val watchlistMockState = mutableMapOf<String, MockSpotState>()
    @Volatile private var watchlistMockJob: ScheduledFuture<*>? = null

    // ── Module name ────────────────────────────────────────────────────────

    override fun getName(): String = "NubraMarketWebSocket"

    // ── Lifecycle ──────────────────────────────────────────────────────────

    override fun initialize() {
        super.initialize()
        reactContext.runOnJSQueueThread {
            val ptr = reactContext.javaScriptContextHolder?.get() ?: 0L
            if (ptr != 0L && !jsiInstalled) {
                NubraTickStoreJNI.installJSI(ptr)
                jsiInstalled = true
            }
        }
    }

    override fun onCatalystInstanceDestroy() {
        shouldReconnect = false
        socket?.close(1000, "App destroyed")
        stopWatchlistFeedInternal()
        client.dispatcher.executorService.shutdown()
        mockExecutor.shutdown()
    }

    // ── React Methods ──────────────────────────────────────────────────────

    @ReactMethod
    fun connect(authToken: String) {
        wsUrl = if (authToken.startsWith("ws://") || authToken.startsWith("wss://")) {
            authToken
        } else {
            "wss://market.nubra.app/ws?token=$authToken"
        }
        shouldReconnect = true
        retryCount      = 0
        openSocket()
    }

    @ReactMethod
    fun disconnect() {
        shouldReconnect = false
        socket?.close(1000, "Disconnected by user")
        socket = null
    }

    /**
     * subscribeWatchlist(symbols)
     *
     * Starts a mock feed that writes ticks for the given symbols into the
     * TickStore at 100–300 ms random intervals, updating a random subset of
     * 3–7 symbols per cycle.  Each tick goes through NubraTickStoreJNI.writeTick()
     * — the same path a live WebSocket tick would take.
     * Stops automatically when a real WebSocket connection opens.
     */
    @ReactMethod
    fun subscribeWatchlist(symbols: ReadableArray) {
        if (isConnected) return   // real server data takes over
        stopWatchlistFeedInternal()

        val symbolList = (0 until symbols.size()).mapNotNull { symbols.getString(it) }

        symbolList.forEach { sym ->
            val base = WATCHLIST_BASE_PRICES[sym] ?: 1_000.0
            watchlistMockState[sym] = MockSpotState(spot = base, base = base)
            // Seed tick — rows show data immediately without waiting for first update
            NubraTickStoreJNI.writeTick(
                symbol    = sym, ltp = base, open = base,
                high      = base, low = base, volume = 0.0, oi = 0.0,
                timestamp = System.currentTimeMillis(),
                bid       = base - 0.05, ask = base + 0.05,
                change    = 0.0, changePct = 0.0,
            )
        }

        Log.i(TAG, "Watchlist mock feed started: ${symbolList.size} symbols")
        scheduleNextWatchlistTick(symbolList)
    }

    /** Stops the watchlist mock feed (called by the UI start/stop toggle). */
    @ReactMethod
    fun stopWatchlistFeed() {
        stopWatchlistFeedInternal()
        Log.i(TAG, "Watchlist mock feed stopped by user")
    }

    // ── WebSocket ──────────────────────────────────────────────────────────

    private fun openSocket() {
        val request = Request.Builder().url(wsUrl).build()
        socket = client.newWebSocket(request, object : WebSocketListener() {

            override fun onOpen(ws: WebSocket, response: Response) {
                retryCount  = 0
                isConnected = true
                Log.i(TAG, "Connected to $wsUrl")
                stopWatchlistFeedInternal()   // real data takes over
                emitState("CONNECTED")
            }

            override fun onMessage(ws: WebSocket, text: String) {
                parseMessage(text)
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                isConnected = false
                Log.e(TAG, "WebSocket failure: ${t.message}")
                if (shouldReconnect) scheduleReconnect()
                else emitState("DISCONNECTED")
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                isConnected = false
                Log.i(TAG, "Closed [$code] $reason")
                if (shouldReconnect && code != 1000) scheduleReconnect()
                else emitState("DISCONNECTED")
            }
        })
    }

    private fun scheduleReconnect() {
        if (retryCount >= MAX_RETRIES) {
            emitState("DISCONNECTED")
            return
        }
        retryCount++
        val delayMs = BASE_DELAY_MS * (1L shl (retryCount - 1).coerceAtMost(4))
        Log.i(TAG, "Reconnecting in ${delayMs}ms (attempt $retryCount)")
        emitReconnecting(retryCount, delayMs.toInt())
        mainHandler.postDelayed({ if (shouldReconnect) openSocket() }, delayMs)
    }

    // ── Message parsing ────────────────────────────────────────────────────

    private fun parseMessage(text: String) {
        try {
            val msg = JSONObject(text)
            when (msg.getString("type")) {
                "tick"  -> writeTick(msg.getJSONObject("data"))
                "ticks" -> {
                    val arr = msg.getJSONArray("data")
                    for (i in 0 until arr.length()) writeTick(arr.getJSONObject(i))
                }
                else    -> { /* unknown type — ignore */ }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Parse error: ${e.message}")
        }
    }

    private fun writeTick(d: JSONObject) {
        NubraTickStoreJNI.writeTick(
            symbol    = d.getString("symbol"),
            ltp       = d.getDouble("ltp"),
            open      = d.optDouble("open",      0.0),
            high      = d.optDouble("high",      0.0),
            low       = d.optDouble("low",       0.0),
            volume    = d.optDouble("volume",    0.0),
            oi        = d.optDouble("oi",        0.0),
            timestamp = d.optLong("timestamp",   System.currentTimeMillis()),
            bid       = d.optDouble("bid",       0.0),
            ask       = d.optDouble("ask",       0.0),
            change    = d.optDouble("change",    0.0),
            changePct = d.optDouble("changePct", 0.0),
        )
    }

    // ── Watchlist mock feed ────────────────────────────────────────────────

    /**
     * Schedules the next tick emission after a random 100–300 ms delay,
     * then re-schedules itself — simulating a live streaming feed.
     */
    private fun scheduleNextWatchlistTick(symbols: List<String>) {
        if (isConnected) return
        val delayMs = Random.nextLong(100L, 301L)
        watchlistMockJob = mockExecutor.schedule({
            emitWatchlistTicks(symbols)
            scheduleNextWatchlistTick(symbols)
        }, delayMs, TimeUnit.MILLISECONDS)
    }

    /**
     * Picks a random subset of 3–7 symbols and writes updated ticks.
     * Price drifts ±0.03% per tick to simulate realistic market movement.
     */
    private fun emitWatchlistTicks(symbols: List<String>) {
        val now   = System.currentTimeMillis()
        val count = Random.nextInt(3, minOf(8, symbols.size + 1))
        symbols.shuffled().take(count).forEach { sym ->
            val state  = watchlistMockState[sym] ?: return@forEach
            val drift  = state.spot * Random.nextDouble(-0.0003, 0.0003)
            state.spot = (state.spot + drift).coerceIn(state.base * 0.80, state.base * 1.20)

            val change = state.spot - state.base
            val chgPct = change / state.base * 100.0

            NubraTickStoreJNI.writeTick(
                symbol    = sym,
                ltp       = state.spot,
                open      = state.base,
                high      = maxOf(state.spot, state.base),
                low       = minOf(state.spot, state.base),
                volume    = Random.nextDouble(1_000_000.0, 50_000_000.0),
                oi        = 0.0,
                timestamp = now,
                bid       = state.spot - 0.05,
                ask       = state.spot + 0.05,
                change    = change,
                changePct = chgPct,
            )
        }
    }

    private fun stopWatchlistFeedInternal() {
        watchlistMockJob?.cancel(false)
        watchlistMockJob = null
        watchlistMockState.clear()
    }

    // ── Event emitters ─────────────────────────────────────────────────────

    private fun emitState(state: String) {
        emit("onSocketState", Arguments.createMap().apply {
            putString("state", state)
        })
    }

    private fun emitReconnecting(attempt: Int, nextRetryMs: Int) {
        emit("onSocketState", Arguments.createMap().apply {
            putString("state",    "RECONNECTING")
            putInt("attempt",     attempt)
            putInt("nextRetryMs", nextRetryMs)
        })
    }

    private fun emit(event: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, params)
    }

    private fun send(msg: JSONObject) {
        socket?.send(msg.toString())
    }
}
