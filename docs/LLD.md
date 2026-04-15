# Low Level Design (LLD)

## 1. Clean Architecture Layer Map

```
┌──────────────────────────────────────────────────────────────────┐
│  src/features/watchlist/                                          │
│                                                                   │
│  domain/                     ← innermost, zero external deps      │
│  ├── entities/                                                    │
│  │   └── Watchlist.ts         WatchlistItem, Watchlist            │
│  ├── repositories/                                                │
│  │   ├── IWatchlistRepository.ts   getWatchlists(): Promise       │
│  │   └── ITickRepository.ts        getLatest(symbol): RawTick     │
│  └── useCases/                                                    │
│      └── GetWatchlistUseCase.ts    execute(): Promise<Watchlist[]>│
│                                                                   │
│  data/                       ← implements domain interfaces       │
│  └── repositories/                                                │
│      ├── WatchlistRepository.ts   AsyncStorage impl               │
│      └── TickRepository.ts        JSI TickStoreAccessor impl      │
│                                                                   │
│  application/                ← MVI orchestration                  │
│  ├── WatchlistState.ts        State union + Intent union          │
│  └── WatchlistViewModel.ts    Zustand store + reducer + effects   │
│                                                                   │
│  presentation/               ← React components only              │
│  ├── WatchlistScreen.tsx      screen root, DI wiring              │
│  ├── WatchlistRow.tsx         per-row JSI poll + flash            │
│  ├── InstrumentDetailSheet.tsx bottom sheet + history             │
│  └── PriceLineGraph.tsx       zero-dep View line chart            │
└──────────────────────────────────────────────────────────────────┘
```

**Dependency rule:** Each layer imports only from layers below it (inward).
Presentation → Application → Domain ← Data

---

## 2. Domain Entities

```typescript
// Watchlist.ts
interface WatchlistItem {
  symbol:    string        // "RELIANCE"
  exchange:  'NSE' | 'BSE'
  basePrice: number        // seed price before first tick
  addedAt:   number        // unix ms
}

interface Watchlist {
  id:    string            // "default"
  name:  string            // "My Watchlist"
  items: WatchlistItem[]   // 20 instruments
}

// ITickRepository.ts
interface ITickRepository {
  getLatest(symbol: string): RawTick | null
}

// RawTick (from @core — shared infra type)
interface RawTick {
  symbol, ltp, open, high, low,
  volume, oi, timestamp, bid, ask,
  change, changePct
}
```

---

## 3. MVI State Machine

```
                    ┌─────────┐
               ┌───►│  idle   │ (initial — before LOAD)
               │    └────┬────┘
               │         │ LOAD intent
               │    ┌────▼────┐
               │    │ loading │◄──────────────────┐
               │    └────┬────┘                   │
               │         │ async completes         │ LOAD intent
               │    ┌────▼────────────────────┐   │ (retry)
               │    │         ready           │───┘
               │    │  items: WatchlistItem[] │
               │    │  selectedSymbol: string?│
               │    │  feedRunning: boolean   │
               │    └────────────────────────┘
               │         ▲         │
               │         │         │ error
               │    ┌────┴────┐    │
               └────│  error  │◄───┘
                    │ message │
                    └─────────┘

Intents:
  LOAD            → loading
  SELECT_SYMBOL   → ready (selectedSymbol = symbol)
  DESELECT        → ready (selectedSymbol = null)
  START_FEED      → ready (feedRunning = true)
  STOP_FEED       → ready (feedRunning = false)
```

---

## 4. MVI Reducer (Pure Function)

```typescript
function reduce(state: WatchlistState, intent: WatchlistIntent): WatchlistState {
  switch (intent.type) {
    case 'LOAD':          return { type: 'loading' }
    case 'SELECT_SYMBOL': return { ...state, selectedSymbol: intent.symbol }
    case 'DESELECT':      return { ...state, selectedSymbol: null }
    case 'START_FEED':    return { ...state, feedRunning: true }
    case 'STOP_FEED':     return { ...state, feedRunning: false }
  }
}
// Properties:
// - Pure: same input → always same output
// - No I/O, no promises, no side effects
// - Fully unit-testable in isolation
```

---

## 5. Native Layer Class Design

```
NubraMarketWebSocketModule (Kotlin : ReactContextBaseJavaModule)
├── Fields
│   ├── client: OkHttpClient
│   ├── mockExecutor: ScheduledExecutorService   (single daemon thread)
│   ├── socket: WebSocket?
│   ├── watchlistMockState: Map<String, MockSpotState>
│   ├── watchlistMockJob: ScheduledFuture<*>?
│   └── isConnected: Boolean
│
├── ReactMethods (callable from JS)
│   ├── connect(authToken)         opens WebSocket, starts reconnect loop
│   ├── disconnect()               closes socket
│   ├── subscribeWatchlist(syms)   starts mock feed → TickStore
│   └── stopWatchlistFeed()        cancels scheduled job
│
└── Private
    ├── scheduleNextWatchlistTick() random 100–300ms re-schedule
    ├── emitWatchlistTicks()        random subset, ±0.03% drift
    ├── openSocket()                OkHttp WebSocket
    ├── scheduleReconnect()         exponential backoff 1s→2s→4s→8s→16s
    ├── parseMessage()              "tick" / "ticks" → writeTick()
    └── writeTick(JSONObject)       → NubraTickStoreJNI.writeTick()

──────────────────────────────────────────────────────────────────

NubraTickStoreJNI (Kotlin — JNI bridge)
└── writeTick(symbol, ltp, open, high, low, volume, oi,
              timestamp, bid, ask, change, changePct)
      └── native fun writeTick(...)   → C++ nubra_writeTick()

──────────────────────────────────────────────────────────────────

TickStore (C++ : jsi::HostObject)
├── static shared(): TickStore&        process singleton
├── writeTick(RawTick)                 mutex lock → store_[sym] = tick
│                                                 → dirty_.push_back(sym)
└── get(Runtime, PropNameID) → Value
    ├── "getLatest" → getLatest(rt, symbol)     mutex lock, copy tick
    └── "drainDirty" → drainDirty(rt)           swap dirty_ vector

──────────────────────────────────────────────────────────────────

NubraJSI (C++)
└── installTickStore(Runtime& rt)
      └── rt.global().setProperty(rt, "nubraTickStore",
              Object::createFromHostObject(rt, shared_ptr<TickStore>))
```

