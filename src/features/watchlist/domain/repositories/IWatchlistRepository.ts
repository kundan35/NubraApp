// features/watchlist/domain/repositories/IWatchlistRepository.ts
// Contract the data layer must satisfy. Domain never imports concrete classes.

import type { Watchlist } from '../entities/Watchlist';

export interface IWatchlistRepository {
  getWatchlists(): Promise<Watchlist[]>;
}
