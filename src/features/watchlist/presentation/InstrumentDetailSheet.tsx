// features/watchlist/presentation/InstrumentDetailSheet.tsx
//
// Slide-up bottom sheet showing detail for the selected instrument.
// Builds price history in real-time from the JSI TickStore via its own
// rAF polling loop — independent of every WatchlistRow.
//
// Animation: RN core Animated translateY — useNativeDriver:true for 60fps.

import React, {
  memo, useEffect, useRef, useState, useCallback,
} from 'react';
import {
  Animated, Modal, Pressable, Text, TouchableOpacity,
  View, StyleSheet, useWindowDimensions,
} from 'react-native';
import type { ITickRepository } from '../domain/repositories/ITickRepository';
import type { RawTick }         from '@core/performance/TickStoreAccessor';
import { PriceLineGraph }     from './PriceLineGraph';

const SHEET_HEIGHT   = 360;
const MAX_HISTORY    = 80;   // data points kept for the graph

interface Props {
  symbol:         string | null;   // null → sheet is hidden
  onClose:        () => void;
  tickRepository: ITickRepository;
}

export const InstrumentDetailSheet = memo(({ symbol, onClose, tickRepository }: Props) => {
  const { width } = useWindowDimensions();

  // ── Animation state ──────────────────────────────────────────────────────
  const slideY   = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (symbol) {
      setVisible(true);
      Animated.spring(slideY, {
        toValue:         0,
        useNativeDriver: true,
        bounciness:      4,
      }).start();
    } else {
      Animated.timing(slideY, {
        toValue:         SHEET_HEIGHT,
        duration:        250,
        useNativeDriver: true,
      }).start(() => setVisible(false));
    }
  }, [symbol]);

  // ── Tick + history polling ───────────────────────────────────────────────
  const [tick,    setTick]    = useState<RawTick | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const rafRef         = useRef<number>(0);
  const lastLtpRef     = useRef<number | null>(null);

  useEffect(() => {
    if (!symbol) {
      cancelAnimationFrame(rafRef.current);
      setTick(null);
      setHistory([]);
      lastLtpRef.current = null;
      return;
    }

    let running = true;

    const poll = () => {
      if (!running) return;

      const latest = tickRepository.getLatest(symbol);

      if (latest && latest.ltp !== 0) {
        // Only update tick when ltp changed — avoid spurious renders
        setTick(prev =>
          prev?.ltp === latest.ltp ? prev : latest
        );

        // Append to history only when price moves
        if (latest.ltp !== lastLtpRef.current) {
          lastLtpRef.current = latest.ltp;
          setHistory(prev => {
            const next = [...prev, latest.ltp];
            return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
          });
        }
      }

      rafRef.current = requestAnimationFrame(poll);
    };

    rafRef.current = requestAnimationFrame(poll);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [symbol]);

  const handleClose = useCallback(() => onClose(), [onClose]);

  if (!visible) return null;

  const ltp       = tick?.ltp       ?? 0;
  const high      = tick?.high      ?? 0;
  const low       = tick?.low       ?? 0;
  const changePct = tick?.changePct ?? 0;
  const isUp      = changePct >= 0;
  const graphColor = isUp ? '#1D9E75' : '#E24B4A';

  const graphWidth = width - 32;  // 16px padding each side

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable style={sheetStyles.backdrop} onPress={handleClose} />

      {/* Sheet */}
      <Animated.View
        style={[
          sheetStyles.sheet,
          { width, transform: [{ translateY: slideY }] },
        ]}
      >
        {/* Handle */}
        <View style={sheetStyles.handle} />

        {/* Header row */}
        <View style={sheetStyles.header}>
          <View>
            <Text style={sheetStyles.symbolText}>{symbol}</Text>
            <Text style={sheetStyles.exchange}>NSE · Equity</Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={sheetStyles.closeBtn}>
            <Text style={sheetStyles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Price */}
        <View style={sheetStyles.priceRow}>
          <Text style={sheetStyles.price}>
            {ltp > 0 ? formatPrice(ltp) : '—'}
          </Text>
          {ltp > 0 && (
            <Text style={[sheetStyles.changePct, isUp ? sheetStyles.up : sheetStyles.down]}>
              {isUp ? '+' : ''}{changePct.toFixed(2)}%
            </Text>
          )}
        </View>

        {/* Day stats */}
        <View style={sheetStyles.statsRow}>
          <StatCell label="Day High" value={high > 0 ? formatPrice(high) : '—'} />
          <View style={sheetStyles.statDivider} />
          <StatCell label="Day Low"  value={low  > 0 ? formatPrice(low)  : '—'} />
        </View>

        {/* Graph */}
        <View style={sheetStyles.graphContainer}>
          {history.length < 2 ? (
            <View style={[sheetStyles.graphPlaceholder, { width: graphWidth }]}>
              <Text style={sheetStyles.graphPlaceholderText}>
                Collecting data…
              </Text>
            </View>
          ) : (
            <PriceLineGraph
              history={history}
              width={graphWidth}
              height={120}
              color={graphColor}
              lineWidth={2}
            />
          )}
        </View>
      </Animated.View>
    </Modal>
  );
});

