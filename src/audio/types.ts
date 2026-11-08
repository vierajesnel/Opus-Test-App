export interface Clip {
  samples: Float32Array;
  sampleRate: number;
}

/**
 * The platform seam. The native backend writes WAVs to the cache directory
 * and plays them through expo-audio; the web backend hands buffers straight
 * to Web Audio. Everything musical lives above this line.
 */
export interface AudioBackend {
  /** Makes a clip playable, rendering it only if no cached copy exists. */
  load(id: string, render: () => Clip): Promise<void>;
  isLoaded(id: string): boolean;
  play(id: string, volume: number): void;
  /** Crossfades the music bed to `id`. */
  startLoop(id: string, volume: number, fadeMs: number): void;
  setLoopVolume(volume: number, fadeMs: number): void;
  stopLoop(fadeMs: number): void;
  /** Pauses or resumes everything (app backgrounding). */
  setActive(active: boolean): void;
}
