// features/watchlist/presentation/PriceLineGraph.tsx
//
// Zero-dependency line chart built from absolutely-positioned View segments.
// Each segment is a thin View whose center is placed at the midpoint of the
// two data points it connects, then rotated to align with the slope.
//
// Why no SVG/Canvas library?
// - Zero native bridge dependency
// - Pure JS — no install step, no rebuild required
// - Hermes/JSI friendly

import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';

interface Props {
  history:  number[];   // LTP values — oldest first, newest last
  width:    number;
  height:   number;
  color?:   string;
  lineWidth?: number;
}

export const PriceLineGraph = memo(({
  history,
  width,
  height,
  color     = '#1D9E75',
  lineWidth = 2,
}: Props) => {
  if (history.length < 2) {
    return <View style={{ width, height }} />;
  }

  const n   = history.length;
  const min = Math.min(...history);
  const max = Math.max(...history);
  // Avoid div-by-zero when all values are identical
  const range = max - min || 1;

  // Vertical padding so the line never touches the very edge
  const vPad = lineWidth * 2;
  const drawH = height - vPad * 2;

  const toX = (i: number) => (i / (n - 1)) * width;
  const toY = (v: number) => vPad + drawH - ((v - min) / range) * drawH;

  const segments: React.ReactElement[] = [];

  for (let i = 0; i < n - 1; i++) {
    const x1 = toX(i),     y1 = toY(history[i]);
    const x2 = toX(i + 1), y2 = toY(history[i + 1]);

    const dx     = x2 - x1;
    const dy     = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 0.001) continue;

    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    // Position the View's centre at the segment midpoint, then rotate.
    // RN rotates around the View's own centre by default — no transformOrigin needed.
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;

    segments.push(
      <View
        key={i}
        style={{
          position:        'absolute',
          left:            centerX - length / 2,
          top:             centerY - lineWidth / 2,
          width:           length,
          height:          lineWidth,
          backgroundColor: color,
          transform:       [{ rotate: `${angle}deg` }],
        }}
      />,
    );
  }

  return (
    <View style={[styles.container, { width, height }]}>
      {segments}
    </View>
  );
}, (prev, next) =>
  prev.history === next.history &&
  prev.width   === next.width   &&
  prev.height  === next.height  &&
  prev.color   === next.color
);

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
