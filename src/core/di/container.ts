// container.ts — Dependency Injection
// Assembles the full dependency graph.
// No magic framework — just factory functions and lazy singletons.
// Keeps modules decoupled: consumers never import concrete classes directly.

import { WatchlistRepository }
  from '@features/watchlist/data/repositories/WatchlistRepository';
import { TickRepository }
  from '@features/watchlist/data/repositories/TickRepository';
import { GetWatchlistUseCase }
  from '@features/watchlist/domain/useCases/GetWatchlistUseCase';
import { createWatchlistViewModel }
  from '@features/watchlist/application/WatchlistViewModel';
import { backpressureMonitor }
  from '@core/performance/BackpressureMonitor';

class DIContainer {
  private disposed = false;

  // ── Singletons (created once, shared) ──────────────────────────────────

  private _watchlistRepository: WatchlistRepository | null = null;
  get watchlistRepository(): WatchlistRepository {
    if (!this._watchlistRepository) {
      this._watchlistRepository = new WatchlistRepository();
    }
    return this._watchlistRepository;
  }

  private _tickRepository: TickRepository | null = null;
  get tickRepository(): TickRepository {
    if (!this._tickRepository) {
      this._tickRepository = new TickRepository();
    }
    return this._tickRepository;
  }

  // ── Use Cases (stateless — new instance per request is fine) ───────────

  get getWatchlistUseCase(): GetWatchlistUseCase {
    return new GetWatchlistUseCase(this.watchlistRepository);
  }

  // ── ViewModel Factories (one per screen instance) ──────────────────────

  createWatchlistViewModel() {
    // Tick updates are handled per-row via JSI TickStoreAccessor —
    // the ViewModel only needs the watchlist structure use case.
    return createWatchlistViewModel(this.getWatchlistUseCase);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  initialise() {
    this.disposed = false;
    backpressureMonitor.start();
  }

  dispose() {
    this.disposed = true;
    backpressureMonitor.stop();
    this._watchlistRepository = null;
  }
}

// Single app-level instance
export const di = new DIContainer();
