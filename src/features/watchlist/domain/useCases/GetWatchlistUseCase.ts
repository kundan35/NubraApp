// features/watchlist/domain/useCases/GetWatchlistUseCase.ts
// Stateless use case — depends only on the repository interface, not the impl.

import type { IWatchlistRepository } from '../repositories/IWatchlistRepository';
import type { Watchlist }            from '../entities/Watchlist';

export class GetWatchlistUseCase {
  constructor(private readonly repository: IWatchlistRepository) {}

  execute(): Promise<Watchlist[]> {
    return this.repository.getWatchlists();
  }
}
