/**
 * SkSL runtime shaders. Each one has a luminous Midnight look and an
 * engraved Almanac look selected by the `ink` uniform (0 or 1), so a single
 * effect serves both skies.
 */
import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

function compile(name: string, sksl: string): SkRuntimeEffect {
  const effect = Skia.RuntimeEffect.Make(sksl);
  if (!effect) throw new Error(`Shader "${name}" failed to compile`);
  return effect;
}

const NOISE = `
float hash(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1, 0)), u.x),
             mix(hash(i + float2(0, 1)), hash(i + float2(1, 1)), u.x), u.y);
}
float fbm(float2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + float2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}
`;

/** Backdrop. Midnight: domain-warped nebula and a hashed star field. Almanac: parchment. */
export const backdropShader = compile(
  'backdrop',
  `
uniform float2 size;
uniform float seed;
uniform half3 tintA;
uniform half3 tintB;
uniform half3 base;
uniform float ink;
${NOISE}
half4 main(float2 pos) {
  float2 uv = pos / max(size.x, size.y);
  if (ink > 0.5) {
    float mottle = fbm(uv * 3.0 + seed) * 0.6 + fbm(uv * 11.0 - seed) * 0.4;
    float grain = hash(pos * 0.73 + seed) * 0.05;
    float fox = smoothstep(0.78, 0.92, fbm(uv * 6.0 + seed * 2.0)) * 0.12;
    float2 c = pos / size - 0.5;
    float vignette = smoothstep(0.35, 0.85, length(c * float2(1.0, 0.8)));
    half3 col = base * (0.94 + mottle * 0.1 - grain) - half3(0.10, 0.12, 0.16) * fox;
    col *= 1.0 - vignette * 0.16;
    return half4(col, 1.0);
  }
  float2 q = float2(fbm(uv * 2.2 + seed), fbm(uv * 2.2 - seed + 3.1));
  float n = fbm(uv * 2.0 + q * 1.6 + seed * 0.3);
  float wisps = smoothstep(0.42, 0.95, n);
  float dust = smoothstep(0.55, 0.9, fbm(uv * 5.0 - q + seed));
  half3 col = base;
  col += tintA * wisps * 0.8;
  col += tintB * dust * 0.45 * wisps;
  // Star field: one candidate star per cell, most cells empty.
  float2 cell = floor(pos / 9.0);
  float h = hash(cell + seed);
  if (h > 0.93) {
    float2 sp = (cell + float2(hash(cell * 1.7 + seed), hash(cell * 2.3 - seed))) * 9.0;
    float d = length(pos - sp);
    float bright = (h - 0.93) / 0.07;
    col += half3(0.9, 0.92, 1.0) * smoothstep(1.3, 0.0, d) * (0.35 + bright * 0.65);
  }
  float2 c = pos / size - 0.5;
  col *= 1.0 - smoothstep(0.3, 0.9, length(c)) * 0.55;
  return half4(col, 1.0);
}
`,
);

/** Banded planet with lighting and atmosphere; hatched shading in ink mode. */
export const planetShader = compile(
  'planet',
  `
uniform float2 center;
uniform float radius;
uniform float time;
uniform half3 colA;
uniform half3 colB;
uniform half3 inkCol;
uniform float seed;
uniform float ink;
uniform float glow;
${NOISE}
half4 main(float2 p) {
  float2 q = (p - center) / radius;
  float r2 = dot(q, q);
  float halo = 0.0;
  if (r2 > 1.0) {
    halo = glow * exp(-(sqrt(r2) - 1.0) * 7.0) * 0.55;
    return half4(colB * halo, halo);
  }
  float z = sqrt(1.0 - r2);
  float3 n = float3(q, z);
  float lon = atan(q.x, z) * 0.9 + time * 0.12 + seed;
  float lat = q.y;
  float bands = sin(lat * (7.0 + fract(seed) * 6.0) + fbm(float2(lon * 1.5, lat * 4.0) + seed) * 2.6);
  float storm = smoothstep(0.82, 0.95, fbm(float2(lon * 2.5, lat * 6.0) - seed));
  half3 surface = mix(colA, colB, 0.5 + 0.5 * bands);
  surface = mix(surface, half3(1.0, 0.96, 0.9), storm * 0.35);
  float3 L = normalize(float3(-0.55, -0.6, 0.6));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  float edge = smoothstep(1.0, 0.94, r2);
  if (ink > 0.5) {
    float hatch = step(0.5, fract((q.x + q.y) * 9.0));
    float shade = smoothstep(0.55, 0.1, diff);
    half3 paper = mix(half3(0.97, 0.93, 0.85), surface, 0.6);
    half3 col = mix(paper, inkCol, hatch * shade * 0.8);
    col = mix(col, inkCol, smoothstep(0.86, 0.94, r2));
    return half4(col * edge, edge);
  }
  float rim = pow(1.0 - z, 2.5);
  half3 col = surface * (0.18 + 0.95 * diff) + colB * rim * 0.9;
  return half4(col * edge, edge);
}
`,
);

