import { createBackend } from './backend';
import { createDirector, type AudioDirector } from './director';

let director: AudioDirector | null = null;

/** The app-wide audio director, created on first use. */
export function audio(): AudioDirector {
  if (!director) director = createDirector(createBackend());
  return director;
}

export type { AudioMix } from './director';