---

## 6. Per-Row Tick Polling Sequence

```
60fps (≈16ms budget per frame)
         │
         ▼
requestAnimationFrame fires on JS thread
         │
         ▼
WatchlistRow::poll()  [for each of 20 rows, independent loops]
         │
         ▼
tickRepository.getLatest(symbol)          ← ITickRepository (domain)
         │
         ▼
TickRepository.getLatest(symbol)          ← data layer impl
         │
         ▼
TickStoreAccessor.getLatest(symbol)       ← core infrastructure
         │
         ▼
global.nubraTickStore.getLatest(symbol)   ← JSI call → C++
         │                                   (~0.5µs per call)
         ▼
C++ TickStore::getLatest()
  mutex.lock()
  copy = store_[symbol]                   ← std::unordered_map lookup
  mutex.unlock()
  return tickToObject(rt, copy)           ← JSI Object, no JSON
         │
         ▼
setTick(prev => {
  if (prev?.ltp === latest.ltp) return prev  ← BAIL OUT: no re-render
  return latest
})
         │
         ▼ (only if ltp changed)
React re-renders this one row             ← O(1), not O(n)
```

---

## 7. WatchlistRow Internal Design

```
WatchlistRow (memo with custom comparator)
│
├── State
│   └── tick: RawTick | null
│
├── Refs (mutable, no re-render on change)
│   ├── rafRef       — animation frame ID for cleanup
│   ├── prevLtpRef   — last known price for flash direction
│   ├── flashAnim    — Animated.Value (0→1→0)
│   ├── flashDirRef  — 'up' | 'down'
│   └── renderCountRef — DEV render counter
│
├── useEffect [symbol, tickRepository]
│   └── starts rAF poll loop
│       cancelled on unmount or symbol change
│
├── useEffect [tick?.ltp]
│   └── triggers flash animation when ltp changes
│
└── memo comparator
    prev.symbol === next.symbol &&
    prev.isSelected === next.isSelected &&
    prev.tickRepository === next.tickRepository
    // NOTE: tick NOT in props — row owns its own tick state
```

---

## 8. PriceLineGraph Algorithm

```
Input: history[] = [2850.45, 2851.20, 2850.90, ...]  (up to 80 points)

For each consecutive pair (i, i+1):

  x1 = (i / (n-1)) * width          // evenly spaced x
  y1 = vPad + drawH - ((p[i] - min) / range) * drawH   // scaled y

  x2 = ((i+1) / (n-1)) * width
  y2 = vPad + drawH - ((p[i+1] - min) / range) * drawH

  dx = x2 - x1
  dy = y2 - y1
  length = √(dx² + dy²)
  angle  = atan2(dy, dx) × (180/π)

  // Place View centre at segment midpoint, rotate to slope angle
  // RN rotates around View centre by default — no transformOrigin needed
  centerX = (x1 + x2) / 2
  centerY = (y1 + y2) / 2

  <View style={{
    position:  'absolute',
    left:      centerX - length/2,   // centre aligns to midpoint
    top:       centerY - lineWidth/2,
    width:     length,
    height:    lineWidth,
    transform: [{ rotate: `${angle}deg` }]
  }}/>
```

---

## 9. InstrumentDetailSheet State

```
InstrumentDetailSheet
│
├── State
│   ├── tick: RawTick | null         ← latest tick for selected symbol
│   ├── history: number[]            ← LTP values (max 80 points)
│   └── visible: boolean             ← controls Modal render
│
├── Refs
│   ├── slideY: Animated.Value       ← translateY for slide animation
│   ├── rafRef                       ← rAF ID for cleanup
│   └── lastLtpRef                   ← deduplicate history entries
│
├── useEffect [symbol]
│   ├── symbol != null → setVisible(true) → Animated.spring(slideY, 0)
│   │                  → start rAF poll loop
│   └── symbol == null → Animated.timing(slideY, SHEET_HEIGHT)
│                      → on complete: setVisible(false)
│                      → cancel rAF loop
│
└── rAF poll
    ├── tickRepository.getLatest(symbol)
    ├── setTick if ltp changed
    └── setHistory if ltp changed (append, cap at 80)
          └── PriceLineGraph re-renders with new segment
```

---

## 10. Dependency Injection Wiring

```
DIContainer (singleton — di.ts)
│
├── tickRepository: TickRepository         (singleton)
│   └── implements ITickRepository
│       └── uses TickStoreAccessor
│
├── watchlistRepository: WatchlistRepository  (singleton)
│   └── implements IWatchlistRepository
│       └── uses AsyncStorage
│
├── getWatchlistUseCase: GetWatchlistUseCase  (new per call — stateless)
│   └── depends on IWatchlistRepository
│
└── createWatchlistViewModel()              (new per screen instance)
    └── depends on GetWatchlistUseCase
        └── uses NativeModules.NubraMarketWebSocket

WatchlistScreen
├── di.createWatchlistViewModel()   → Zustand store
└── di.tickRepository               → passed as prop to rows
      ├── WatchlistRow (×20)        receives tickRepository
      └── InstrumentDetailSheet     receives tickRepository
```
