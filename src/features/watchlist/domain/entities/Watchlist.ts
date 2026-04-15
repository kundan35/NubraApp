// features/watchlist/domain/entities/Watchlist.ts
// Pure domain entities. Zero React Native imports. Zero framework imports.

export interface WatchlistItem {
  readonly symbol:    string;
  readonly exchange:  'NSE' | 'BSE';
  readonly basePrice: number;   // Reference price shown before first tick arrives
  readonly addedAt:   number;   // Unix ms
}

export interface Watchlist {
  readonly id:    string;
  readonly name:  string;
  readonly items: WatchlistItem[];
}
