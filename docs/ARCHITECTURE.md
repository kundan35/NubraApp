# Architecture Overview

## Pattern: Clean Architecture + MVI

```
┌────────────────────────────────────────────────────────────┐
│                  PRESENTATION LAYER                         │
│  WatchlistScreen · WatchlistRow · InstrumentDetailSheet    │
│  PriceLineGraph                                            │
│  ── React components only. No business logic. ──           │
└─────────────────────────┬──────────────────────────────────┘
                          │ dispatches Intents
                          ▼ observes State
┌────────────────────────────────────────────────────────────┐
│                  APPLICATION LAYER                          │
│  WatchlistViewModel (Zustand + MVI)                        │
│  WatchlistState · WatchlistIntent                          │
│  ── Orchestrates use cases. Pure reducer. ──               │
└─────────────────────────┬──────────────────────────────────┘
                          │ calls use cases
                          ▼
┌────────────────────────────────────────────────────────────┐
│                    DOMAIN LAYER                             │
│  GetWatchlistUseCase                                       │
│  IWatchlistRepository · ITickRepository                    │
│  WatchlistItem · Watchlist                                 │
│  ── Pure business rules. Zero framework imports. ──        │
└─────────────────────────▲──────────────────────────────────┘
                          │ implements interfaces
┌────────────────────────────────────────────────────────────┐
│                     DATA LAYER                              │
│  WatchlistRepository (AsyncStorage)                        │
│  TickRepository (JSI TickStoreAccessor)                    │
│  ── Concrete I/O implementations. ──                       │
└─────────────────────────┬──────────────────────────────────┘
                          │ JSI / JNI
                          ▼
┌────────────────────────────────────────────────────────────┐
│              NATIVE / INFRASTRUCTURE LAYER                  │
│  C++: TickStore (HostObject) · NubraJSI                    │
│  Kotlin: NubraMarketWebSocketModule · NubraTickStoreJNI    │
│  ── Platform-specific. Hidden behind repository interfaces.──│
└────────────────────────────────────────────────────────────┘
```

---

## MVI Unidirectional Data Flow

```
          ┌─────────────────────────────────────────┐
          │           WatchlistViewModel             │
          │                                          │
User ────►│  Intent ──► Reducer ──► State ──────────┼────► UI
Tap       │                 │                        │
          │                 └──► Side Effects        │
          │                        ├── AsyncStorage  │
          │                        └── NativeModules │
          └─────────────────────────────────────────┘

  Intent   = what the user did      (LOAD, SELECT_SYMBOL, STOP_FEED…)
  Reducer  = pure function          (state, intent) → newState
  State    = what the UI shows      (loading | error | ready)
  Effects  = I/O consequences       (network, native, storage)
```

---

## Tick Data Flow (Detailed)

```
  WRITE PATH                              READ PATH
  ──────────                              ─────────

  [100–300ms random interval]             [60fps per row]

  Kotlin MockFeed                         WatchlistRow
      │                                       │
      │ emitWatchlistTicks()                  │ requestAnimationFrame
      │  - random 3-7 symbols                 │
      │  - ±0.03% price drift                 │ tickRepository
      │                                       │   .getLatest(symbol)
      ▼                                       │
  NubraTickStoreJNI                          ▼
  .writeTick(symbol, ltp, ...)          TickRepository
      │                                 .getLatest(symbol)
      │ JNI call                              │
      ▼                                       │ calls
  C++ nubra_writeTick()                       ▼
      │                                 TickStoreAccessor
      │ mutex.lock()                    .getLatest(symbol)
      ▼                                       │
  TickStore::writeTick()                      │ JSI property access
      store_[symbol] = tick    ◄─────────────►│
      dirty_.push_back(symbol)          global.nubraTickStore
      mutex.unlock()                    .getLatest(symbol)
                                               │
                                         C++ TickStore::getLatest()
                                         mutex.lock()
                                         copy tick
                                         mutex.unlock()
                                         return JSI Object
                                               │
                                         setTick(latest)
                                         if ltp changed → re-render row
                                         else           → skip (no render)
```

---

## File Structure

