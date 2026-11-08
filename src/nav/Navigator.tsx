/**
 * A tiny stack navigator. Starwake has a handful of scenes and wants its own
 * transitions (a soft rise-and-fade, or a plain crossfade under reduced
 * motion) and a back button screens can intercept, so a small purpose-built
 * navigator beats a routing framework here.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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

/** Returns true if it handled the back press (e.g. by pausing a sky). */
type BackInterceptor = () => boolean;

interface Nav {
  route: Route;
  /** Lets the current screen claim the hardware back button first. */
  setBackInterceptor(fn: BackInterceptor | null): void;
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

/** Registers a back-button handler for as long as the calling screen is mounted. */
export function useBackInterceptor(fn: BackInterceptor): void {
  const { setBackInterceptor } = useNav();
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    setBackInterceptor(() => ref.current());
    return () => setBackInterceptor(null);
  }, [setBackInterceptor]);
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
  const interceptor = useRef<BackInterceptor | null>(null);
  const setBackInterceptor = useCallback((fn: BackInterceptor | null) => {
    interceptor.current = fn;
  }, []);

  const push = useCallback(
    (route: Route) => setStack((s) => [...s, { key: nextKey++, route }]),
    [],
  );
  const replace = useCallback(
    (route: Route) => setStack((s) => [...s.slice(0, -1), { key: nextKey++, route }]),
    [],
  );
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const reset = useCallback((route: Route) => setStack([{ key: nextKey++, route }]), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (interceptor.current?.()) return true;
      if (stack.length <= 1) return false;
      back();
      return true;
    });
    return () => sub.remove();
  }, [stack.length, back]);

  const top = stack[stack.length - 1];
  const nav = useMemo<Nav>(
    () => ({
      route: top.route,
      canGoBack: stack.length > 1,
      setBackInterceptor,
      push,
      replace,
      back,
      reset,
    }),
    [top.route, stack.length, setBackInterceptor, push, replace, back, reset],
  );

  const entering = reducedMotion
    ? FadeIn.duration(140)
    : FadeInDown.duration(360).withInitialValues({ transform: [{ translateY: 18 }] });
  const exiting = FadeOut.duration(reducedMotion ? 120 : 220);

  return (
    <NavContext.Provider value={nav}>
      <Animated.View
        key={top.key}
        style={StyleSheet.absoluteFill}
        entering={entering}
        exiting={exiting}
      >
        {render(top.route)}
      </Animated.View>
    </NavContext.Provider>
  );
}
