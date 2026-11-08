/**
 * A forty-line external store. Components subscribe to a selected slice and
 * re-render only when that slice changes; the whole app shares one store.
 */
import { useCallback, useRef, useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(updater: (state: T) => T): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(updater) {
      const next = updater(state);
      if (Object.is(next, state)) return;
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Subscribes to `selector(state)`, re-rendering only when it changes under `isEqual`. */
export function useStore<T, S>(
  store: Store<T>,
  selector: (state: T) => S,
  isEqual: (a: S, b: S) => boolean = Object.is,
): S {
  const cache = useRef<{ state: T; selector: (state: T) => S; value: S } | null>(null);
  const getSnapshot = useCallback(() => {
    const state = store.get();
    const cached = cache.current;
    if (cached && cached.state === state && cached.selector === selector) return cached.value;
    const value = selector(state);
    if (cached && isEqual(cached.value, value)) {
      cache.current = { state, selector, value: cached.value };
      return cached.value;
    }
    cache.current = { state, selector, value };
    return value;
  }, [store, selector, isEqual]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