/**
 * Black hole with gravitational lensing: the backdrop (a child shader) is
 * sampled at positions pulled toward the singularity, by an amount that
 * falls off with distance — so nebulae and grid lines visibly bend around it.
 */
export const blackHoleShader = compile(
  'blackhole',
  `
uniform shader backdrop;
uniform float2 center;
uniform float radius;
uniform float time;
uniform float ink;
uniform half3 inkCol;
half4 main(float2 p) {
  float2 d = p - center;
  float r = length(d);
  float reach = radius * 5.0;
  float fade = smoothstep(reach, reach * 0.7, r);
  float bend = radius * radius * 2.6 / max(r, radius * 0.6) * fade;
  float2 dir = d / max(r, 0.001);
  half4 bg = backdrop.eval(p - dir * bend);
  float a = atan(d.y, d.x);
  float horizon = smoothstep(radius * 1.04, radius * 0.92, r);
  float ring = exp(-pow((r - radius * 1.45) / (radius * 0.14), 2.0));
  float swirl = 0.5 + 0.5 * sin(a * 3.0 - time * 2.2 + r * 0.09);
  float disk = exp(-pow((r - radius * 2.2) / (radius * 0.75), 2.0)) * (0.55 + 0.45 * swirl);
  half3 col = bg.rgb;
  if (ink > 0.5) {
    float spiral = step(0.62, fract((a * 1.6 + log(max(r, 1.0)) * 3.0 - time * 0.4) / 3.14159));
    col = mix(col, inkCol, spiral * disk * 0.55 + ring * 0.7);
    col = mix(col, inkCol, horizon);
  } else {
    half3 diskCol = mix(half3(1.0, 0.45, 0.2), half3(1.0, 0.88, 0.62), swirl);
    col += diskCol * disk * 0.85 + half3(1.0, 0.86, 0.62) * ring * 0.9;
    col = mix(col, half3(0.0), horizon);
  }
  return half4(mix(bg.rgb, col, fade), 1.0);
}
`,
);

/** A repulsor: pale core with ripples travelling outward. */
export const repulsorShader = compile(
  'repulsor',
  `
uniform float2 center;
uniform float radius;
uniform float time;
uniform half3 tint;
uniform float ink;
half4 main(float2 p) {
  float r = length(p - center) / radius;
  if (r > 3.2) return half4(0);
  float core = smoothstep(1.0, 0.9, r);
  float ripple = max(0.0, sin(r * 5.0 - time * 5.0)) * smoothstep(3.2, 1.0, r) * step(1.0, r);
  if (ink > 0.5) {
    float ringLine = smoothstep(0.12, 0.0, abs(fract(r * 2.0 - time * 0.8) - 0.5) - 0.38) * step(1.05, r) * smoothstep(3.2, 1.5, r);
    float a = max(core * 0.15, ringLine * 0.6);
    float outline = smoothstep(0.06, 0.0, abs(r - 0.97));
    a = max(a, outline);
    return half4(tint * a, a);
  }
  half3 col = mix(tint, half3(1.0), smoothstep(0.9, 0.0, r));
  float a = core + ripple * 0.35;
  return half4(col * a, a);
}
`,
);
