// features/watchlist/presentation/WatchlistScreen.tsx
// Entry-point component for the Watchlist feature.
//
// ── Performance contract ────────────────────────────────────────────────────
// FlatList data array is STABLE — it only changes when the watchlist structure
// changes, never on tick updates.  Each WatchlistRow manages its own tick
// state via an independent rAF → JSI polling loop.

import React, {
  memo, useEffect, useRef, useCallback,
} from 'react';
import {
  FlatList, ListRenderItemInfo, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { di }                    from '@core/di/container';
import type { WatchlistItem }    from '../domain/entities/Watchlist';
import type { WatchlistViewModelStore }
  from '../application/WatchlistViewModel';
import { WatchlistRow }          from './WatchlistRow';
import { InstrumentDetailSheet } from './InstrumentDetailSheet';

interface Props {
  onSymbolSelect?: (symbol: string) => void;
}

export const WatchlistScreen = memo(({ onSymbolSelect }: Props) => {
  const storeRef  = useRef<any>(null);
  if (!storeRef.current) {
    storeRef.current = di.createWatchlistViewModel();
  }
  // tickRepo is only needed by InstrumentDetailSheet (graph rAF loop)
  const tickRepo = useRef(di.tickRepository).current;

  const state    = storeRef.current((s: WatchlistViewModelStore) => s.state);
  const dispatch = storeRef.current((s: WatchlistViewModelStore) => s.dispatch);

  useEffect(() => {
    dispatch({ type: 'LOAD' });
  }, []);

  const handleRowPress = useCallback((symbol: string) => {
    dispatch({ type: 'SELECT_SYMBOL', symbol });
    onSymbolSelect?.(symbol);
  }, [dispatch, onSymbolSelect]);

  const handleDeselect = useCallback(() => {
    dispatch({ type: 'DESELECT' });
  }, [dispatch]);

  const handleFeedToggle = useCallback(() => {
    if (state.type !== 'ready') return;
    dispatch({ type: state.feedRunning ? 'STOP_FEED' : 'START_FEED' });
  }, [dispatch, state]);

  // All hooks must be called before any early return
  const selectedSymbol = state.type === 'ready' ? state.selectedSymbol : null;
  const feedRunning    = state.type === 'ready' ? state.feedRunning    : false;

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<WatchlistItem>) => (
      <WatchlistRow
        symbol={item.symbol}
        isSelected={item.symbol === selectedSymbol}
        onPress={handleRowPress}
      />
    ),
    [selectedSymbol, handleRowPress],
  );

  const keyExtractor = useCallback(
    (item: WatchlistItem) => item.symbol,
    [],
  );

  // ── Loading ───────────────────────────────────────────────────────────────
  if (state.type === 'loading') {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading watchlist…</Text>
      </View>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (state.type === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{state.message}</Text>
      </View>
    );
  }

  // ── Ready ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Watchlist</Text>
        <TouchableOpacity
          style={styles.feedToggle}
          onPress={handleFeedToggle}
          activeOpacity={0.7}
        >
          <View style={[
            styles.feedDot,
            feedRunning ? styles.feedDotLive : styles.feedDotPaused,
          ]} />
          <Text style={styles.feedLabel}>
            {feedRunning ? 'Live' : 'Paused'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Column headers */}
      <View style={styles.colHeader}>
        <Text style={styles.colLeft}>Instrument</Text>
        <Text style={styles.colRight}>LTP / Change</Text>
      </View>

      {/* Instrument list */}
      <FlatList
        data={state.items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={(_data, index) => ({
          length: 68,
          offset: 68 * index,
          index,
        })}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={5}
      />

      {/* Detail bottom sheet — rendered via Modal above everything */}
      <InstrumentDetailSheet
        symbol={selectedSymbol}
        onClose={handleDeselect}
        tickRepository={tickRepo}
      />

    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: '#0D0D0D',
  },
  center: {
    flex:            1,
    justifyContent:  'center',
    alignItems:      'center',
    backgroundColor: '#0D0D0D',
  },
  loadingText: { color: '#888780', fontSize: 14 },
  errorText:   { color: '#E24B4A', fontSize: 14 },

  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1A1A1A',
  },
  title: {
    fontSize:   18,
    fontWeight: '700',
    color:      '#F1EFE8',
  },
  feedToggle: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    paddingHorizontal: 10,
    paddingVertical:   5,
    borderRadius:      12,
    backgroundColor:   '#1A1A1A',
  },
  feedDot: {
    width:        7,
    height:       7,
    borderRadius: 3.5,
  },
  feedDotLive:   { backgroundColor: '#1D9E75' },
  feedDotPaused: { backgroundColor: '#5F5E5A' },
  feedLabel: {
    fontSize: 12,
    color:    '#888780',
  },

  colHeader: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingVertical:   6,
    backgroundColor:   '#111111',
  },
  colLeft:  { fontSize: 11, color: '#5F5E5A' },
  colRight: { fontSize: 11, color: '#5F5E5A' },
});
