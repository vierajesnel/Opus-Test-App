/**
 * Draws Starwake's app icons and splash with CanvasKit (the same Skia that
 * renders the game), so even the icon is code: a comet arcing around the
 * Lamplighter on a midnight nebula.
 *
 *   npm run icons:build
 */
import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit.js');

type CK = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Canvas = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const OUT = path.resolve(__dirname, '../assets');
/** Web icons (home-screen install) are served from public/. */
const WEB = path.resolve(__dirname, '../public');
const BG = '#070812';

interface Options {
  size: number;
  background: boolean;
  /** Fraction of the canvas the motif may use (adaptive icons need a safe zone). */
  scale: number;
  mono?: boolean;
}

function drawBackground(ck: CK, canvas: Canvas, size: number) {
  const paint = new ck.Paint();
  paint.setShader(
    ck.Shader.MakeRadialGradient(
      [size * 0.42, size * 0.4],
      size * 0.75,
      [ck.parseColorString('#2A1F5C'), ck.parseColorString('#0E1030'), ck.parseColorString(BG)],
      [0, 0.45, 1],
      ck.TileMode.Clamp,
    ),
  );
  canvas.drawRect(ck.XYWHRect(0, 0, size, size), paint);
  // A deterministic dusting of stars.
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const star = new ck.Paint();
  star.setAntiAlias(true);
  for (let i = 0; i < 90; i++) {
    star.setColor(ck.Color4f(0.85, 0.88, 1, 0.25 + rand() * 0.6));
    canvas.drawCircle(rand() * size, rand() * size, size * (0.0012 + rand() * 0.0025), star);
  }
}

function fourPoint(ck: CK, cx: number, cy: number, len: number, width: number, angle: number) {
  const builder = new ck.PathBuilder();
  for (let k = 0; k < 4; k++) {
    const a = angle + (k * Math.PI) / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    if (k === 0) builder.moveTo(cx + ca * len, cy + sa * len);
    else builder.lineTo(cx + ca * len, cy + sa * len);
    const b = a + Math.PI / 4;
    builder.lineTo(cx + Math.cos(b) * width, cy + Math.sin(b) * width);
  }
  builder.close();
  return builder.detachAndDelete();
}

function drawMotif(ck: CK, canvas: Canvas, o: Options) {
  const s = o.size * o.scale;
  const cx = o.size * 0.5;
  const cy = o.size * 0.5;
  const white = (a: number) => ck.Color4f(1, 1, 1, a);
  const gold = (a: number) => (o.mono ? white(a) : ck.Color4f(1, 0.88, 0.6, a));
  const ember = (a: number) => (o.mono ? white(a) : ck.Color4f(1, 0.62, 0.32, a));

  // Orbit ellipse, tilted.
  const tilt = -0.42;
  const ra = s * 0.4;
  const rb = s * 0.17;
  const at = (u: number): [number, number] => {
    const ex = Math.cos(u) * ra;
    const ey = Math.sin(u) * rb;
    return [
      cx + ex * Math.cos(tilt) - ey * Math.sin(tilt),
      cy + ex * Math.sin(tilt) + ey * Math.cos(tilt),
    ];
  };
  const ring = new ck.Paint();
  ring.setAntiAlias(true);
  ring.setStyle(ck.PaintStyle.Stroke);
  ring.setStrokeWidth(s * 0.008);
  ring.setColor(o.mono ? white(0.5) : ck.Color4f(0.75, 0.78, 1, 0.28));
  const orbit = new ck.PathBuilder();
  for (let i = 0; i <= 120; i++) {
    const [x, y] = at((i / 120) * Math.PI * 2);
    if (i === 0) orbit.moveTo(x, y);
    else orbit.lineTo(x, y);
  }
  canvas.drawPath(orbit.detachAndDelete(), ring);

  // The Lamplighter: glow, rays, core.
  if (!o.mono) {
    const glow = new ck.Paint();
    glow.setAntiAlias(true);
    glow.setMaskFilter(ck.MaskFilter.MakeBlur(ck.BlurStyle.Normal, s * 0.06, true));
    glow.setColor(gold(0.55));
    canvas.drawCircle(cx, cy, s * 0.11, glow);
  }
  const core = new ck.Paint();
  core.setAntiAlias(true);
  core.setColor(gold(1));
  canvas.drawPath(fourPoint(ck, cx, cy, s * 0.2, s * 0.035, -Math.PI / 2), core);
  canvas.drawPath(fourPoint(ck, cx, cy, s * 0.09, s * 0.02, -Math.PI / 4), core);
  core.setColor(o.mono ? white(1) : ck.Color4f(1, 0.98, 0.92, 1));
  canvas.drawCircle(cx, cy, s * 0.03, core);

  // Comet: a tapered trail along the orbit, then a bright head.
  const head = 0.35;
  const trail = new ck.Paint();
  trail.setAntiAlias(true);
  trail.setStyle(ck.PaintStyle.Stroke);
  trail.setStrokeCap(ck.StrokeCap.Round);
  const segments = 40;
  for (let i = segments; i >= 1; i--) {
    const u0 = head - (i / segments) * 1.9;
    const u1 = head - ((i - 1) / segments) * 1.9;
    const t = 1 - i / segments;
    const [x0, y0] = at(u0);
    const [x1, y1] = at(u1);
    trail.setStrokeWidth(s * (0.006 + t * t * 0.05));
    trail.setColor(ember(0.08 + t * t * 0.9));
    canvas.drawLine(x0, y0, x1, y1, trail);
  }
  const [hx, hy] = at(head);
  if (!o.mono) {
    const halo = new ck.Paint();
    halo.setAntiAlias(true);
    halo.setMaskFilter(ck.MaskFilter.MakeBlur(ck.BlurStyle.Normal, s * 0.03, true));
    halo.setColor(ember(0.9));
    canvas.drawCircle(hx, hy, s * 0.05, halo);
  }
  const headPaint = new ck.Paint();
  headPaint.setAntiAlias(true);
  headPaint.setColor(o.mono ? white(1) : ck.Color4f(1, 0.95, 0.85, 1));
  canvas.drawCircle(hx, hy, s * 0.032, headPaint);
}

