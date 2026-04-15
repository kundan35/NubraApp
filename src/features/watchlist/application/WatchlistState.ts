// features/watchlist/application/WatchlistState.ts
// MVI — all valid UI states + all user intents expressed as pure data.
// No side effects here. The ViewModel applies these in the pure reducer.

import type { WatchlistItem } from '../domain/entities/Watchlist';

export type WatchlistState =
  | { type: 'loading' }
  | { type: 'error';  message: string }
  | {
      type:           'ready';
      items:          WatchlistItem[];
      selectedSymbol: string | null;
      feedRunning:    boolean;
    };

export type WatchlistIntent =
  | { type: 'LOAD' }
  | { type: 'SELECT_SYMBOL'; symbol: string }
  | { type: 'DESELECT' }
  | { type: 'START_FEED' }
  | { type: 'STOP_FEED' };
