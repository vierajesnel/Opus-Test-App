import {
  BACKUP_KEY,
  checksum,
  createSaver,
  encodeSave,
  loadSave,
  migrate,
  PRIMARY_KEY,
  type KeyValueStore,
} from '../persistence';
import { defaultSave, sanitizeSave, SCHEMA_VERSION } from '../schema';

function memoryStore(
  initial: Record<string, string> = {},
): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: async (k) => data[k] ?? null,
    setItem: async (k, v) => {
      data[k] = v;
    },
  };
}

function progressSave() {
  const save = defaultSave();
  save.levels['1-1'] = { best: 1, grace: true, completedAt: 5 };
  save.stats.flings = 42;
  save.settings.music = 0.3;
  return save;
}

describe('save loading', () => {
  it('starts fresh when nothing is stored', async () => {
    const { save, outcome } = await loadSave(memoryStore());
    expect(outcome).toBe('fresh');
    expect(save).toEqual(defaultSave());
  });

  it('round-trips an intact save', async () => {
    const original = progressSave();
    const { save, outcome } = await loadSave(memoryStore({ [PRIMARY_KEY]: encodeSave(original) }));
    expect(outcome).toBe('ok');
    expect(save).toEqual(original);
  });

  it('falls back to the backup when the primary is truncated', async () => {
    const good = progressSave();
    const encoded = encodeSave(good);
    const store = memoryStore({
      [PRIMARY_KEY]: encoded.slice(0, encoded.length / 2),
      [BACKUP_KEY]: encoded,
    });
    const { save, outcome } = await loadSave(store);
    expect(outcome).toBe('restored-backup');
    expect(save.stats.flings).toBe(42);
  });

  it('detects silent corruption with the checksum', async () => {
    const tampered = encodeSave(progressSave()).replace('"flings":42', '"flings":43');
    const backup = encodeSave(defaultSave());
    const { outcome } = await loadSave(
      memoryStore({ [PRIMARY_KEY]: tampered, [BACKUP_KEY]: backup }),
    );
    expect(outcome).toBe('restored-backup');
  });

  it('salvages what it can when both copies are damaged', async () => {
    const env = JSON.parse(encodeSave(progressSave()));
    env.sum = 'deadbeef';
    env.data.settings.music = 'loud';
    env.data.levels['9-9'] = { best: 'many' };
    const { save, outcome } = await loadSave(
      memoryStore({ [PRIMARY_KEY]: JSON.stringify(env), [BACKUP_KEY]: '{oops' }),
    );
    expect(outcome).toBe('repaired');
    expect(save.stats.flings).toBe(42);
    expect(save.levels['1-1'].best).toBe(1);
    expect(save.levels['9-9']).toBeUndefined();
    expect(save.settings.music).toBe(defaultSave().settings.music);
  });

  it('resets cleanly when nothing is recoverable', async () => {
    const { save, outcome } = await loadSave(
      memoryStore({ [PRIMARY_KEY]: 'not json', [BACKUP_KEY]: 'nope' }),
    );
    expect(outcome).toBe('reset');
    expect(save).toEqual(defaultSave());
  });

  it('survives a storage layer that throws', async () => {
    const broken: KeyValueStore = {
      getItem: () => Promise.reject(new Error('disk on fire')),
      setItem: () => Promise.resolve(),
    };
    expect((await loadSave(broken)).outcome).toBe('reset');
  });

  it('migrates a version-1 save', async () => {
    const v1 = { levels: { '1-1': 2, '1-2': 1 }, stats: { flings: 7 } };
    const env = { v: 1, sum: checksum(JSON.stringify(v1)), data: v1 };
    const { save, outcome } = await loadSave(memoryStore({ [PRIMARY_KEY]: JSON.stringify(env) }));
    expect(outcome).toBe('ok');
    expect(save.schema).toBe(SCHEMA_VERSION);
    expect(save.levels['1-1']).toMatchObject({ best: 2, grace: false });
    expect(save.levels['1-2']).toMatchObject({ best: 1, grace: true });
    expect(save.stats.flings).toBe(7);
    expect(migrate(SCHEMA_VERSION, { a: 1 })).toEqual({ a: 1 });
  });
});

describe('sanitizer', () => {
  it('clamps, defaults and filters every field', () => {
    const save = sanitizeSave({
      settings: { music: 4, sfx: -1, theme: 'neon', comet: 'nova', haptics: 'yes' },
      daily: {
        streak: -3,
        lastDate: 'yesterday',
        records: { '2026-11-01': { flings: 2, par: 2 }, bad: 7 },
      },
      orrery: [
        {
          name: 'x'.repeat(99),
          bodies: [{ kind: 'planet', x: 1, y: 2, r: 30, mass: 5 }, { kind: 'planet' }],
        },
      ],
      flags: { lessons: [1, 'two', 3] },
      achievements: { a: 1, b: 'no' },
    });
    expect(save.settings.music).toBe(1);
    expect(save.settings.sfx).toBe(0);
    expect(save.settings.theme).toBe('system');
    expect(save.settings.comet).toBe('nova');
    expect(save.settings.haptics).toBe(true);
    expect(save.daily.streak).toBe(0);
    expect(save.daily.lastDate).toBeNull();
    expect(Object.keys(save.daily.records)).toEqual(['2026-11-01']);
    expect(save.orrery[0]!.name).toHaveLength(40);
    expect(save.orrery[0]!.bodies).toHaveLength(1);
    expect(save.orrery[1]).toBeNull();
    expect(save.flags.lessons).toEqual([1, 3]);
    expect(save.achievements).toEqual({ a: 1 });
    expect(sanitizeSave(null)).toEqual(defaultSave());
    expect(sanitizeSave([1, 2])).toEqual(defaultSave());
  });
});

describe('saver', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('debounces writes and keeps the previous save as backup', async () => {
    const store = memoryStore();
    const saver = createSaver(store, 100);
    const first = defaultSave();
    saver.prime(first);
    const second = progressSave();
    saver.schedule({ ...second, stats: { ...second.stats, flings: 1 } });
    saver.schedule(second);
    expect(store.data[PRIMARY_KEY]).toBeUndefined();
    jest.advanceTimersByTime(150);
    await saver.flush();
    expect(JSON.parse(store.data[PRIMARY_KEY]).data.stats.flings).toBe(42);
    expect(store.data[BACKUP_KEY]).toBe(encodeSave(first));
  });

  it('flushes immediately and skips identical writes', async () => {
    const store = memoryStore();
    const writes: string[] = [];
    const spy: KeyValueStore = {
      getItem: store.getItem,
      setItem: async (k, v) => {
        writes.push(k);
        await store.setItem(k, v);
      },
    };
    const saver = createSaver(spy, 10_000);
    saver.schedule(progressSave());
    await saver.flush();
    saver.schedule(progressSave());
    await saver.flush();
    expect(writes).toEqual([PRIMARY_KEY]);
  });
});
