import React, { useEffect } from 'react';
import {
  StatusBar,
  StyleSheet,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { di } from '@core/di/container';
import { AppNavigator } from '@features/navigation/AppNavigator';

export default function App() {
  useEffect(() => {
    // Verify New Architecture is active
    const isNewArch = (global as any).RN$Bridgeless === true;
    if (__DEV__) {
      console.log(
        isNewArch
          ? '[Nubra] New Architecture (JSI + Fabric) active'
          : '[Nubra] WARNING: Legacy bridge — check android/gradle.properties'
      );
    }

    // Initialise DI container at app start
    di.initialise();

    return () => {
      di.dispose();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="#e09494"
        />
        <AppNavigator />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
});