// ── StatCell ─────────────────────────────────────────────────────────────────

const StatCell = memo(({ label, value }: { label: string; value: string }) => (
  <View style={sheetStyles.statCell}>
    <Text style={sheetStyles.statLabel}>{label}</Text>
    <Text style={sheetStyles.statValue}>{value}</Text>
  </View>
));

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(n: number): string {
  return '₹' + n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position:        'absolute',
    bottom:          0,
    height:          SHEET_HEIGHT,
    backgroundColor: '#161616',
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    paddingBottom:    24,
    elevation:        24,
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: -4 },
    shadowOpacity:    0.5,
    shadowRadius:     12,
  },
  handle: {
    alignSelf:       'center',
    marginTop:       10,
    width:           40,
    height:          4,
    borderRadius:    2,
    backgroundColor: '#333330',
  },
  header: {
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'flex-start',
    paddingHorizontal: 20,
    marginTop:        16,
  },
  symbolText: {
    fontSize:   20,
    fontWeight: '700',
    color:      '#F1EFE8',
    letterSpacing: 0.5,
  },
  exchange: {
    fontSize:  12,
    color:     '#5F5E5A',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 18,
    color:    '#5F5E5A',
  },
  priceRow: {
    flexDirection:  'row',
    alignItems:     'baseline',
    paddingHorizontal: 20,
    marginTop:      12,
    gap:            10,
  },
  price: {
    fontSize:    28,
    fontWeight:  '700',
    color:       '#F1EFE8',
    fontVariant: ['tabular-nums'],
  },
  changePct: {
    fontSize:    16,
    fontWeight:  '500',
    fontVariant: ['tabular-nums'],
  },
  up:   { color: '#1D9E75' },
  down: { color: '#E24B4A' },

  statsRow: {
    flexDirection:    'row',
    paddingHorizontal: 20,
    marginTop:         14,
  },
  statCell: {
    flex: 1,
  },
  statDivider: {
    width:           1,
    backgroundColor: '#222220',
    marginHorizontal: 16,
  },
  statLabel: {
    fontSize: 11,
    color:    '#5F5E5A',
  },
  statValue: {
    fontSize:    15,
    fontWeight:  '600',
    color:       '#F1EFE8',
    marginTop:   4,
    fontVariant: ['tabular-nums'],
  },

  graphContainer: {
    paddingHorizontal: 16,
    marginTop:         18,
  },
  graphPlaceholder: {
    height:         120,
    justifyContent: 'center',
    alignItems:     'center',
  },
  graphPlaceholderText: {
    color:    '#444441',
    fontSize: 12,
  },
});
