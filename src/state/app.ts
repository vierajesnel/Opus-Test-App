/**
 * App-wide state and the only code allowed to change the save. Every action
 * updates the store, schedules a debounced write, and checks achievements.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { newlyUnlocked } from '../content/achievements';
import { SAVE_NOTICES } from '../content/copy';
import { PARS } from '../content/levels';
import { createSaver, loadSave, type LoadOutcome } from './persistence';
import {
  accumulateFlight,
  recordCompletion,
  recordDaily,
  type FlightReport,
} from './progress';
import { defaultSave, type OrreryLayout, type SaveData, type Settings } from './schema';
import { createStore, useStore } from './store';

export interface Toast {
  id: number;
  kind: 'achievement' | 'notice';
  title: string;
  body: string;
}

interface AppState {
  ready: boolean;
  outcome: LoadOutcome;
  save: SaveData;
  toasts: Toast[];
}

export const appStore = createStore<AppState>({
  ready: false,
  outcome: 'fresh',
  save: defaultSave(),
  toasts: [],
});

const saver = createSaver(AsyncStorage);
let toastId = 0;

function pushToast(kind: Toast['kind'], title: string, body: string) {
  appStore.set((s) => ({ ...s, toasts: [...s.toasts, { id: ++toastId, kind, title, body }] }));
}

export function dismissToast(id: number) {
  appStore.set((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }));
}

export async function hydrate(): Promise<void> {
  const { save, outcome } = await loadSave(AsyncStorage);
  saver.prime(save);
  appStore.set((s) => ({ ...s, ready: true, save, outcome }));
  if (outcome === 'restored-backup' || outcome === 'repaired' || outcome === 'reset') {
    pushToast('notice', 'A note from the Lamplighter', SAVE_NOTICES[outcome]);
  }
}

export function flushSave(): Promise<void> {
  return saver.flush();
}

function update(fn: (save: SaveData) => SaveData, context: { flight?: FlightReport; orreryAloft?: number } = {}) {
  appStore.set((s) => {
    let save = fn(s.save);
    const unlocked = newlyUnlocked({
      save,
      pars: PARS,
      hour: new Date().getHours(),
      ...context,
    });
    if (unlocked.length) {
      const now = Date.now();
      const achievements = { ...save.achievements };
      for (const a of unlocked) achievements[a.id] = now;
      save = { ...save, achievements };
      // Toasts are queued after this update commits.
      setTimeout(() => {
        for (const a of unlocked) pushToast('achievement', a.title, a.reward ?? a.blurb);
      }, 0);
    }
    return { ...s, save };
  });
  saver.schedule(appStore.get().save);
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  update((save) => ({ ...save, settings: { ...save.settings, [key]: value } }));
}

/** Records a finished fling (any mode except the Orrery). */
export function reportFlight(report: FlightReport, starsWoken: number, levelId: string | null) {
  update(
    (save) => {
      const next = { ...save, stats: accumulateFlight(save.stats, report, starsWoken) };
      const rec = levelId ? save.levels[levelId] : undefined;
      if (levelId && rec) next.levels = { ...save.levels, [levelId]: { ...rec, flings: rec.flings + 1 } };
      return next;
    },
    { flight: report },
  );
}

export function reportCompletion(levelId: string, flings: number) {
  let result = { firstClear: false, improved: false };
  update((save) => {
    const r = recordCompletion(save, levelId, flings, Date.now());
    result = { firstClear: r.firstClear, improved: r.improved };
    return r.save;
  });
  return result;
}

export function reportDaily(date: string, flings: number, par: number) {
  update((save) => recordDaily(save, date, flings, par, Date.now()));
}

export function reportOrrery(notes: number, launched: number, aloft: number) {
  update(
    (save) => ({
      ...save,
      stats: {
        ...save.stats,
        orreryNotes: save.stats.orreryNotes + notes,
        orreryComets: save.stats.orreryComets + launched,
      },
    }),
    { orreryAloft: aloft },
  );
}

export function discoverSecret() {
  update((save) => ({ ...save, flags: { ...save.flags, secret: true } }));
}

export function markOnboarded() {
  update((save) => ({ ...save, flags: { ...save.flags, onboarded: true } }));
}

export function markLessonSeen(chapter: number) {
  update((save) =>
    save.flags.lessons.includes(chapter)
      ? save
      : { ...save, flags: { ...save.flags, lessons: [...save.flags.lessons, chapter] } },
  );
}

export function saveOrrerySlot(slot: number, layout: OrreryLayout | null) {
  update((save) => {
    const orrery = save.orrery.slice();
    orrery[slot] = layout;
    return { ...save, orrery };
  });
}

/** Forgets progress but keeps the player's settings. */
export function resetProgress() {
  update((save) => ({ ...defaultSave(), settings: save.settings }));
}

export function useSave<S>(selector: (save: SaveData) => S, isEqual?: (a: S, b: S) => boolean): S {
  return useStore(appStore, (s: AppState) => selector(s.save), isEqual);
}

export function useApp<S>(selector: (state: AppState) => S, isEqual?: (a: S, b: S) => boolean): S {
  return useStore(appStore, selector, isEqual);
}
