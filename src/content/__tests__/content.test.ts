import { THEMES } from '../../ui/theme';
import { CHAPTERS, LEVELS_PER_CHAPTER, slotParams } from '../chapters';
import { line, LINES } from '../copy';
import { LEVELS } from '../levels';
import { nameConstellation, roundness, spanningEdges } from '../myths';

describe('constellations', () => {
  it('joins every star with a minimum spanning tree', () => {
    const stars = [
      { x: 0, y: 0, r: 1 },
      { x: 10, y: 0, r: 1 },
      { x: 10, y: 10, r: 1 },
      { x: 100, y: 100, r: 1 },
    ];
    const edges = spanningEdges(stars);
    expect(edges).toHaveLength(3);
    const reached = new Set(edges.flat());
    expect(reached.size).toBe(4);
    // The far star hangs off its nearest neighbour.
    expect(edges).toContainEqual([2, 3]);
  });

  it('measures shape: lines are thin, clouds are round', () => {
    const line3 = [0, 1, 2].map((i) => ({ x: i * 50, y: i * 50, r: 1 }));
    const square = [
      { x: 0, y: 0, r: 1 },
      { x: 100, y: 0, r: 1 },
      { x: 0, y: 100, r: 1 },
      { x: 100, y: 100, r: 1 },
    ];
    expect(roundness(line3)).toBeLessThan(0.01);
    expect(roundness(square)).toBeCloseTo(1, 5);
  });

  it('names every Voyage sky deterministically and grammatically', () => {
    const names = new Set<string>();
    for (const level of LEVELS) {
      const a = nameConstellation(level.world.stars, level.seed);
      expect(nameConstellation(level.world.stars, level.seed)).toEqual(a);
      expect(a.name).toMatch(/^The [A-Z]/);
      expect(a.myth).toMatch(/^[A-Z].+\. .+[.]$/);
      expect(a.myth).not.toMatch(/Said to have (fell|stole|swallowed a song whole, and still)/);
      names.add(a.name);
    }
    // Plenty of variety across the campaign.
    expect(names.size).toBeGreaterThan(LEVELS.length * 0.8);
  });
});

describe('the Lamplighter', () => {
  it('never repeats a line until the bag is empty', () => {
    const n = LINES.crash.length;
    const drawn = Array.from({ length: n }, () => line('crash'));
    expect(new Set(drawn).size).toBe(n);
  });
});

describe('chapters', () => {
  it('defines parameters for every slot', () => {
    for (let c = 0; c < CHAPTERS.length; c++) {
      for (let s = 0; s < LEVELS_PER_CHAPTER; s++) {
        const p = slotParams(c, s);
        expect(p.stars).toBeGreaterThanOrEqual(p.shots);
        expect(p.planets[0]).toBeLessThanOrEqual(p.planets[1]);
      }
    }
  });
});

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('design tokens', () => {
  it.each(Object.values(THEMES).map((t) => [t.name, t] as const))(
    '%s meets WCAG contrast',
    (_n, theme) => {
      const p = theme.palette;
      for (const bg of [p.bg, p.bgDeep, p.surfaceSolid]) {
        expect(contrast(p.text, bg)).toBeGreaterThanOrEqual(7);
        expect(contrast(p.textMuted, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.textFaint, bg)).toBeGreaterThanOrEqual(3);
      }
      expect(contrast(p.accentText, p.accent)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
