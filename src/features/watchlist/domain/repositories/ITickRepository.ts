// features/watchlist/domain/repositories/ITickRepository.ts
// Contract for reading the latest market tick for a given symbol.
// The domain defines WHAT is needed — the data layer decides HOW (JSI, REST, mock…).

import type { RawTick } from '@core/performance/TickStoreAccessor';

export interface ITickRepository {
  getLatest(symbol: string): RawTick | null;
}
