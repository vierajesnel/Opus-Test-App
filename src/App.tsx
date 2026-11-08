import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { audio } from './audio';
import { Navigator, type Route } from './nav/Navigator';
import { AboutScreen } from './screens/AboutScreen';
import { AtlasScreen } from './screens/AtlasScreen';
import { DailyScreen } from './screens/DailyScreen';
import { LevelScreen } from './screens/LevelScreen';
import { LogbookScreen } from './screens/LogbookScreen';
import { OrreryScreen } from './screens/OrreryScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TitleScreen } from './screens/TitleScreen';
import { VoyageScreen } from './screens/VoyageScreen';
import { flushSave, hydrate, useApp, useSave } from './state/app';
import { ThemeProvider, useAmbience } from './ui/ThemeProvider';
import { Toasts } from './ui/Toasts';

function renderRoute(route: Route) {
  switch (route.name) {
    case 'title':
      return <TitleScreen />;
    case 'voyage':
      return <VoyageScreen />;
    case 'level':
      return <LevelScreen id={route.id} />;
    case 'daily':
      return <DailyScreen />;
    case 'orrery':
      return <OrreryScreen />;
    case 'atlas':
      return <AtlasScreen />;
    case 'logbook':
      return <LogbookScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'about':
      return <AboutScreen />;
  }
}

/** Keeps the audio mix, system chrome and app lifecycle in sync with settings. */
function Conductor() {
  const { theme } = useAmbience();
  const mix = useSave(
    (s) => s.settings,
    (a, b) => a.music === b.music && a.sfx === b.sfx && a.muted === b.muted,
  );

  useEffect(() => {
    audio().configure({ music: mix.music, sfx: mix.sfx, muted: mix.muted });
  }, [mix]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.palette.bg).catch(() => undefined);
  }, [theme]);

  useEffect(() => {
    audio().warmUp();
    const sub = AppState.addEventListener('change', (state) => {
      audio().setActive(state === 'active');
      if (state !== 'active') void flushSave();
    });
    return () => sub.remove();
  }, []);

  return <StatusBar style={theme.dark ? 'light' : 'dark'} />;
}

function Shell() {
  const ready = useApp((s) => s.ready);
  const { theme } = useAmbience();
  return (
    <View style={[styles.root, { backgroundColor: theme.palette.bg }]}>
      <Conductor />
      {ready && <Navigator initial={{ name: 'title' }} render={renderRoute} />}
      <Toasts />
    </View>
  );
}

export default function App() {
  useEffect(() => {
    void hydrate();
  }, []);
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Shell />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
