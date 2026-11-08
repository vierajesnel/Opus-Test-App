/**
 * Durable saves: a versioned, checksummed envelope written to two slots.
 *
 * On load we try the primary slot, then the backup, verifying the checksum
 * and migrating old schemas; whatever we recover is run through the
 * sanitiser, so a half-broken save keeps every field that still makes
 * sense. The outcome is reported so the UI can say something kind about it.
 */
import { SCHEMA_VERSION, defaultSave, sanitizeSave, type SaveData } from './schema';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const PRIMARY_KEY = 'starwake/save';
export const BACKUP_KEY = 'starwake/save.backup';

export type LoadOutcome = 'fresh' | 'ok' | 'restored-backup' | 'repaired' | 'reset';

interface Envelope {
  v: number;
  sum: string;
  data: unknown;
}

/** FNV-1a, 32-bit: tiny and plenty for spotting truncation or bit rot. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function encodeSave(save: SaveData): string {
  const data = JSON.stringify(save);
  return JSON.stringify({ v: SCHEMA_VERSION, sum: checksum(data), data: save });
}

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/** Each entry upgrades a save from version `n` to `n + 1`. */
const MIGRATIONS: Record<number, Migration> = {
  // v1 kept level progress as { [id]: number } (best flings only).
  1: (data) => {
    const levels: Record<string, unknown> = {};
    const old = (data.levels ?? {}) as Record<string, unknown>;
    for (const [id, best] of Object.entries(old)) {
      if (typeof best === 'number') levels[id] = { best, grace: best === 1, completedAt: 0 };
    }
    return { ...data, levels };
  },
};

export function migrate(version: number, data: unknown): unknown {
  let current = data as Record<string, unknown>;
  for (let v = version; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (step) current = step(current);
  }
  return current;
}

type Decoded = { ok: true; data: unknown } | { ok: false; partial: unknown };

function decode(raw: string | null): Decoded | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, partial: undefined };
  }
  const env = parsed as Partial<Envelope>;
  if (typeof env !== 'object' || env === null || typeof env.v !== 'number') {
    return { ok: false, partial: undefined };
  }
  if (env.v > SCHEMA_VERSION) return { ok: false, partial: env.data };
  const intact = typeof env.sum === 'string' && checksum(JSON.stringify(env.data)) === env.sum;
  const data = migrate(env.v, env.data);
  return intact ? { ok: true, data } : { ok: false, partial: data };
}

export async function loadSave(
  store: KeyValueStore,
): Promise<{ save: SaveData; outcome: LoadOutcome }> {
  let primaryRaw: string | null = null;
  let backupRaw: string | null = null;
  try {
    [primaryRaw, backupRaw] = await Promise.all([
      store.getItem(PRIMARY_KEY),
      store.getItem(BACKUP_KEY),
    ]);
  } catch {
    return { save: defaultSave(), outcome: 'reset' };
  }
  if (primaryRaw === null && backupRaw === null) return { save: defaultSave(), outcome: 'fresh' };

  const primary = decode(primaryRaw);
  if (primary?.ok) return { save: sanitizeSave(primary.data), outcome: 'ok' };

  const backup = decode(backupRaw);
  if (backup?.ok) return { save: sanitizeSave(backup.data), outcome: 'restored-backup' };

  // Neither slot is intact; salvage whatever the sanitiser can make sense of.
  const salvage =
    primary && !primary.ok ? primary.partial : backup && !backup.ok ? backup.partial : undefined;
  if (salvage && typeof salvage === 'object')
    return { save: sanitizeSave(salvage), outcome: 'repaired' };
  return { save: defaultSave(), outcome: 'reset' };
}

/**
 * Writes a save. The previous primary (known good) becomes the backup, so a
 * write interrupted halfway still leaves a valid copy behind.
 */
export function createSaver(store: KeyValueStore, delayMs = 400) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: SaveData | null = null;
  let lastWritten: string | null = null;
  let chain: Promise<void> = Promise.resolve();

  const write = (save: SaveData) => {
    const encoded = encodeSave(save);
    if (encoded === lastWritten) return chain;
    const previous = lastWritten;
    lastWritten = encoded;
    chain = chain
      .then(async () => {
        if (previous) await store.setItem(BACKUP_KEY, previous);
        await store.setItem(PRIMARY_KEY, encoded);
      })
      .catch((e) => console.warn('Save failed', e));
    return chain;
  };

  return {
    /** Remember what was loaded so the first write can back it up. */
    prime(save: SaveData) {
      lastWritten = encodeSave(save);
    },
    schedule(save: SaveData) {
      pending = save;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (pending) write(pending);
        pending = null;
      }, delayMs);
    },
    /** Writes immediately (on backgrounding). */
    flush(): Promise<void> {
      if (timer) clearTimeout(timer);
      timer = null;
      const save = pending;
      pending = null;
      return save ? write(save) : chain;
    },
  };
}
