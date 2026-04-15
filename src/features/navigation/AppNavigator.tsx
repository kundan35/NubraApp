// features/navigation/AppNavigator.tsx
// Bottom tab navigator — Watchlist and Orders tabs.

import React, { useState, memo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WatchlistScreen }
  from '@features/watchlist/presentation/WatchlistScreen';

type Tab = 'watchlist' | 'orders';

export const AppNavigator = memo(() => {
  const [activeTab, setActiveTab] = useState<Tab>('watchlist');

  return (
    <View style={styles.container}>

      {/* Screen content */}
      <View style={styles.screen}>
        {activeTab === 'watchlist' && <WatchlistScreen />}
        {activeTab === 'orders' && (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Orders</Text>
          </View>
        )}
      </View>

      {/* Bottom tab bar */}
      <SafeAreaView style={styles.tabBar} edges={['bottom']}>
        {(['watchlist', 'orders'] as Tab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={styles.tab}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[
              styles.tabLabel,
              activeTab === tab && styles.tabLabelActive,
            ]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
            {activeTab === tab && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </SafeAreaView>

    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  screen:    { flex: 1 },

  tabBar: {
    flexDirection:   'row',
    backgroundColor: '#111111',
    borderTopWidth:  1,
    borderTopColor:  '#1A1A1A',
  },
  tab: {
    flex:            1,
    alignItems:      'center',
    paddingVertical: 10,
  },
  tabLabel: {
    fontSize: 12,
    color:    '#5F5E5A',
  },
  tabLabelActive: {
    color:      '#1D9E75',
    fontWeight: '600',
  },
  tabIndicator: {
    position:        'absolute',
    top:             0,
    width:           32,
    height:          2,
    backgroundColor: '#1D9E75',
    borderRadius:    1,
  },

  placeholder: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color:    '#444441',
    fontSize: 20,
  },
});
