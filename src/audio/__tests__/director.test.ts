import { createDirector } from '../director';
import type { AudioBackend, Clip } from '../types';

function fakeBackend() {
  const loaded = new Set<string>();
  const log: string[] = [];
  const plays: { id: string; volume: number }[] = [];
  let loop: string | null = null;
  const backend: AudioBackend = {
    // Rendering is the music suite's job; here we only check what gets queued, and when.
    // (Actually synthesising every clip made these tests CPU-bound and flaky on CI.)
    load: async (id, render: () => Clip) => {
      expect(typeof render).toBe('function');
      loaded.add(id);
      log.push(id);
    },
    isLoaded: (id) => loaded.has(id),
    play: (id, volume) => {
      if (loaded.has(id)) plays.push({ id, volume });
    },
    startLoop: (id) => {
      loop = id;
    },
    setLoopVolume: () => undefined,
    stopLoop: () => {
      loop = null;
    },
    setActive: () => undefined,
  };
  return { backend, log, plays, loaded, loop: () => loop };
}

/** Runs scheduled work synchronously, one task at a time, until idle. */
function manualScheduler() {
  const tasks: (() => void)[] = [];
  return {
    schedule: (fn: () => void) => tasks.push(fn),
    async drain() {
      while (tasks.length) {
        tasks.shift()!();
        await new Promise((r) => setImmediate(r));
      }
    },
  };
}

const key = { root: 62, mode: 'dorian' as const };

describe('audio director', () => {
  it('synthesises urgent sounds first and never twice', async () => {
    const fake = fakeBackend();
    const sched = manualScheduler();
    const director = createDirector(fake.backend, sched.schedule);
    director.prepareSky(key, [0, 2, 2], 2);
    director.warmUp();
    director.prepareSky(key, [0], 1);
    await sched.drain();
    // The first task was already in flight; after it, sfx (priority 3) jump the queue.
    const firstSfx = fake.log.findIndex((id) => id.startsWith('sfx-'));
    const pad = fake.log.indexOf('pad-62-dorian');
    expect(firstSfx).toBeLessThan(pad);
    expect(new Set(fake.log).size).toBe(fake.log.length);
    expect(fake.log.filter((id) => id.startsWith('bell-'))).toEqual(['bell-62', 'bell-65']);
  });

  it('starts the music bed once its loop has been rendered', async () => {
    const fake = fakeBackend();
    const sched = manualScheduler();
    const director = createDirector(fake.backend, sched.schedule);
    director.playMusic(key);
    expect(fake.loop()).toBeNull();
    await sched.drain();
    expect(fake.loop()).toBe('pad-62-dorian');
    director.stopMusic();
    expect(fake.loop()).toBeNull();
  });

  it('maps sky events onto the key and honours the mix', async () => {
    const fake = fakeBackend();
    const sched = manualScheduler();
    const director = createDirector(fake.backend, sched.schedule);
    director.prepareSky(key, [4], 3);
    await sched.drain();
    director.sing(key, 4, 1);
    director.sing(key, 4, 0);
    director.wake(key, 2, 3);
    expect(fake.plays[0].id).toBe('bell-69');
    expect(fake.plays[0].volume).toBeGreaterThan(fake.plays[1].volume);
    // Root, third, fifth: the third star rings D dorian's fifth an octave up, A5.
    expect(fake.plays[2].id).toBe('chime-81');

    director.configure({ music: 1, sfx: 1, muted: true });
    director.sing(key, 4, 1);
    expect(fake.plays[3]?.volume ?? 0).toBe(0);
  });
});
