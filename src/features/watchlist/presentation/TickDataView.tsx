// features/watchlist/presentation/TickDataView.tsx
//
// Thin JS wrapper around the Fabric native component NubraTickDataView.
//
// React renders this component ONCE per row.  All subsequent price + change
// updates happen entirely on the native side:
//   mock feed thread → TickCountRegistry.updateTick()
//                     → NubraTickDataView.post { updateTick(ltp, change, changePct) }
//
// React never re-renders for tick data → the parent WatchlistRow render
// count stays at 1.  This is the core demonstration: LTP + change + flash
// animation all driven natively with zero JS/bridge involvement.

import { requireNativeComponent, StyleProp, ViewStyle } from 'react-native';

interface NubraTickDataViewProps {
  symbol: string;
  style?: StyleProp<ViewStyle>;
}

// requireNativeComponent resolves to the Fabric renderer in New Architecture
export const TickDataView =
  requireNativeComponent<NubraTickDataViewProps>('NubraTickDataView');
