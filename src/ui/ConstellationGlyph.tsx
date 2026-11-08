import { useMemo } from 'react';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import type { Star } from '../engine/types';
import type { Edge } from '../content/myths';
import { useTheme } from './ThemeProvider';

/** A constellation drawn as a small vector chart, fitted to its own bounds. */
export function ConstellationGlyph({
  stars,
  edges,
  size,
  dim = false,
}: {
  stars: Star[];
  edges: Edge[];
  size: number;
  dim?: boolean;
}) {
  const { palette, glow } = useTheme();
  const points = useMemo(() => {
    const xs = stars.map((s) => s.x);
    const ys = stars.map((s) => s.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1);
    const pad = size * 0.16;
    const k = (size - pad * 2) / span;
    const offX = (size - (Math.max(...xs) - minX) * k) / 2;
    const offY = (size - (Math.max(...ys) - minY) * k) / 2;
    return stars.map((s) => ({ x: offX + (s.x - minX) * k, y: offY + (s.y - minY) * k }));
  }, [stars, size]);
  const line = dim ? palette.border : glow ? palette.star : palette.ink;
  const dot = dim ? palette.textFaint : palette.star;
  return (
    <Svg width={size} height={size} accessible={false}>
      {edges.map(([a, b], i) => (
        <Line
          key={i}
          x1={points[a].x}
          y1={points[a].y}
          x2={points[b].x}
          y2={points[b].y}
          stroke={line}
          strokeWidth={1.4}
          strokeOpacity={dim ? 0.6 : 0.75}
          strokeDasharray={dim ? '3 4' : undefined}
        />
      ))}
      {points.map((p, i) => {
        const r = size * 0.05;
        const w = r * 0.28;
        return dim ? (
          <Circle key={i} cx={p.x} cy={p.y} r={r * 0.5} fill={dot} />
        ) : (
          <Path
            key={i}
            d={`M${p.x},${p.y - r * 1.6}L${p.x + w},${p.y - w}L${p.x + r * 1.6},${p.y}L${p.x + w},${p.y + w}L${p.x},${p.y + r * 1.6}L${p.x - w},${p.y + w}L${p.x - r * 1.6},${p.y}L${p.x - w},${p.y - w}Z`}
            fill={dot}
          />
        );
      })}
    </Svg>
  );
}