```
NubraApp/
│
├── android/app/src/main/
│   ├── cpp/
│   │   ├── TickStore.h          C++ tick store interface
│   │   ├── TickStore.cpp        thread-safe map + JSI HostObject
│   │   └── NubraJSI.cpp         installs HostObject into Hermes
│   ├── jni/
│   │   └── CMakeLists.txt       builds libappmodules.so + nubra_native
│   └── java/com/zanskar/nubra/
│       ├── NubraMarketWebSocketModule.kt   WS + mock feed
│       ├── NubraMarketWebSocketPackage.kt  RN package registration
│       ├── NubraTickStoreJNI.kt            JNI bridge
│       └── MainApplication.kt             app entry
│
├── src/
│   ├── core/
│   │   ├── di/container.ts              dependency injection wiring
│   │   └── performance/
│   │       ├── TickStoreAccessor.ts     JSI wrapper
│   │       └── BackpressureMonitor.ts   JS thread health monitor
│   │
│   └── features/
│       ├── navigation/
│       │   └── AppNavigator.tsx         tab navigator
│       │
│       └── watchlist/
│           ├── domain/
│           │   ├── entities/Watchlist.ts
│           │   ├── repositories/IWatchlistRepository.ts
│           │   ├── repositories/ITickRepository.ts
│           │   └── useCases/GetWatchlistUseCase.ts
│           │
│           ├── data/
│           │   └── repositories/
│           │       ├── WatchlistRepository.ts   AsyncStorage
│           │       └── TickRepository.ts        JSI impl
│           │
│           ├── application/
│           │   ├── WatchlistState.ts    State + Intent types
│           │   └── WatchlistViewModel.ts MVI store
│           │
│           └── presentation/
│               ├── WatchlistScreen.tsx        screen root
│               ├── WatchlistRow.tsx           per-row rAF + flash
│               ├── InstrumentDetailSheet.tsx  bottom sheet + graph
│               └── PriceLineGraph.tsx         View-based line chart
│
└── docs/
    ├── ARCHITECTURE.md   ← this file
    ├── SYSTEM_DESIGN.md  ← problem, decisions, threading model
    ├── HLD.md            ← component diagram, communication channels
    └── LLD.md            ← class design, sequences, algorithms
```

---

## Performance Guarantees

| Metric | Target | How Achieved |
|---|---|---|
| Tick update latency | < 1ms JS read | JSI synchronous call, no bridge |
| Rows re-rendered per tick | 1 (changed row only) | Per-row rAF, `setTick` bails if ltp unchanged |
| FlatList re-renders on tick | 0 | Stable `data` array, no tick in ViewModel state |
| Tick read cost | < 1µs per call | C++ unordered_map lookup |
| Mock feed rate | 100–300ms random | ScheduledExecutorService, random delay re-schedule |
| Symbols updated per cycle | 3–7 random | `symbols.shuffled().take(count)` |
| Price history for graph | 80 points max | Sliding window `slice(-80)` |

---

## Key Architecture Decisions & Trade-offs

### Decision 1: Per-row polling vs centralised drainDirty
- **Chosen:** Per-row `getLatest(symbol)` in independent rAF loop
- **Trade-off:** 20 JSI calls/frame vs single `drainDirty()` call
- **Reason:** Row unmount cleans up its own loop automatically; only the changed row re-renders; simpler mental model

### Decision 2: Repository abstraction over JSI
- **Chosen:** `ITickRepository` interface in domain, `TickRepository` in data
- **Trade-off:** Extra indirection layer
- **Reason:** Presentation is unit-testable with a mock repository; JSI is isolated to one file

### Decision 3: MVI over MVVM / Redux
- **Chosen:** MVI with Zustand
- **Trade-off:** Slightly more boilerplate than plain useState
- **Reason:** Reducer is a pure function — deterministic, easy to test; intent types document all possible user actions; `subscribeWithSelector` prevents unrelated re-renders

### Decision 4: Mock feed in Kotlin, not JS
- **Chosen:** `ScheduledExecutorService` in `NubraMarketWebSocketModule.kt`
- **Trade-off:** Cannot mock in JS tests
- **Reason:** Matches the real WebSocket path exactly — same `NubraTickStoreJNI.writeTick()` call; JS never distinguishes mock from real data
