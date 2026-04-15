// features/watchlist/presentation/TickCountView.tsx
//
// Thin JS wrapper around the Fabric native component NubraTickCountView.
//
// React renders this component ONCE.  All subsequent text updates happen
// entirely on the native side:
//   mock feed thread → TickCountRegistry.incrementSymbol()
//                     → NubraTickCountView.post { setText("ticks: N") }
//
// React never re-renders → the parent WatchlistRow render count stays at 1.
// That is the core demonstration of Fabric native component self-update.

import { requireNativeComponent, StyleProp, ViewStyle } from 'react-native';

interface NubraTickCountViewProps {
  symbol: string;
  style?: StyleProp<ViewStyle>;
}

// requireNativeComponent resolves to the Fabric renderer in New Architecture
export const TickCountView =
  requireNativeComponent<NubraTickCountViewProps>('NubraTickCountView');
