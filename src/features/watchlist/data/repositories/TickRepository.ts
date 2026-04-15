// features/watchlist/data/repositories/TickRepository.ts
// Concrete implementation of ITickRepository.
// Reads ticks from the C++ JSI TickStore via TickStoreAccessor.
// This is the ONLY file in the feature that knows about JSI infrastructure.

import { TickStoreAccessor } from '@core/performance/TickStoreAccessor';
import type { RawTick }      from '@core/performance/TickStoreAccessor';
import type { ITickRepository } from '../../domain/repositories/ITickRepository';

export class TickRepository implements ITickRepository {
  getLatest(symbol: string): RawTick | null {
    return TickStoreAccessor.getLatest(symbol);
  }
}
