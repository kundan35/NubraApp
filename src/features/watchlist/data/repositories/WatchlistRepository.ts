// features/watchlist/data/repositories/WatchlistRepository.ts
// Concrete implementation of IWatchlistRepository.
// Persists watchlists in AsyncStorage; returns a hardcoded default on first run.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { IWatchlistRepository } from '../../domain/repositories/IWatchlistRepository';
import type { Watchlist, WatchlistItem } from '../../domain/entities/Watchlist';

export class WatchlistRepository implements IWatchlistRepository {
  private readonly STORAGE_KEY = 'nubra:watchlists:v2';

  async getWatchlists(): Promise<Watchlist[]> {
    try {
      const raw = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (!raw) return [buildDefaultWatchlist()];
      return JSON.parse(raw);
    } catch {
      return [buildDefaultWatchlist()];
    }
  }
}

// ── Default watchlist — 20 NSE large-cap instruments ─────────────────────────

function buildDefaultWatchlist(): Watchlist {
  const now = Date.now();
  const items: WatchlistItem[] = [
    { symbol: 'RELIANCE',   exchange: 'NSE', basePrice: 2_850,  addedAt: now },
    { symbol: 'TCS',        exchange: 'NSE', basePrice: 3_900,  addedAt: now },
    { symbol: 'HDFCBANK',   exchange: 'NSE', basePrice: 1_680,  addedAt: now },
    { symbol: 'INFY',       exchange: 'NSE', basePrice: 1_750,  addedAt: now },
    { symbol: 'ICICIBANK',  exchange: 'NSE', basePrice: 1_250,  addedAt: now },
    { symbol: 'KOTAKBANK',  exchange: 'NSE', basePrice: 1_800,  addedAt: now },
    { symbol: 'LT',         exchange: 'NSE', basePrice: 3_500,  addedAt: now },
    { symbol: 'SBIN',       exchange: 'NSE', basePrice:   800,  addedAt: now },
    { symbol: 'AXISBANK',   exchange: 'NSE', basePrice: 1_150,  addedAt: now },
    { symbol: 'BAJFINANCE', exchange: 'NSE', basePrice: 7_200,  addedAt: now },
    { symbol: 'HINDUNILVR', exchange: 'NSE', basePrice: 2_450,  addedAt: now },
    { symbol: 'BHARTIARTL', exchange: 'NSE', basePrice: 1_700,  addedAt: now },
    { symbol: 'ITC',        exchange: 'NSE', basePrice:   460,  addedAt: now },
    { symbol: 'ASIANPAINT', exchange: 'NSE', basePrice: 2_300,  addedAt: now },
    { symbol: 'MARUTI',     exchange: 'NSE', basePrice: 12_500, addedAt: now },
    { symbol: 'WIPRO',      exchange: 'NSE', basePrice:   530,  addedAt: now },
    { symbol: 'TITAN',      exchange: 'NSE', basePrice: 3_500,  addedAt: now },
    { symbol: 'ULTRACEMCO', exchange: 'NSE', basePrice: 11_500, addedAt: now },
    { symbol: 'SUNPHARMA',  exchange: 'NSE', basePrice: 1_700,  addedAt: now },
    { symbol: 'NESTLEIND',  exchange: 'NSE', basePrice: 2_250,  addedAt: now },
  ];

  return { id: 'default', name: 'My Watchlist', items };
}
