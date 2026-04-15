// features/watchlist/presentation/WatchlistRow.tsx
//
// ── Architecture ────────────────────────────────────────────────────────────
// Tick data is accessed via ITickRepository (domain interface) injected as a
// prop — never directly from JSI/TickStoreAccessor (infrastructure).
//
// ── Performance contract ────────────────────────────────────────────────────
// Each row owns its own rAF polling loop.  Parent FlatList receives a STABLE
// data array — it never re-renders on tick updates.  Only the row whose ltp
// actually changed calls setState.

import React, {
  memo, useEffect, useRef, useState, useCallback,
} from 'react';
import {
  Animated, Text, TouchableOpacity, View, StyleSheet,
} from 'react-native';
import type { ITickRepository } from '../domain/repositories/ITickRepository';
import type { RawTick }         from '@core/performance/TickStoreAccessor';
import { TickCountView }        from './TickCountView';

export interface WatchlistRowProps {
  symbol:         string;
  basePrice:      number;
  isSelected:     boolean;
  onPress:        (symbol: string) => void;
  tickRepository: ITickRepository;
}

export const WatchlistRow = memo(({
  symbol,
  basePrice,
  isSelected,
  onPress,
  tickRepository,
}: WatchlistRowProps) => {

  const [tick, setTick]   = useState<RawTick | null>(null);
  const rafRef            = useRef<number>(0);
  const prevLtpRef        = useRef<number | null>(null);
  const flashAnim         = useRef(new Animated.Value(0)).current;
  const flashDirRef       = useRef<'up' | 'down'>('up');
  const renderCountRef    = useRef(0);
  renderCountRef.current++;

  // ── Repository-backed poll loop ─────────────────────────────────────────
  useEffect(() => {
    let running = true;

    const poll = () => {
      if (!running) return;

      const latest = tickRepository.getLatest(symbol);

      if (latest && latest.ltp !== 0) {
        setTick(prev => {
          if (
            prev &&
            prev.ltp       === latest.ltp &&
            prev.changePct === latest.changePct
          ) return prev;   // no change — skip re-render
          return latest;
        });
      }

      rafRef.current = requestAnimationFrame(poll);
    };

    rafRef.current = requestAnimationFrame(poll);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [symbol, tickRepository]);

  // ── Flash on price change ───────────────────────────────────────────────
  useEffect(() => {
    if (!tick) return;
    if (prevLtpRef.current !== null && prevLtpRef.current !== tick.ltp) {
      flashDirRef.current = tick.ltp > prevLtpRef.current ? 'up' : 'down';
      flashAnim.stopAnimation();
      flashAnim.setValue(1);
      Animated.timing(flashAnim, {
        toValue:         0,
        duration:        600,
        useNativeDriver: false,
      }).start();
    }
    prevLtpRef.current = tick.ltp;
  }, [tick?.ltp]);

  const handlePress = useCallback(() => onPress(symbol), [onPress, symbol]);

  const ltp       = tick?.ltp       ?? basePrice;
  const changePct = tick?.changePct ?? 0;
  const change    = tick?.change    ?? 0;
  const isUp      = changePct >= 0;

  const flashBg = flashAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [
      'rgba(0,0,0,0)',
      flashDirRef.current === 'up'
        ? 'rgba(29,158,117,0.20)'
        : 'rgba(226,75,74,0.20)',
    ],
  });

  return (
    <Animated.View style={[
      rowStyles.container,
      isSelected && rowStyles.selected,
      { backgroundColor: flashBg as any },
    ]}>
      <TouchableOpacity
        style={rowStyles.inner}
        onPress={handlePress}
        activeOpacity={0.75}
      >
        <View style={rowStyles.left}>
          <Text style={rowStyles.symbol}>{symbol}</Text>
          <Text style={rowStyles.exchange}>NSE</Text>
        </View>

        <View style={rowStyles.right}>
          <Text style={rowStyles.price}>{formatPrice(ltp)}</Text>
          <Text style={[rowStyles.change, isUp ? rowStyles.up : rowStyles.down]}>
            {isUp ? '+' : ''}{change.toFixed(2)}
            {'  '}
            {isUp ? '+' : ''}{changePct.toFixed(2)}%
          </Text>
        </View>

        {__DEV__ && (
          <View style={rowStyles.devBadges}>
            {/* React render count — stays at 1 after first tick (proves no re-render) */}
            <View style={rowStyles.devBadge}>
              <Text style={rowStyles.devText}>r:{renderCountRef.current}</Text>
            </View>
            {/* Native Fabric tick count — increments without React re-rendering */}
            <TickCountView symbol={symbol} style={rowStyles.tickCountView} />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}, (prev, next) =>
  prev.symbol         === next.symbol         &&
  prev.basePrice      === next.basePrice      &&
  prev.isSelected     === next.isSelected     &&
  prev.onPress        === next.onPress        &&
  prev.tickRepository === next.tickRepository
);

function formatPrice(n: number): string {
  return '₹' + n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const rowStyles = StyleSheet.create({
  container: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#1A1A1A',
  },
  selected: {
    borderLeftWidth:  2,
    borderLeftColor:  '#1D9E75',
  },
  inner: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    height:            68,
  },
  left:  { flex: 1 },
  right: { alignItems: 'flex-end' },
  symbol: {
    fontSize:      15,
    fontWeight:    '600',
    color:         '#F1EFE8',
    letterSpacing: 0.3,
  },
  exchange: { fontSize: 11, color: '#5F5E5A', marginTop: 2 },
  price: {
    fontSize:    16,
    fontWeight:  '600',
    color:       '#F1EFE8',
    fontVariant: ['tabular-nums'],
  },
  change: {
    fontSize:    12,
    marginTop:   3,
    fontVariant: ['tabular-nums'],
  },
  up:   { color: '#1D9E75' },
  down: { color: '#E24B4A' },
  devBadges: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    marginLeft:    8,
  },
  devBadge: {
    backgroundColor:   '#1A1A2E',
    borderRadius:      3,
    paddingHorizontal: 4,
    paddingVertical:   2,
  },
  devText: { fontSize: 9, color: '#6060AA', fontVariant: ['tabular-nums'] },
  tickCountView: {
    minWidth:          52,
    height:            16,
    backgroundColor:   '#1A2E1A',
    borderRadius:      3,
    paddingHorizontal: 4,
  },
});
