// features/watchlist/application/WatchlistViewModel.ts
// ViewModel — MVI orchestrator.
// Receives Intents from UI → runs pure Reducer → triggers Side Effects → emits State.
// Zero React imports. Zero component lifecycle. Fully testable with Jest.

import { create }                from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { NativeModules }         from 'react-native';
import type { GetWatchlistUseCase } from '../domain/useCases/GetWatchlistUseCase';
import type { WatchlistState, WatchlistIntent } from './WatchlistState';

const NativeWS = NativeModules.NubraMarketWebSocket as {
  subscribeWatchlist?: (symbols: string[]) => void;
  stopWatchlistFeed?:  () => void;
} | undefined;

export interface WatchlistViewModelStore {
  state:    WatchlistState;
  dispatch: (intent: WatchlistIntent) => void;
}

// ── Pure Reducer — no side effects ───────────────────────────────────────────
// Given current state + intent → returns next state synchronously.

function reduce(
  state:  WatchlistState,
  intent: WatchlistIntent,
): WatchlistState {
  switch (intent.type) {
    case 'LOAD':
      return { type: 'loading' };

    case 'SELECT_SYMBOL':
      if (state.type !== 'ready') return state;
      return { ...state, selectedSymbol: intent.symbol };

    case 'DESELECT':
      if (state.type !== 'ready') return state;
      return { ...state, selectedSymbol: null };

    case 'START_FEED':
      if (state.type !== 'ready') return state;
      return { ...state, feedRunning: true };

    case 'STOP_FEED':
      if (state.type !== 'ready') return state;
      return { ...state, feedRunning: false };

    default:
      return state;
  }
}

// ── ViewModel Factory ────────────────────────────────────────────────────────
// DI injects the use case — ViewModel never imports concrete classes.

export function createWatchlistViewModel(
  watchlistUseCase: GetWatchlistUseCase,
) {
  const store = create<WatchlistViewModelStore>()(
    subscribeWithSelector((set, get) => ({
      state:    { type: 'loading' },
      dispatch: (intent: WatchlistIntent) => {
        const nextState = reduce(get().state, intent);
        set({ state: nextState });
        handleSideEffect(intent, set, get);
      },
    }))
  );

  // ── Side Effects ─────────────────────────────────────────────────────────
  // All IO happens here. Reducer stays pure.

  function handleSideEffect(
    intent: WatchlistIntent,
    set:    (partial: Partial<WatchlistViewModelStore>) => void,
    get:    () => WatchlistViewModelStore,
  ) {
    switch (intent.type) {

      case 'LOAD': {
        (async () => {
          try {
            const watchlists = await watchlistUseCase.execute();
            const items      = watchlists[0]?.items ?? [];
            const readyState: WatchlistState = {
              type:           'ready',
              items,
              selectedSymbol: null,
              feedRunning:    true,
            };
            set({ state: readyState });
            // Auto-start native mock feed on load
            NativeWS?.subscribeWatchlist?.(items.map(i => i.symbol));
          } catch (err) {
            set({
              state: {
                type:    'error',
                message: err instanceof Error ? err.message : 'Failed to load watchlist',
              },
            });
          }
        })();
        break;
      }

      case 'START_FEED': {
        const s = get().state;
        if (s.type !== 'ready') break;
        NativeWS?.subscribeWatchlist?.(s.items.map(i => i.symbol));
        break;
      }

      case 'STOP_FEED': {
        NativeWS?.stopWatchlistFeed?.();
        break;
      }
    }
  }

  return store;
}

export type WatchlistViewModelStore$ =
  ReturnType<typeof createWatchlistViewModel>;