function render(ck: CK, file: string, o: Options, dir = OUT) {
  const surface = ck.MakeSurface(o.size, o.size);
  if (!surface) throw new Error('Could not create a CanvasKit surface');
  const canvas = surface.getCanvas();
  canvas.clear(o.background ? ck.parseColorString(BG) : ck.TRANSPARENT);
  if (o.background) drawBackground(ck, canvas, o.size);
  drawMotif(ck, canvas, o);
  const bytes = surface.makeImageSnapshot().encodeToBytes();
  fs.writeFileSync(path.join(dir, file), Buffer.from(bytes));
  surface.delete();
  console.log(`  ${path.relative(process.cwd(), path.join(dir, file))} (${o.size}×${o.size})`);
}

function renderBackgroundOnly(ck: CK, file: string, size: number) {
  const surface = ck.MakeSurface(size, size);
  const canvas = surface.getCanvas();
  drawBackground(ck, canvas, size);
  fs.writeFileSync(path.join(OUT, file), Buffer.from(surface.makeImageSnapshot().encodeToBytes()));
  surface.delete();
  console.log(`  assets/${file} (${size}×${size})`);
}

async function main() {
  const ck: CK = await CanvasKitInit({
    locateFile: (f: string) =>
      path.resolve(__dirname, '../node_modules/canvaskit-wasm/bin/full', f),
  });
  fs.mkdirSync(OUT, { recursive: true });
  console.log('Drawing icons:');
  render(ck, 'icon.png', { size: 1024, background: true, scale: 0.92 });
  render(ck, 'android-icon-foreground.png', { size: 1024, background: false, scale: 0.62 });
  renderBackgroundOnly(ck, 'android-icon-background.png', 1024);
  render(ck, 'android-icon-monochrome.png', {
    size: 1024,
    background: false,
    scale: 0.62,
    mono: true,
  });
  render(ck, 'splash-icon.png', { size: 1024, background: false, scale: 0.9 });
  render(ck, 'favicon.png', { size: 64, background: true, scale: 1.05 });
  fs.mkdirSync(WEB, { recursive: true });
  render(ck, 'apple-touch-icon.png', { size: 180, background: true, scale: 0.92 }, WEB);
  render(ck, 'icon-192.png', { size: 192, background: true, scale: 0.92 }, WEB);
  render(ck, 'icon-512.png', { size: 512, background: true, scale: 0.92 }, WEB);
  render(ck, 'icon-maskable-512.png', { size: 512, background: true, scale: 0.62 }, WEB);
}

void main();
