# High Level Design (HLD)

## System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NubraApp                                      │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    React Native (JS)                          │   │
│  │                                                               │   │
│  │   ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │   │
│  │   │ Presentation│    │  Application │    │    Domain     │  │   │
│  │   │             │    │              │    │               │  │   │
│  │   │WatchlistScr │───►│WatchlistVM   │───►│IWatchlistRepo │  │   │
│  │   │WatchlistRow │    │(MVI Store)   │    │ITickRepository│  │   │
│  │   │DetailSheet  │    │              │    │GetWatchlistUC │  │   │
│  │   │PriceGraph   │    └──────────────┘    └───────┬───────┘  │   │
│  │   └──────┬──────┘                                │           │   │
│  │          │ ITickRepository                        │ implements│   │
│  │          │                        ┌──────────────▼───────┐  │   │
│  │          └───────────────────────►│      Data Layer       │  │   │
│  │                                   │                       │  │   │
│  │                                   │  WatchlistRepository  │  │   │
│  │                                   │  TickRepository       │  │   │
│  │                                   └──────────┬────────────┘  │   │
│  └──────────────────────────────────────────────┼───────────────┘   │
│                                                 │                    │
│                              ┌──────────────────▼──────────────┐    │
│                              │    Core / Infrastructure          │    │
│                              │                                   │    │
│                              │  TickStoreAccessor (JSI bridge)   │    │
│                              │  BackpressureMonitor              │    │
│                              └──────────────────┬───────────────┘    │
│                                                 │ JSI                 │
│  ┌──────────────────────────────────────────────▼───────────────┐   │
│  │                   Android Native (C++ / Kotlin)               │   │
│  │                                                               │   │
│  │  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐   │   │
│  │  │   TickStore  │    │  NubraJSI    │    │NubraMarketWS  │   │   │
│  │  │  (C++ map)   │◄───│ HostObject   │    │Module(Kotlin) │   │   │
│  │  │  mutex lock  │    │ installJSI() │    │               │   │   │
│  │  └──────┬───────┘    └──────────────┘    └───────┬───────┘   │   │
│  │         │ JNI                                     │           │   │
│  │  ┌──────▼───────┐                        ┌───────▼───────┐   │   │
│  │  │NubraTickStore│                        │ScheduledExec  │   │   │
│  │  │JNI (Kotlin)  │                        │MockFeed       │   │   │
│  │  └──────────────┘                        └───────────────┘   │   │
│  └───────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | Layer | Responsibility |
|---|---|---|
| `WatchlistScreen` | Presentation | FlatList, header, feed toggle, DI wiring |
| `WatchlistRow` | Presentation | Per-row rAF poll, flash animation, render count |
| `InstrumentDetailSheet` | Presentation | Slide-up modal, price history, graph |
| `PriceLineGraph` | Presentation | Pure View-based line chart |
| `WatchlistViewModel` | Application | MVI store — reducer + side effects |
| `WatchlistState/Intent` | Application | State shape + all valid user actions |
| `ITickRepository` | Domain | Contract for reading latest tick |
| `IWatchlistRepository` | Domain | Contract for watchlist CRUD |
| `GetWatchlistUseCase` | Domain | Orchestrates watchlist load |
| `TickRepository` | Data | Reads from C++ JSI TickStore |
| `WatchlistRepository` | Data | AsyncStorage persistence |
| `TickStoreAccessor` | Core | JS wrapper around `global.nubraTickStore` |
| `NubraMarketWebSocketModule` | Native | WebSocket + mock feed + JSI install |
| `TickStore` (C++) | Native | Thread-safe tick map, JSI HostObject |
| `NubraJSI` (C++) | Native | Installs HostObject into Hermes runtime |
| `NubraTickStoreJNI` (Kotlin) | Native | JNI bridge — Kotlin → C++ writeTick |

---

## Communication Channels

```
┌──────────────────────────────────────────────────────────────┐
│                                                               │
│   JS → Native (setup calls only — not on hot path)           │
│   ─────────────────────────────────────────────────────────  │
│   NativeModules.NubraMarketWebSocket.subscribeWatchlist()     │
│   NativeModules.NubraMarketWebSocket.stopWatchlistFeed()      │
│   NativeModules.NubraMarketWebSocket.connect()                │
│                        ▼ RN Bridge (one-time setup)           │
│                   Kotlin @ReactMethod                         │
│                                                               │
│   Native → JS (hot path — zero bridge)                        │
│   ─────────────────────────────────────────────────────────  │
│   Kotlin → NubraTickStoreJNI.writeTick()                      │
│          → C++ TickStore::writeTick()  [JNI, mutex lock]      │
│          ← JS requestAnimationFrame                           │
│          → global.nubraTickStore.getLatest(symbol)  [JSI]     │
│          ← RawTick object  [no serialization]                 │
│                                                               │
│   Native → JS (connection events)                             │
│   ─────────────────────────────────────────────────────────  │
│   DeviceEventEmitter "onSocketState"  [RN Bridge]             │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## App Startup Sequence

```
App Launch
    │
    ▼
App.tsx — di.initialise()
    │         └── BackpressureMonitor.start()
    │
    ▼
NubraMarketWebSocketModule.initialize()
    │   (called by RN on native module init)
    └── reactContext.runOnJSQueueThread {
            NubraTickStoreJNI.installJSI(jsContextPtr)
                └── NubraJSI.cpp: rt.global().setProperty(
                        "nubraTickStore", TickStore::shared())
        }
    │
    ▼
AppNavigator renders → WatchlistScreen mounts
    │
    ▼
dispatch({ type: 'LOAD' })
    │   └── WatchlistRepository.getWatchlists()  [AsyncStorage]
    │   └── set state = { type: 'ready', items: [...20 symbols] }
    │   └── NativeModules.subscribeWatchlist([...symbols])
    │             └── Kotlin: writes seed ticks → starts mock loop
    │
    ▼
WatchlistRow × 20 mount
    └── each starts requestAnimationFrame loop
          └── tickRepository.getLatest(symbol) at 60fps
```

---

## Feed Toggle Flow

```
User taps "Live / Paused" button
    │
    ▼
dispatch({ type: 'STOP_FEED' | 'START_FEED' })
    │
    ├── Reducer: { ...state, feedRunning: false/true }  [sync]
    │
    └── Side Effect:
          STOP_FEED  → NativeModules.stopWatchlistFeed()
                           └── Kotlin: watchlistMockJob.cancel()
          START_FEED → NativeModules.subscribeWatchlist(symbols)
                           └── Kotlin: scheduleNextWatchlistTick()
```

---

## Instrument Selection Flow

```
User taps WatchlistRow
    │
    ▼
handlePress(symbol)
    │
    ▼
dispatch({ type: 'SELECT_SYMBOL', symbol })
    │
    ├── Reducer: { ...state, selectedSymbol: symbol }
    │
    └── WatchlistScreen re-renders (selectedSymbol changed)
          ├── WatchlistRow with symbol gets isSelected=true  [border]
          └── InstrumentDetailSheet receives symbol (was null)
                ├── Animated.spring slides sheet up
                └── starts own rAF loop for symbol
                      └── accumulates price history → PriceLineGraph
```
