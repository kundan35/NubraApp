// features/watchlist/presentation/WatchlistRow.tsx
//
// ── Architecture ────────────────────────────────────────────────────────────
// Price + change display is handled entirely by NubraTickDataView (Fabric
// native component).  React never touches tick data after the first render.
//
// ── Performance contract ────────────────────────────────────────────────────
// • No useState, no useEffect, no rAF loop in this component.
// • FlatList receives a STABLE data array — never re-renders on tick updates.
// • React render count stays at 1 permanently.
// • All LTP/change updates + flash animations run natively via:
//     mock feed → TickCountRegistry.updateTick() → NubraTickDataView.post()

import React, { memo, useRef, useCallback } from 'react';
import {
  Text, TouchableOpacity, View, StyleSheet,
} from 'react-native';
import { TickCountView } from './TickCountView';
import { TickDataView }  from './TickDataView';

export interface WatchlistRowProps {
  symbol:     string;
  isSelected: boolean;
  onPress:    (symbol: string) => void;
}

export const WatchlistRow = memo(({
  symbol,
  isSelected,
  onPress,
}: WatchlistRowProps) => {

  const renderCountRef = useRef(0);
  renderCountRef.current++;

  const handlePress = useCallback(() => onPress(symbol), [onPress, symbol]);

  return (
    <View style={[rowStyles.container, isSelected && rowStyles.selected]}>
      <TouchableOpacity
        style={rowStyles.inner}
        onPress={handlePress}
        activeOpacity={0.75}
      >
        <View style={rowStyles.left}>
          <Text style={rowStyles.symbol}>{symbol}</Text>
          <Text style={rowStyles.exchange}>NSE</Text>
        </View>

        {/*
          NubraTickDataView — Fabric native component.
          Renders itself; all tick updates bypass React completely.
          The flash animation runs via ValueAnimator on the native side.
        */}
        <TickDataView symbol={symbol} style={rowStyles.tickDataView} />

        {__DEV__ && (
          <View style={rowStyles.devBadges}>
            {/* React render count — stays at 1 after mount (proves no re-render) */}
            <View style={rowStyles.devBadge}>
              <Text style={rowStyles.devText}>r:{renderCountRef.current}</Text>
            </View>
            {/* Native Fabric tick count — increments without React re-rendering */}
            <TickCountView symbol={symbol} style={rowStyles.tickCountView} />
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}, (prev, next) =>
  prev.symbol     === next.symbol     &&
  prev.isSelected === next.isSelected &&
  prev.onPress    === next.onPress
);

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
  tickDataView: {
    alignItems: 'flex-end',
    minWidth:   110,
  },
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
  symbol: {
    fontSize:      15,
    fontWeight:    '600',
    color:         '#F1EFE8',
    letterSpacing: 0.3,
  },
  exchange: { fontSize: 11, color: '#5F5E5A', marginTop: 2 },
  tickCountView: {
    minWidth:          52,
    height:            16,
    backgroundColor:   '#1A2E1A',
    borderRadius:      3,
    paddingHorizontal: 4,
  },
});
