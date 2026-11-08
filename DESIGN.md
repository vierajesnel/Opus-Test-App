# Starwake — design document

## Concept

*Every orbit is a song.* A gravity-slingshot puzzle in which you fling a comet through planets, black holes
and wormholes to wake sleeping stars. Planets ring notes in each sky's mode, so a flight is a melody;
finished skies become named constellations with procedurally written myths.

**Why this concept.** I weighed six candidates: a fungal-network ecosystem, an alien-language decoder, a
tide-pool synth, a procedural cartographer, a light-routing puzzle, and this. Starwake scored highest on
*breadth*: real physics and numerical methods, procedural generation with guarantees, code-synthesised
music, two complete art directions in shaders, writing with a voice, and tactile, haptic play. It also gives
instant delight: pull, glow, release, chime.

## Target feel

Quiet, luminous, tactile, forgiving. Failure is cheap: stars stay awake between flings, so a miss is a
step, not a reset. Mastery means fewer flings (golf-style par) and the rare one-fling *Grace*.

## Characters and voice

- **Ember**: you, a small comet with more enthusiasm than sense.
- **The Lamplighter**: the last lit star. Theatrical, dry, fond of you; never cruel about a miss, never smug
  about a win. Every line of copy is theirs.

## Feature list

- **Voyage:** 6 chapters × 8 skies, one new idea per chapter, one musical mode per chapter.
- **Daily Sky:** generated on-device from the date; streaks; shareable result.
- **Orrery:** a sandbox and instrument; save slots, share codes, shake-to-scatter.
- **Star Atlas** of collected constellations; **Logbook** of stats and 19 achievements.
- **Themes:** Midnight and Almanac. **Settings:** sound, haptics, tilt, theme, motion, guidance, aim pad,
  comet skin, reset.
- **Accessibility:** screen-reader aim pad with predicted outcomes, announcements, reduced motion,
  dynamic type, contrast-tested tokens.
- **Easter eggs:** the title's secret, the night-owl hours, being spaghettified, scattering the Orrery.

## Architecture

| Layer | Thread | Notes |
|---|---|---|
| `engine/` | UI and Node | Pure deterministic worklets; shared with build-time generation |
| `game/worklets/` | UI | Per-frame sky and Orrery logic over shared values |
| `render/` | UI (Skia) | Shaders, backdrop texture, one recorded picture per frame |
| `game/`, `screens/` | JS | Orchestration: events → audio, haptics, saves, copy |
| `audio/`, `music/` | JS | Lazy synthesis queue → WAV cache → expo-audio voice pools |
| `state/` | JS | External store; checksummed, backed-up, sanitised persistence |
| `gen/` | JS and Node | Constructive generator and solver; time-sliced on device |

**Data model** (`state/schema.ts`): `SaveData { settings, levels{id → best, grace}, daily{records, streak},
stats, achievements{id → time}, orrery[3], flags }`. Levels (`gen/types.ts`): `LevelDef { world{launch,
bodies, stars, wormholes}, par, solution[], preview, difficulty, key{root, mode} }`.

## Milestones (as executed)

1. Scaffold and tooling (TypeScript strict, ESLint, Jest, Prettier, Skia on web).
2. Engine and tests, including the worklet guard.
3. Generator, solver, campaign build, Daily Sky.
4. Synth, WAV encoder, audio director and backends.
5. Rendering and the core loop, verified in Chromium screenshots.
6. State, persistence, content and every screen.
7. Polish: themes, onboarding, accessibility, easter eggs, procedural icons.
8. Self-review passes, native bundle checks, documentation.
