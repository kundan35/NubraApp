# NubraApp — System Design

## Problem Statement

Build a **real-time stock watchlist** app on React Native + Android Native that:
- Displays 20 NSE instruments with live LTP, absolute change, % change
- Updates at 100–300 ms intervals from a native mock feed
- Guarantees **only changed rows re-render** — no full list re-renders on tick updates
- Shows an instrument detail bottom sheet with a live price line graph

---

## Core Design Challenge

> Traditional React Native bridge (JSON serialization over async queue) cannot sustain
> 60fps per-row updates for 20 instruments simultaneously.

### Why the Standard Bridge Fails Here

```
Traditional Path (SLOW):
  Kotlin → JSON serialize → async bridge queue → JS deserialize → setState → re-render ALL rows

Problem: Each tick update triggers setState on the parent → FlatList re-renders all 20 rows
         At 100ms intervals = 10 full list re-renders per second = jank
```

### Solution: JSI HostObject (Zero-Bridge Path)

```
JSI Path (FAST):
  Kotlin → JNI → C++ TickStore (mutex-protected map)
                       ↑ write (OkHttp thread)
                       ↓ read (JS thread, synchronous)
  JS rAF loop → JSI HostObject → C++ getLatest(symbol) → RawTick
```

No serialization. No async queue. No bridge. Synchronous C++ map lookup from JS thread.

---

## Technology Stack

| Layer | Technology | Reason |
|---|---|---|
| UI Framework | React Native 0.85 | New Architecture (Fabric + JSI) |
| JS Runtime | Hermes | Optimised for RN, JSI support |
| State Management | Zustand + subscribeWithSelector | Granular subscriptions, no re-renders on unrelated state |
| Architecture Pattern | Clean Architecture + MVI | Testable, unidirectional data flow |
| Native → JS | JSI HostObject (C++) | Zero-bridge synchronous reads at 60fps |
| JS → Native | NativeModules (bridge) | One-time setup calls only, not on hot path |
| Mock Feed | Kotlin ScheduledExecutorService | Background thread, 100–300ms random intervals |
| Animation | RN core Animated API | No reanimated dependency |
| Persistence | AsyncStorage | Watchlist structure only |
| Line Graph | Pure RN View segments | Zero external dependencies |

---

## Threading Model

```
┌─────────────────────────────────────────────────────────────┐
│  OkHttp Thread (Kotlin)                                      │
│  subscribeWatchlist() → emitWatchlistTicks()                 │
│       └── NubraTickStoreJNI.writeTick()  [JNI call]         │
│             └── C++ TickStore::writeTick()  [mutex lock]     │
│                   ├── store_[symbol] = tick                  │
│                   └── dirty_.push_back(symbol)               │
└─────────────────────────────────────────────────────────────┘
                          ↕ std::mutex (lock-free on read side)
┌─────────────────────────────────────────────────────────────┐
│  JS Thread (Hermes)                                          │
│  requestAnimationFrame (60fps per row)                       │
│       └── ITickRepository.getLatest(symbol)                  │
│             └── TickStoreAccessor.getLatest(symbol)          │
│                   └── global.nubraTickStore.getLatest()      │
│                         └── C++ TickStore::getLatest()       │
│                               └── returns JSI Object         │
└─────────────────────────────────────────────────────────────┘
```

**Key property:** The two threads never contend on the hot read path.
Write locks briefly to update the map. Read locks briefly to copy one tick.
At 20 rows × 60fps = 1200 reads/sec, each < 1µs.

---

## Data Flow Overview

```
┌──────────────┐     100–300ms      ┌─────────────────────────┐
│   Kotlin     │ ─────────────────► │   C++ TickStore          │
│  Mock Feed   │   JNI writeTick()  │   (process singleton)    │
└──────────────┘                    └──────────┬──────────────┘
                                               │ JSI getLatest()
                                               │ synchronous, 60fps
                                    ┌──────────▼──────────────┐
                                    │   TickRepository (data)  │
                                    │   ITickRepository (domain│
                                    └──────────┬──────────────┘
                                               │ prop injection
                              ┌────────────────▼──────────────────┐
                              │         WatchlistRow (×20)         │
                              │   own rAF loop → setTick only      │
                              │   when ltp changes                  │
                              └───────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Per-Row Independent Polling (not centralised drainDirty)
Each `WatchlistRow` runs its own `requestAnimationFrame` loop and calls
`tickRepository.getLatest(symbol)` for its own symbol only.

- **Pro:** Only the row whose price changed re-renders
- **Pro:** Row unmount automatically cancels its own loop
- **Con:** 20 JSI calls per frame (acceptable — each < 1µs)

### 2. Stable FlatList Data Array
The `data` prop of FlatList only changes when watchlist *structure* changes
(add/remove instruments), never on price updates. Combined with `React.memo`
and a custom comparator on `WatchlistRow`, the list itself never re-renders.

### 3. Repository Abstraction Over JSI
`TickStoreAccessor` (infrastructure) is called only from `TickRepository` (data layer).
Presentation components depend on `ITickRepository` (domain interface).
This makes rows unit-testable with a mock repository.

### 4. MVI for ViewModel
Intent → Pure Reducer → State → Side Effects.
The reducer is a pure function — deterministic, zero side effects, trivially testable.
Side effects (native calls, async load) are isolated in `handleSideEffect`.
