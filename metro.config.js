const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const config = {
  resolver: {
    extraNodeModules: {
      '@core':     path.resolve(__dirname, 'src/core'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@infra':    path.resolve(__dirname, 'src/infrastructure'),
    },
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        // Inline requires: defer module evaluation until first use
        // Reduces cold start — only load what the current screen needs
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
