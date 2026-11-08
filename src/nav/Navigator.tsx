/**
 * A tiny stack navigator. Starwake has a handful of scenes and wants its own
 * transitions (a soft rise-and-fade, or a plain crossfade under reduced
 * motion), so a 70-line navigator beats a routing framework here.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BackHandler, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { useAmbience } from '../ui/ThemeProvider';

export type Route =
  | { name: 'title' }
  | { name: 'voyage'; chapter?: number }
  | { name: 'level'; id: string }
  | { name: 'daily' }
  | { name: 'orrery' }
  | { name: 'atlas' }
  | { name: 'logbook' }
  | { name: 'settings' }
  | { name: 'about' };

interface Entry {
  key: number;
  route: Route;
}

interface Nav {
  route: Route;
  canGoBack: boolean;
  push(route: Route): void;
  replace(route: Route): void;
  back(): void;
  reset(route: Route): void;
}

const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('useNav must be used inside <Navigator>');
  return nav;
}

let nextKey = 1;

export function Navigator({
  initial,
  render,
}: {
  initial: Route;
  render: (route: Route) => ReactNode;
}) {
  const [stack, setStack] = useState<Entry[]>([{ key: 0, route: initial }]);
  const { reducedMotion } = useAmbience();

  const push = useCallback((route: Route) => setStack((s) => [...s, { key: nextKey++, route }]), []);
  const replace = useCallback(
    (route: Route) => setStack((s) => [...s.slice(0, -1), { key: nextKey++, route }]),
    [],
  );
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const reset = useCallback((route: Route) => setStack([{ key: nextKey++, route }]), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length <= 1) return false;
      back();
      return true;
    });
    return () => sub.remove();
  }, [stack.length, back]);

  const top = stack[stack.length - 1];
  const nav = useMemo<Nav>(
    () => ({ route: top.route, canGoBack: stack.length > 1, push, replace, back, reset }),
    [top.route, stack.length, push, replace, back, reset],
  );

  const entering = reducedMotion ? FadeIn.duration(140) : FadeInDown.duration(360).withInitialValues({ transform: [{ translateY: 18 }] });
  const exiting = FadeOut.duration(reducedMotion ? 120 : 220);

  return (
    <NavContext.Provider value={nav}>
      <Animated.View key={top.key} style={StyleSheet.absoluteFill} entering={entering} exiting={exiting}>
        {render(top.route)}
      </Animated.View>
    </NavContext.Provider>
  );
}
