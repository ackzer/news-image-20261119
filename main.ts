import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const WIDTH = 1024;
const HEIGHT = 1024;

const canvas = new Uint8Array(WIDTH * HEIGHT * 3);

// Deterministic PRNG (xorshift32) - fixed seed for reproducibility
let rngState = 0x12345678;
function rand(): number {
  rngState ^= rngState << 13;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5;
  return (rngState >>> 0) / 0x100000000;
}
function randInt(max: number): number {
  return Math.floor(rand() * max);
}

function idx(x: number, y: number): number {
  return (y * WIDTH + x) * 3;
}

function setPixel(x: number, y: number, r: number, g: number, b: number): void {
  if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
    const i = idx(x, y);
    canvas[i] = r;
    canvas[i + 1] = g;
    canvas[i + 2] = b;
  }
}

function blendPixel(x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT || a === 0) return;
  if (a >= 255) { setPixel(x, y, r, g, b); return; }
  const i = idx(x, y);
  const ia = 255 - a;
  canvas[i] = (canvas[i] * ia + r * a) >> 8;
  canvas[i + 1] = (canvas[i + 1] * ia + g * a) >> 8;
  canvas[i + 2] = (canvas[i + 2] * ia + b * a) >> 8;
}

function fillRect(x: number, y: number, w: number, h: number, r: number, g: number, b: number): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(WIDTH, x + w);
  const y1 = Math.min(HEIGHT, y + h);
  for (let yy = y0; yy < y1; yy++) {
    const base = yy * WIDTH * 3 + x0 * 3;
    for (let xx = x0; xx < x1; xx++) {
      canvas[base + (xx - x0) * 3] = r;
      canvas[base + (xx - x0) * 3 + 1] = g;
      canvas[base + (xx - x0) * 3 + 2] = b;
    }
  }
}

// ============================================================
// VECTOR-STROKE FONT SYSTEM
// ============================================================

// Glyph definitions as stroke polylines
// Each glyph: array of strokes, each stroke = array of [x, y] points in 1000x1000 em square
// Origin at baseline left, x advances right, y goes up (typographic coordinates)
interface Glyph {
  strokes: number[][][];
  advance: number;
}

// Helper to create common stroke patterns
const GLYPHS: Record<string, Glyph> = {};

// Basic stroke helpers
function stroke(...points: number[]): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < points.length; i += 2) {
    result.push([points[i], points[i + 1]]);
  }
  return result;
}

// Define glyphs (simplified but readable vector font)
GLYPHS[' '] = { strokes: [], advance: 270 };
GLYPHS['!'] = { strokes: [stroke(500, 700, 500, 100), stroke(500, 0, 500, -50)], advance: 270 };
GLYPHS['"'] = { strokes: [stroke(350, 750, 350, 600), stroke(650, 750, 650, 600)], advance: 500 };
GLYPHS['#'] = { strokes: [stroke(200, 0, 200, 800), stroke(800, 0, 800, 800), stroke(100, 300, 900, 300), stroke(100, 550, 900, 550)], advance: 600 };
GLYPHS['$'] = { strokes: [stroke(500, 800, 500, -50), stroke(150, 700, 850, 700), stroke(850, 600, 150, 300), stroke(150, 200, 850, 200)], advance: 600 };
GLYPHS['%'] = { strokes: [stroke(100, 750, 900, -50), stroke(150, 700, 150, 800), stroke(850, 200, 850, 100)], advance: 600 };
GLYPHS['&'] = { strokes: [stroke(500, 700, 300, 800, 200, 600, 300, 400, 500, 300, 700, 400, 750, 550, 700, 650, 500, 600, 300, 600, 200, 450, 250, 300, 350, 200, 400, 100)], advance: 600 };
GLYPHS["'"] = { strokes: [stroke(500, 750, 450, 700, 400, 800)], advance: 270 };
GLYPHS['('] = { strokes: [stroke(300, 700, 200, 550, 200, 250, 300, 100)], advance: 350 };
GLYPHS[')'] = { strokes: [stroke(700, 700, 800, 550, 800, 250, 700, 100)], advance: 350 };
GLYPHS['*'] = { strokes: [stroke(500, 300, 500, 600), stroke(300, 500, 700, 400), stroke(300, 400, 700, 500)], advance: 500 };
GLYPHS['+'] = { strokes: [stroke(300, 450, 700, 450), stroke(500, 250, 500, 650)], advance: 550 };
GLYPHS[','] = { strokes: [stroke(450, 100, 400, 0, 350, 50)], advance: 270 };
GLYPHS['-'] = { strokes: [stroke(200, 450, 800, 450)], advance: 550 };
GLYPHS['.'] = { strokes: [stroke(500, 50, 500, 0)], advance: 270 };
GLYPHS['/'] = { strokes: [stroke(100, 700, 900, 100)], advance: 550 };
GLYPHS['0'] = { strokes: [stroke(500, 750, 200, 750, 100, 550, 100, 250, 200, 50, 500, 50, 800, 50, 900, 250, 900, 550, 800, 750, 500, 750)], advance: 600 };
GLYPHS['1'] = { strokes: [stroke(500, 750, 300, 750), stroke(300, 750, 300, 50), stroke(300, 50, 700, 50)], advance: 550 };
GLYPHS['2'] = { strokes: [stroke(150, 700, 850, 700, 850, 550, 600, 450, 400, 400, 200, 400, 150, 550, 150, 250, 850, 250)], advance: 600 };
GLYPHS['3'] = { strokes: [stroke(150, 700, 850, 700, 850, 550, 500, 550, 850, 550, 850, 300, 500, 300, 150, 300, 150, 50, 850, 50)], advance: 600 };
GLYPHS['4'] = { strokes: [stroke(150, 600, 150, 300, 850, 300), stroke(600, 700, 600, 0)], advance: 600 };
GLYPHS['5'] = { strokes: [stroke(850, 700, 150, 700, 150, 450, 800, 450, 850, 300, 150, 300, 150, 50, 850, 50)], advance: 600 };
GLYPHS['6'] = { strokes: [stroke(850, 650, 150, 650, 150, 350, 750, 350, 850, 450, 850, 600, 800, 600, 700, 550, 500, 550, 300, 550, 200, 450, 150, 300, 150, 250, 200, 50, 400, 50, 650)], advance: 600 };
GLYPHS['7'] = { strokes: [stroke(150, 750, 850, 750), stroke(750, 750, 200, 100)], advance: 600 };
GLYPHS['8'] = { strokes: [stroke(500, 700, 200, 700, 100, 500, 100, 300, 200, 100, 500, 100, 800, 100, 900, 300, 900, 500, 800, 700, 500, 700), stroke(500, 450, 200, 450, 100, 300, 100, 100, 200, -50, 500, -50, 800, -50, 900, 100, 900, 300, 800, 450, 500, 450)], advance: 600 };
GLYPHS['9'] = { strokes: [stroke(150, 100, 150, 250, 500, 250, 850, 250, 850, 450, 500, 450, 150, 450, 150, 650, 500, 650, 850, 650, 850, 500, 500, 400, 200, 400, 150, 250)], advance: 600 };
GLYPHS[':'] = { strokes: [stroke(500, 450, 500, 400), stroke(500, 150, 500, 100)], advance: 270 };
GLYPHS[';'] = { strokes: [stroke(450, 100, 400, 0, 350, 50), stroke(500, 450, 500, 400)], advance: 270 };
GLYPHS['<'] = { strokes: [stroke(700, 550, 300, 350, 700, 150)], advance: 550 };
GLYPHS['='] = { strokes: [stroke(150, 550, 850, 550), stroke(150, 350, 850, 350)], advance: 550 };
GLYPHS['>'] = { strokes: [stroke(300, 550, 700, 350, 300, 150)], advance: 550 };
GLYPHS['?'] = { strokes: [stroke(300, 600, 300, 400, 450, 300, 650, 300, 700, 400, 700, 550, 550, 600, 550, 650), stroke(500, 100, 500, 50)], advance: 550 };
GLYPHS['@'] = { strokes: [stroke(500, 200, 500, -50, 800, -50, 900, 150, 900, 450, 800, 650, 500, 650, 200, 650, 100, 450, 100, 150, 200, 50, 300, 50, 450, 200, 500, 200)], advance: 650 };
GLYPHS['A'] = { strokes: [stroke(150, 0, 500, 750, 850, 0), stroke(350, 350, 650, 350)], advance: 650 };
GLYPHS['B'] = { strokes: [stroke(150, 750, 150, 0, 650, 0, 800, 150, 800, 350, 650, 500, 150, 500), stroke(650, 500, 800, 650, 800, 750, 650, 750, 150, 750)], advance: 650 };
GLYPHS['C'] = { strokes: [stroke(800, 650, 500, 750, 200, 650, 100, 450, 100, 250, 200, 50, 500, -50, 800, 50, 900, 250, 900, 450, 800, 650)], advance: 650 };
GLYPHS['D'] = { strokes: [stroke(150, 750, 150, 0, 700, 0, 850, 150, 850, 600, 700, 750, 150, 750)], advance: 650 };
GLYPHS['E'] = { strokes: [stroke(150, 750, 850, 750), stroke(150, 750, 150, 0), stroke(150, 375, 700, 375), stroke(150, 0, 850, 0)], advance: 600 };
GLYPHS['F'] = { strokes: [stroke(150, 750, 850, 750), stroke(150, 750, 150, 0), stroke(150, 375, 700, 375)], advance: 600 };
GLYPHS['G'] = { strokes: [stroke(800, 650, 500, 750, 200, 650, 100, 450, 100, 250, 200, 50, 500, -50, 800, 50, 900, 250, 900, 450, 800, 650), stroke(500, 350, 800, 350), stroke(800, 350, 800, 200)], advance: 650 };
GLYPHS['H'] = { strokes: [stroke(150, 750, 150, 0), stroke(850, 750, 850, 0), stroke(150, 375, 850, 375)], advance: 650 };
GLYPHS['I'] = { strokes: [stroke(500, 750, 500, 0), stroke(150, 750, 850, 750), stroke(150, 0, 850, 0)], advance: 350 };
GLYPHS['J'] = { strokes: [stroke(850, 750, 850, 250, 700, 100, 500, 50, 300, 100, 150, 250, 150, 750)], advance: 600 };
GLYPHS['K'] = { strokes: [stroke(150, 750, 150, 0), stroke(150, 375, 850, 650), stroke(150, 375, 850, 100)], advance: 650 };
GLYPHS['L'] = { strokes: [stroke(150, 750, 150, 0, 850, 0)], advance: 550 };
GLYPHS['M'] = { strokes: [stroke(150, 0, 150, 750, 500, 200, 850, 750, 850, 0)], advance: 700 };
GLYPHS['N'] = { strokes: [stroke(150, 0, 150, 750, 850, 0, 850, 750)], advance: 650 };
GLYPHS['O'] = { strokes: [stroke(500, 750, 200, 750, 100, 550, 100, 250, 200, 50, 500, 50, 800, 50, 900, 250, 900, 550, 800, 750, 500, 750)], advance: 650 };
GLYPHS['P'] = { strokes: [stroke(150, 750, 150, 0, 750, 0, 850, 150, 850, 350, 750, 500, 150, 500)], advance: 550 };
GLYPHS['Q'] = { strokes: [stroke(500, 750, 200, 750, 100, 550, 100, 250, 200, 50, 500, 50, 800, 50, 900, 250, 900, 550, 800, 750, 500, 750), stroke(650, 350, 850, 150)], advance: 650 };
GLYPHS['R'] = { strokes: [stroke(150, 750, 150, 0, 750, 0, 850, 150, 850, 350, 750, 500, 150, 500), stroke(500, 500, 850, 250)], advance: 650 };
GLYPHS['S'] = { strokes: [stroke(800, 650, 500, 750, 200, 650, 100, 450, 100, 250, 200, 50, 500, -50, 800, 50, 900, 250, 900, 450, 800, 650)], advance: 600 };
GLYPHS['T'] = { strokes: [stroke(150, 750, 850, 750), stroke(500, 750, 500, 0)], advance: 550 };
GLYPHS['U'] = { strokes: [stroke(150, 750, 150, 200, 250, 50, 500, 50, 750, 50, 850, 200, 850, 750)], advance: 650 };
GLYPHS['V'] = { strokes: [stroke(150, 750, 500, 0, 850, 750)], advance: 650 };
GLYPHS['W'] = { strokes: [stroke(150, 750, 300, 0, 500, 500, 700, 0, 850, 750)], advance: 700 };
GLYPHS['X'] = { strokes: [stroke(150, 750, 850, 0), stroke(150, 0, 850, 750)], advance: 600 };
GLYPHS['Y'] = { strokes: [stroke(150, 750, 500, 400), stroke(850, 750, 500, 400), stroke(500, 400, 500, 0)], advance: 600 };
GLYPHS['Z'] = { strokes: [stroke(150, 750, 850, 750), stroke(850, 750, 150, 0), stroke(150, 0, 850, 0)], advance: 600 };
GLYPHS['['] = { strokes: [stroke(250, 750, 250, 0), stroke(250, 750, 450, 750), stroke(250, 0, 450, 0)], advance: 350 };
GLYPHS['\\'] = { strokes: [stroke(150, 750, 850, 0)], advance: 550 };
GLYPHS[']'] = { strokes: [stroke(750, 750, 750, 0), stroke(550, 750, 750, 750), stroke(550, 0, 750, 0)], advance: 350 };
GLYPHS['^'] = { strokes: [stroke(200, 400, 500, 700, 800, 400)], advance: 550 };
GLYPHS['_'] = { strokes: [stroke(150, -100, 850, -100)], advance: 550 };
GLYPHS['`'] = { strokes: [stroke(500, 750, 400, 600, 300, 750)], advance: 270 };

// Lowercase
GLYPHS['a'] = { strokes: [stroke(500, 100, 200, 100, 100, 300, 100, 500, 200, 700, 500, 700, 800, 500, 800, 300, 500, 100), stroke(500, 100, 500, 700)], advance: 550 };
GLYPHS['b'] = { strokes: [stroke(150, 700, 150, 0, 500, 0, 700, 150, 700, 400, 500, 550, 150, 550)], advance: 550 };
GLYPHS['c'] = { strokes: [stroke(800, 450, 500, 550, 200, 450, 100, 250, 100, 50, 200, -50, 500, -50, 800, 50, 900, 250, 900, 450)], advance: 550 };
GLYPHS['d'] = { strokes: [stroke(850, 700, 850, 0, 500, 0, 300, 150, 300, 400, 500, 550, 850, 550, 850, 300)], advance: 550 };
GLYPHS['e'] = { strokes: [stroke(800, 350, 500, 350, 200, 350, 100, 250, 100, 50, 200, -50, 500, -50, 800, 50, 900, 250, 900, 450, 800, 350)], advance: 550 };
GLYPHS['f'] = { strokes: [stroke(300, 700, 300, 50, 150, 50, 300, -50, 700, -50, 700, 50, 300, 50), stroke(150, 350, 550, 350)], advance: 300 };
GLYPHS['g'] = { strokes: [stroke(500, 450, 200, 450, 100, 250, 100, -50, 200, -250, 500, -250, 800, -50, 900, 250, 900, 450, 800, 450, 500, 450, 500, -150)], advance: 550 };
GLYPHS['h'] = { strokes: [stroke(150, 700, 150, 0, 500, 0, 500, 400, 700, 550, 700, 0)], advance: 550 };
GLYPHS['i'] = { strokes: [stroke(250, 650, 250, 450), stroke(250, 350, 250, 0)], advance: 270 };
GLYPHS['j'] = { strokes: [stroke(750, 650, 750, 450), stroke(750, 350, 750, -250, 600, -350, 400, -350, 250, -250)], advance: 270 };
GLYPHS['k'] = { strokes: [stroke(150, 700, 150, 0), stroke(150, 350, 700, 600), stroke(150, 350, 700, 100)], advance: 550 };
GLYPHS['l'] = { strokes: [stroke(250, 700, 250, 0)], advance: 270 };
GLYPHS['m'] = { strokes: [stroke(150, 0, 150, 550, 350, 550, 350, 350, 550, 550, 550, 350, 750, 550, 750, 0)], advance: 650 };
GLYPHS['n'] = { strokes: [stroke(150, 0, 150, 550, 350, 550, 350, 350, 550, 550, 550, 0)], advance: 550 };
GLYPHS['o'] = { strokes: [stroke(500, 450, 200, 450, 100, 250, 100, 50, 200, -50, 500, -50, 800, -50, 900, 50, 900, 250, 800, 450, 500, 450)], advance: 550 };
GLYPHS['p'] = { strokes: [stroke(150, 550, 150, -250, 500, -250, 700, -100, 700, 150, 500, 300, 150, 300)], advance: 550 };
GLYPHS['q'] = { strokes: [stroke(850, 550, 850, -250, 500, -250, 300, -100, 300, 150, 500, 300, 850, 300, 850, 50)], advance: 550 };
GLYPHS['r'] = { strokes: [stroke(150, 550, 150, 0, 450, 0, 600, 150, 600, 400, 450, 550)], advance: 550 };
GLYPHS['s'] = { strokes: [stroke(800, 450, 500, 450, 200, 450, 100, 250, 100, 50, 200, -50, 500, -50, 800, -50, 900, 250, 900, 450)], advance: 550 };
GLYPHS['t'] = { strokes: [stroke(150, 650, 500, 650, 500, 450, 300, 450, 300, 0, 500, 0, 700, 0, 700, -50, 150, -50)], advance: 350 };
GLYPHS['u'] = { strokes: [stroke(150, 550, 150, 200, 250, 50, 500, 50, 750, 50, 850, 200, 850, 550)], advance: 550 };
GLYPHS['v'] = { strokes: [stroke(150, 550, 500, -50, 850, 550)], advance: 550 };
GLYPHS['w'] = { strokes: [stroke(150, 550, 300, -50, 500, 350, 700, -50, 850, 550)], advance: 700 };
GLYPHS['x'] = { strokes: [stroke(150, 550, 850, -50), stroke(150, -50, 850, 550)], advance: 550 };
GLYPHS['y'] = { strokes: [stroke(150, 550, 500, 150, 850, 550, 850, -250, 500, -150, 300, -150, 200, -250)], advance: 550 };
GLYPHS['z'] = { strokes: [stroke(150, 550, 850, 550), stroke(850, 550, 150, -50), stroke(150, -50, 850, -50)], advance: 550 };
GLYPHS['{'] = { strokes: [stroke(350, 750, 250, 550, 250, 350, 350, 250, 250, 150, 250, -50, 350, -150)], advance: 400 };
GLYPHS['|'] = { strokes: [stroke(500, 750, 500, 0)], advance: 270 };
GLYPHS['}'] = { strokes: [stroke(650, 750, 750, 550, 750, 350, 650, 250, 750, 150, 750, -50, 650, -150)], advance: 400 };
GLYPHS['~'] = { strokes: [stroke(200, 300, 400, 500, 600, 300, 800, 500)], advance: 550 };

// Build glyph lookup for codes 32-126
const GLYPH_DATA: Glyph[] = [];
for (let code = 32; code <= 126; code++) {
  const ch = String.fromCharCode(code);
  const glyph = GLYPHS[ch];
  if (glyph) {
    GLYPH_DATA.push(glyph);
  } else {
    // Fallback: box
    GLYPH_DATA.push({
      strokes: [stroke(150, 750, 850, 750, 850, 0, 150, 0, 150, 750)],
      advance: 600
    });
  }
}

// Supersampling factor for anti-aliasing
const SS = 4; // 4x supersampling

// Draw a line segment with round caps, supersampled
function drawStrokeSegment(x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, thickness: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;

  const steps = Math.ceil(len * SS);
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const halfThick = thickness / 2;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = x0 + dx * t;
    const cy = y0 + dy * t;

    // Round cap at start
    if (i === 0) {
      for (let si = -SS; si <= SS; si++) {
        for (let sj = -SS; sj <= SS; sj++) {
          const px = cx + nx * halfThick + si / SS;
          const py = cy + ny * halfThick + sj / SS;
          const dist = Math.sqrt((px - cx - nx * halfThick) ** 2 + (py - cy - ny * halfThick) ** 2);
          if (dist <= halfThick) {
            const ix = Math.floor(px);
            const iy = Math.floor(py);
            const fx = px - ix;
            const fy = py - iy;
            const a = (1 - fx) * (1 - fy) * 255;
            blendPixel(ix, iy, r, g, b, Math.round(a));
            blendPixel(ix + 1, iy, r, g, b, Math.round(fx * (1 - fy) * 255));
            blendPixel(ix, iy + 1, r, g, b, Math.round((1 - fx) * fy * 255));
            blendPixel(ix + 1, iy + 1, r, g, b, Math.round(fx * fy * 255));
          }
        }
      }
    }

    // Round cap at end
    if (i === steps) {
      for (let si = -SS; si <= SS; si++) {
        for (let sj = -SS; sj <= SS; sj++) {
          const px = cx + nx * halfThick + si / SS;
          const py = cy + ny * halfThick + sj / SS;
          const dist = Math.sqrt((px - cx - nx * halfThick) ** 2 + (py - cy - ny * halfThick) ** 2);
          if (dist <= halfThick) {
            const ix = Math.floor(px);
            const iy = Math.floor(py);
            const fx = px - ix;
            const fy = py - iy;
            const a = (1 - fx) * (1 - fy) * 255;
            blendPixel(ix, iy, r, g, b, Math.round(a));
            blendPixel(ix + 1, iy, r, g, b, Math.round(fx * (1 - fy) * 255));
            blendPixel(ix, iy + 1, r, g, b, Math.round((1 - fx) * fy * 255));
            blendPixel(ix + 1, iy + 1, r, g, b, Math.round(fx * fy * 255));
          }
        }
      }
    }

    // Main stroke body (supersampled)
    for (let si = -SS; si <= SS; si++) {
      for (let sj = -SS; sj <= SS; sj++) {
        const px = cx + nx * halfThick * (si / SS);
        const py = cy + ny * halfThick * (sj / SS);
        // Distance from center line
        const proj = (px - cx) * ux + (py - cy) * uy;
        const perp = Math.abs((px - cx) * nx + (py - cy) * ny);
        if (perp <= halfThick && proj >= -halfThick && proj <= len + halfThick) {
          const ix = Math.floor(px);
          const iy = Math.floor(py);
          const fx = px - ix;
          const fy = py - iy;
          const a = (1 - fx) * (1 - fy) * 255;
          blendPixel(ix, iy, r, g, b, Math.round(a));
          blendPixel(ix + 1, iy, r, g, b, Math.round(fx * (1 - fy) * 255));
          blendPixel(ix, iy + 1, r, g, b, Math.round((1 - fx) * fy * 255));
          blendPixel(ix + 1, iy + 1, r, g, b, Math.round(fx * fy * 255));
        }
      }
    }
  }
}

// Draw a glyph at position with scale
function drawGlyph(glyph: Glyph, x: number, y: number, scale: number, r: number, g: number, b: number, bold = false): number {
  const thickness = bold ? 35 * scale : 25 * scale;

  for (const strokePts of glyph.strokes) {
    for (let i = 0; i < strokePts.length - 1; i++) {
      const [sx0, sy0] = strokePts[i];
      const [sx1, sy1] = strokePts[i + 1];
      // Convert from 1000x1000 em space to pixels
      // Baseline at y, x at left bearing
      const px0 = x + sx0 * scale / 1000;
      const py0 = y - sy0 * scale / 1000; // Flip Y (typographic Y up, canvas Y down)
      const px1 = x + sx1 * scale / 1000;
      const py1 = y - sy1 * scale / 1000;
      drawStrokeSegment(px0, py0, px1, py1, r, g, b, thickness);
    }
  }

  return Math.round(glyph.advance * scale / 1000);
}

function drawChar(ch: string, x: number, y: number, scale: number, r: number, g: number, b: number, bold = false): number {
  const code = ch.charCodeAt(0);
  if (code < 32 || code > 126) return Math.round(270 * scale / 1000);
  const glyph = GLYPH_DATA[code - 32];
  return drawGlyph(glyph, x, y, scale, r, g, b, bold);
}

// ============================================================
// TEXT LAYOUT FUNCTIONS (using vector font)
// ============================================================

function measureText(text: string, scale: number, bold = false): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = ch.charCodeAt(0);
    if (code >= 32 && code <= 126) {
      const glyph = GLYPH_DATA[code - 32];
      w += glyph.advance * scale / 1000;
    } else {
      w += 270 * scale / 1000;
    }
  }
  return Math.round(w);
}

function drawTextSingleLine(text: string, x: number, y: number, scale: number, r: number, g: number, b: number, bold = false): number {
  let cursorX = x;
  for (const ch of text) {
    cursorX += drawChar(ch, cursorX, y, scale, r, g, b, bold);
  }
  return cursorX - x;
}

function drawTextCentered(text: string, cx: number, y: number, scale: number, r: number, g: number, b: number, bold = false): void {
  const w = measureText(text, scale, bold);
  drawTextSingleLine(text, cx - w / 2, y, scale, r, g, b, bold);
}

function wrapText(text: string, maxWidth: number, scale: number, bold = false): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current + (current ? ' ' : '') + word;
    if (measureText(test, scale, bold) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawWrappedText(text: string, x: number, y: number, maxWidth: number, scale: number, r: number, g: number, b: number, bold = false, lineGap = 1.25): number {
  const lines = wrapText(text, maxWidth, scale, bold);
  const lineHeight = Math.round(800 * scale / 1000 * lineGap); // 800 is nominal cap height in em
  for (let i = 0; i < lines.length; i++) {
    drawTextSingleLine(lines[i], x, y + i * lineHeight, scale, r, g, b, bold);
  }
  return lines.length * lineHeight;
}

// ============================================================
// SHAPE DRAWING FUNCTIONS
// ============================================================

function drawLine(x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, thick = 1): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = (dx > dy ? dx : -dy) / 2;
  while (true) {
    for (let tx = -thick + 1; tx < thick; tx++) {
      for (let ty = -thick + 1; ty < thick; ty++) {
        setPixel(x0 + tx, y0 + ty, r, g, b);
      }
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = err;
    if (e2 > -dx) { err -= dy; x0 += sx; }
    if (e2 < dy) { err += dx; y0 += sy; }
  }
}

function drawAALine(x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, thick = 1): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;
  const steps = Math.ceil(len);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const a00 = (1 - fx) * (1 - fy);
    const a01 = (1 - fx) * fy;
    const a10 = fx * (1 - fy);
    const a11 = fx * fy;
    for (let tx = -thick + 1; tx < thick; tx++) {
      for (let ty = -thick + 1; ty < thick; ty++) {
        blendPixel(ix + tx, iy + ty, r, g, b, Math.round(a00 * 255));
        blendPixel(ix + 1 + tx, iy + ty, r, g, b, Math.round(a10 * 255));
        blendPixel(ix + tx, iy + 1 + ty, r, g, b, Math.round(a01 * 255));
        blendPixel(ix + 1 + tx, iy + 1 + ty, r, g, b, Math.round(a11 * 255));
      }
    }
  }
}

function drawCircle(cx: number, cy: number, radius: number, r: number, g: number, b: number, fill = false): void {
  const x0 = Math.max(0, cx - radius);
  const y0 = Math.max(0, cy - radius);
  const x1 = Math.min(WIDTH - 1, cx + radius);
  const y1 = Math.min(HEIGHT - 1, cy + radius);
  const r2 = radius * radius;
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    const dxMax = Math.floor(Math.sqrt(Math.max(0, r2 - dy * dy)));
    if (fill) {
      const xl = Math.max(0, cx - dxMax);
      const xr = Math.min(WIDTH - 1, cx + dxMax);
      const base = y * WIDTH * 3 + xl * 3;
      for (let x = xl; x <= xr; x++) {
        canvas[base + (x - xl) * 3] = r;
        canvas[base + (x - xl) * 3 + 1] = g;
        canvas[base + (x - xl) * 3 + 2] = b;
      }
    } else {
      const xl = cx - dxMax;
      const xr = cx + dxMax;
      if (xl >= 0 && xl < WIDTH) setPixel(xl, y, r, g, b);
      if (xr >= 0 && xr < WIDTH) setPixel(xr, y, r, g, b);
    }
  }
  for (let x = x0; x <= x1; x++) {
    const dx = x - cx;
    const dyMax = Math.floor(Math.sqrt(Math.max(0, r2 - dx * dx)));
    if (!fill) {
      const yt = cy - dyMax;
      const yb = cy + dyMax;
      if (yt >= 0 && yt < HEIGHT) setPixel(x, yt, r, g, b);
      if (yb >= 0 && yb < HEIGHT) setPixel(x, yb, r, g, b);
    }
  }
}

function drawPolygon(points: [number, number][], r: number, g: number, b: number, fill = false): void {
  if (fill && points.length >= 3) {
    const minY = Math.max(0, Math.min(...points.map(p => p[1])));
    const maxY = Math.min(HEIGHT - 1, Math.max(...points.map(p => p[1])));
    for (let y = minY; y <= maxY; y++) {
      const intersections: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          const x = x1 + (y - y1) * (x2 - x1) / (y2 - y1);
          intersections.push(x);
        }
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i < intersections.length; i += 2) {
        const xl = Math.max(0, Math.ceil(intersections[i]));
        const xr = Math.min(WIDTH - 1, Math.floor(intersections[i + 1]));
        const base = y * WIDTH * 3 + xl * 3;
        for (let x = xl; x <= xr; x++) {
          canvas[base + (x - xl) * 3] = r;
          canvas[base + (x - xl) * 3 + 1] = g;
          canvas[base + (x - xl) * 3 + 2] = b;
        }
      }
    }
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      drawLine(Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), r, g, b, 1);
    }
  } else {
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      drawLine(Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), r, g, b, 1);
    }
  }
}

function drawRoundedRect(x: number, y: number, w: number, h: number, r: number, cr: number, cg: number, cb: number): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      let dx = 0, dy = 0;
      if (xx < x + r) dx = x + r - xx;
      else if (xx >= x + w - r) dx = xx - (x + w - r);
      if (yy < y + r) dy = y + r - yy;
      else if (yy >= y + h - r) dy = yy - (y + h - r);
      if (dx*dx + dy*dy <= r*r) setPixel(xx, yy, cr, cg, cb);
    }
  }
}

function drawShadow(x: number, y: number, w: number, h: number, radius: number): void {
  for (let i = 0; i < 8; i++) {
    const a = 30 - i * 3;
    const offset = i + 2;
    drawRoundedRect(x + offset, y + offset, w, h, radius, 0, 0, 0);
  }
}

// ============================================================
// PNG ENCODING
// ============================================================

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writePNGChunk(buf: Uint8Array, type: string, data: Uint8Array): Uint8Array {
  const len = new Uint8Array(4);
  len[0] = (data.length >>> 24) & 0xff;
  len[1] = (data.length >>> 16) & 0xff;
  len[2] = (data.length >>> 8) & 0xff;
  len[3] = data.length & 0xff;
  const typeArr = new Uint8Array(4);
  for (let i = 0; i < 4; i++) typeArr[i] = type.charCodeAt(i);
  const crcData = new Uint8Array(4 + data.length);
  crcData.set(typeArr);
  crcData.set(data, 4);
  const crc = crc32(crcData);
  const crcArr = new Uint8Array(4);
  crcArr[0] = (crc >>> 24) & 0xff;
  crcArr[1] = (crc >>> 16) & 0xff;
  crcArr[2] = (crc >>> 8) & 0xff;
  crcArr[3] = crc & 0xff;
  const result = new Uint8Array(len.length + typeArr.length + data.length + crcArr.length);
  result.set(len);
  result.set(typeArr, len.length);
  result.set(data, len.length + typeArr.length);
  result.set(crcArr, len.length + typeArr.length + data.length);
  return result;
}

function encodePNG(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const dst = y * (1 + width * 3) + 1 + x * 3;
      raw[dst] = pixels[i];
      raw[dst + 1] = pixels[i + 1];
      raw[dst + 2] = pixels[i + 2];
    }
  }
  const compressed = deflateSync(raw, { level: 9 });
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [
    writePNGChunk(new Uint8Array(0), 'IHDR', ihdr),
    writePNGChunk(new Uint8Array(0), 'IDAT', compressed),
    writePNGChunk(new Uint8Array(0), 'IEND', new Uint8Array(0))
  ];
  let totalLen = 8;
  for (const c of chunks) totalLen += c.length;
  const out = new Uint8Array(totalLen);
  out.set(sig);
  let pos = 8;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

// ============================================================
// DATA LOADING
// ============================================================

interface Story {
  region: string;
  title: string;
  summary: string;
  source: string;
}

interface KPI {
  value: string;
  label: string;
}

interface Pin {
  id: number;
  lat: number;
  lon: number;
  name: string;
  special?: boolean;
}

const data = JSON.parse(readFileSync('news-data.json', 'utf-8')) as {
  stories: Story[];
  kpi: KPI[];
  pins: Pin[];
};

const stories = data.stories;
const kpis = data.kpi;
const pins = data.pins;

const REGION_COLORS: Record<string, [number, number, number]> = {
  'World': [220, 60, 60],
  'Asia-Pacific': [60, 180, 60],
  'Europe': [60, 100, 220],
  'Middle East': [220, 160, 40],
  'Americas': [180, 60, 200],
  'Africa': [240, 120, 30],
  'Science': [80, 200, 220],
};

const REGION_ORDER = ['World', 'Asia-Pacific', 'Europe', 'Middle East', 'Americas', 'Africa', 'Science'];

const MASTHEAD_BG = [20, 28, 36];
const CRIMSON = [200, 30, 40];
const GOLD = [230, 180, 40];
const WHITE = [255, 255, 255];
const CREAM = [245, 235, 215];
const NEWSPRINT = [244, 239, 228];
const CARD_WHITE = [255, 255, 255];
const DARK_TEXT = [30, 30, 35];
const MID_TEXT = [80, 80, 90];
const LIGHT_GRAY = [230, 230, 235];
const BLACK = [0, 0, 0];
const MAP_BG = [20, 35, 55];
const CONTINENT_FILL = [60, 90, 60];
const CONTINENT_STROKE = [90, 122, 90];
const GRATICULE = [42, 58, 42];

// ============================================================
// EXACT PIXEL BUDGET LAYOUT
// ============================================================

// Pixel budget constants (must sum to 1024)
const MASTHEAD_H = 104;
const REGION_BAR_H = 6;
const KPI_STRIP_H = 64;  // region bar + kpi = 70 total
const HERO_ROW_H = 215;
const GRID_ROWS = 4;
const GRID_COLS = 3;
const GRID_CARD_H = 85;  // 4 * 85 = 340, plus 3*12 gutters = 36, total 376... let me recalc
const GRID_GUTTER = 12;
const GRID_TOTAL_H = 385;  // 4 rows of cards + 3 gutters = 385
const BOTTOM_ROW_H = 215;
const FOOTER_H = 35;

// Verify total
const TOTAL_H = MASTHEAD_H + REGION_BAR_H + KPI_STRIP_H + HERO_ROW_H + GRID_TOTAL_H + BOTTOM_ROW_H + FOOTER_H;
console.log(`Layout total: ${TOTAL_H}px (target 1024)`);
if (TOTAL_H !== 1024) {
  throw new Error(`Pixel budget mismatch: ${TOTAL_H} !== 1024`);
}

// Card dimensions
const MARGIN = 40;
const CONTENT_W = WIDTH - 2 * MARGIN; // 944
const CARD_W = Math.round((CONTENT_W - (GRID_COLS - 1) * GRID_GUTTER) / GRID_COLS); // (944 - 24) / 3 = 306.66 -> 307

// Grid card height calculation
const GRID_CARD_H_CALC = Math.floor((GRID_TOTAL_H - (GRID_ROWS - 1) * GRID_GUTTER) / GRID_ROWS); // (385 - 36) / 4 = 87.25 -> 87
console.log(`Grid card: ${CARD_W}x${GRID_CARD_H_CALC}`);

// ============================================================
// RENDERING
// ============================================================

let y = 0;

// --- MASTHEAD (100px) ---
fillRect(0, 0, WIDTH, MASTHEAD_H, ...MASTHEAD_BG);

// Date badge - circular, centered left area
const badgeDiameter = 76;
const badgeX = 50;
const badgeY = Math.round((MASTHEAD_H - badgeDiameter) / 2);
drawCircle(badgeX + badgeDiameter/2, badgeY + badgeDiameter/2, badgeDiameter/2, ...CRIMSON, true);
drawCircle(badgeX + badgeDiameter/2, badgeY + badgeDiameter/2, badgeDiameter/2 - 2, ...MASTHEAD_BG, true);

// Date text in badge
drawTextCentered('19', badgeX + badgeDiameter/2, badgeY + 12, 2.2, ...WHITE, true);
drawTextCentered('NOV', badgeX + badgeDiameter/2, badgeY + 36, 0.9, ...WHITE, true);
drawTextCentered('2026', badgeX + badgeDiameter/2, badgeY + 50, 0.7, ...WHITE, false);

// Masthead title: "THE GLOBAL WIRE" - cap height >= 20px
const titleX = badgeX + badgeDiameter + 24;
const titleY = Math.round(MASTHEAD_H / 2) + 10; // baseline
drawTextSingleLine('THE GLOBAL WIRE', titleX, titleY, 3.2, ...WHITE, true); // 800 * 3.2 / 1000 = 2.56 -> cap ~25px

// Subtitle: "THURSDAY 19 NOVEMBER 2026"
const subtitleY = titleY + 32;
drawTextSingleLine('THURSDAY 19 NOVEMBER 2026', titleX, subtitleY, 1.1, ...CREAM, false);

// Right side: "16 STORIES · 7 REGIONS"
const rightText = '16 STORIES · 7 REGIONS';
const rightW = measureText(rightText, 1.0, true);
drawTextSingleLine(rightText, WIDTH - 50 - rightW, titleY + 4, 1.0, ...GOLD, true);

y = MASTHEAD_H;

// --- REGION BAR (6px) ---
const barY = y;
const REGION_COUNTS: Record<string, number> = {};
for (const s of stories) REGION_COUNTS[s.region] = (REGION_COUNTS[s.region] || 0) + 1;

let barX = MARGIN;
const totalStories = stories.length;
for (const region of REGION_ORDER) {
  const count = REGION_COUNTS[region] || 0;
  const w = Math.round((count / totalStories) * CONTENT_W);
  if (w > 0) {
    fillRect(barX, barY, w, REGION_BAR_H, ...REGION_COLORS[region]);
  }
  barX += w;
}
y = barY + REGION_BAR_H;

// --- KPI STRIP (64px) ---
const kpiStripY = y;
fillRect(0, kpiStripY, WIDTH, KPI_STRIP_H, 18, 24, 32);

drawTextCentered('THE DAY IN NUMBERS', WIDTH/2, kpiStripY + 8, 1.0, ...GOLD, true);

const kpiStartX = 120;
const kpiGap = (WIDTH - 240) / (kpis.length - 1);
for (let i = 0; i < kpis.length; i++) {
  const kx = Math.round(kpiStartX + i * kpiGap);
  drawTextCentered(kpis[i].value, kx, kpiStripY + 30, 1.6, ...WHITE, true);
  drawTextCentered(kpis[i].label, kx, kpiStripY + 50, 0.6, ...LIGHT_GRAY, false);
}
y = kpiStripY + KPI_STRIP_H;

// --- HERO ROW (215px) ---
const heroY = y;
const heroCardW = CARD_W;
const heroCardH = HERO_ROW_H;
const heroIllustH = 110;

const heroCards = [
  { story: stories[0], pin: 1, illustration: 'summit' },
  { story: stories[1], pin: 2, illustration: 'intercept' },
  { story: stories[2], pin: 3, illustration: 'voyager' },
];

for (let i = 0; i < 3; i++) {
  const hx = MARGIN + i * (heroCardW + GRID_GUTTER);
  const hy = heroY;
  const card = heroCards[i];
  const [rr, rg, rb] = REGION_COLORS[card.story.region];

  // Shadow
  drawShadow(hx, hy, heroCardW, heroCardH, 8);
  // Card background
  drawRoundedRect(hx, hy, heroCardW, heroCardH, 8, ...CARD_WHITE);
  // Region accent bar
  fillRect(hx, hy, 6, heroCardH, rr, rg, rb);

  // Illustration area
  const illustX = hx + 12;
  const illustY = hy + 12;
  const illustW = heroCardW - 24;

  if (card.illustration === 'summit') {
    // Sky
    fillRect(illustX, illustY, illustW, 50, 25, 40, 60);
    // Mountains
    const groundY = illustY + heroIllustH;
    for (let bx = 0; bx < illustW; bx += 8) {
      const bh = 40 + (bx % 5) * 20;
      fillRect(illustX + bx, groundY - bh, 10, bh, 40, 55, 75);
    }
    // Flags
    const flagColors = [
      [[255,255,255],[200,30,40],[255,255,255]],
      [[200,30,40],[255,255,255],[255,200,0]],
      [[255,255,255],[0,50,160],[255,255,255]]
    ];
    for (let fi = 0; fi < 3; fi++) {
      const fx = illustX + 30 + fi * (illustW / 3);
      drawLine(Math.round(fx + 8), groundY, Math.round(fx + 8), groundY - 45, 80, 80, 80, 2);
      for (let fy = 0; fy < 3; fy++) {
        fillRect(Math.round(fx), groundY - 50 + fy * 10, 16, 10, ...flagColors[fi][fy]);
      }
    }
  } else if (card.illustration === 'intercept') {
    fillRect(illustX, illustY, illustW, heroIllustH, 15, 15, 30);
    for (let s = 0; s < 60; s++) {
      const sx = illustX + randInt(illustW);
      const sy = illustY + randInt(50);
      setPixel(sx, sy, 255, 255, 255);
    }
    const towerX = illustX + 40;
    const towerBaseY = illustY + heroIllustH;
    fillRect(towerX, towerBaseY - 100, 25, 100, 50, 50, 60);
    fillRect(towerX - 5, towerBaseY - 110, 35, 10, 60, 60, 70);

    const missileX = illustX + illustW - 40;
    const missileY = illustY + 30;
    drawAALine(missileX, missileY, towerX + 12, towerBaseY - 50, 255, 80, 40, 3);
    drawCircle(towerX + 12, towerBaseY - 50, 12, 0, 200, 255, false);
    drawCircle(towerX + 12, towerBaseY - 50, 8, 0, 255, 255, true);
    drawAALine(towerX + 12, towerBaseY - 100, missileX - 40, missileY + 20, 0, 220, 255, 2);
  } else if (card.illustration === 'voyager') {
    fillRect(illustX, illustY, illustW, heroIllustH, 5, 5, 15);
    for (let s = 0; s < 150; s++) {
      const sx = illustX + randInt(illustW);
      const sy = illustY + randInt(heroIllustH);
      const brightness = 180 + randInt(75);
      setPixel(sx, sy, brightness, brightness, brightness);
    }
    const probeX = illustX + 40;
    const probeY = illustY + heroIllustH / 2;
    drawPolygon([
      [probeX, probeY - 20],
      [probeX + 35, probeY],
      [probeX, probeY + 20],
      [probeX + 10, probeY]
    ], 200, 190, 170, true);
    drawCircle(probeX + 45, probeY, 4, 255, 215, 0, true);
    drawAALine(probeX + 45, probeY, probeX + 45 + 50, probeY - 30, 255, 215, 0, 2);
    drawAALine(probeX + 45, probeY, probeX + 45 + 50, probeY + 30, 255, 215, 0, 2);

    const earthX = illustX + illustW - 50;
    const earthY = illustY + heroIllustH / 2;
    drawCircle(earthX, earthY, 18, 30, 100, 200, true);
    drawCircle(earthX - 5, earthY - 5, 6, 100, 180, 255, true);

    drawTextSingleLine('1 LIGHT-DAY', Math.round(illustX + illustW/2 - 50), illustY + heroIllustH - 18, 0.8, 255, 215, 0, true);
  }

  // Text content
  const textY = illustY + heroIllustH + 10;
  drawTextSingleLine(`${card.pin}`, hx + 8, textY - 2, 1.4, ...WHITE, true);
  drawWrappedText(card.story.title, hx + 30, textY, heroCardW - 40, 1.3, ...DARK_TEXT, true);
  const summaryY = textY + 32;
  drawWrappedText(card.story.summary, hx + 12, summaryY, heroCardW - 24, 0.75, ...MID_TEXT, false);
  const sourceY = hy + heroCardH - 20;
  drawTextSingleLine(card.story.source, hx + 12, sourceY, 0.6, ...MID_TEXT, false);
}

y = heroY + HERO_ROW_H + 8;

// --- GRID 4x3 (385px) ---
const gridStartY = y;

const gridStories = stories.slice(3, 15); // 12 stories

for (let row = 0; row < GRID_ROWS; row++) {
  for (let col = 0; col < GRID_COLS; col++) {
    const idx = row * GRID_COLS + col;
    if (idx >= gridStories.length) continue;
    const story = gridStories[idx];
    const pinNum = idx + 4;
    const cx = MARGIN + col * (CARD_W + GRID_GUTTER);
    const cy = gridStartY + row * (GRID_CARD_H_CALC + GRID_GUTTER);
    const [rr, rg, rb] = REGION_COLORS[story.region];

    drawShadow(cx, cy, CARD_W, GRID_CARD_H_CALC, 6);
    drawRoundedRect(cx, cy, CARD_W, GRID_CARD_H_CALC, 6, ...CARD_WHITE);
    fillRect(cx, cy, 5, GRID_CARD_H_CALC, rr, rg, rb);

    drawTextSingleLine(`${pinNum}`, cx + 8, cy + 8, 1.2, ...WHITE, true);
    drawWrappedText(story.title, cx + 28, cy + 8, CARD_W - 36, 0.95, ...DARK_TEXT, true);
    const summaryY = cy + 38;
    drawWrappedText(story.summary, cx + 10, summaryY, CARD_W - 20, 0.7, ...MID_TEXT, false);
    drawTextSingleLine(story.source, cx + 10, cy + GRID_CARD_H_CALC - 16, 0.55, ...MID_TEXT, false);

    // Small icon per story
    const iconX = cx + CARD_W - 45;
    const iconY = cy + 8;
    if (pinNum === 4) { drawTextSingleLine('9-6', iconX, iconY, 0.75, rr, rg, rb, true); }
    else if (pinNum === 5) { drawTextSingleLine('ANT $83', iconX - 12, iconY, 0.65, 40, 180, 60, true); }
    else if (pinNum === 6) { drawTextSingleLine('FOSSIL CUT', iconX - 15, iconY, 0.55, 200, 60, 60, true); }
    else if (pinNum === 7) { drawTextSingleLine('OVERTURNED', iconX - 18, iconY, 0.5, 60, 100, 220, true); }
    else if (pinNum === 8) { drawTextSingleLine('109-0', iconX, iconY, 0.75, rr, rg, rb, true); }
    else if (pinNum === 9) { drawTextSingleLine('4.9%', iconX + 5, iconY, 0.75, 220, 60, 60, true); }
    else if (pinNum === 10) { for (let r = 12; r > 2; r -= 2) drawCircle(iconX + 20, iconY + 6, r, 0, 180, 255, false); }
    else if (pinNum === 11) { drawAALine(iconX + 10, iconY + 12, iconX + 20, iconY + 4, 180, 100, 50, 2); drawAALine(iconX + 20, iconY + 4, iconX + 30, iconY + 12, 180, 100, 50, 2); drawAALine(iconX + 30, iconY + 12, iconX + 40, iconY + 4, 180, 100, 50, 2); }
    else if (pinNum === 12) { drawTextSingleLine('3-YR BAN', iconX - 5, iconY, 0.55, 220, 60, 60, true); }
    else if (pinNum === 13) { for (let b = 0; b < 3; b++) fillRect(iconX + 10 + b * 15, iconY + 12, 10, 20 - b * 5, rr, rg, rb); }
    else if (pinNum === 14) { drawTextSingleLine('1,000+', iconX - 2, iconY, 0.55, 60, 100, 220, true); }
    else if (pinNum === 15) { drawAALine(iconX + 15, iconY + 10, iconX + 25, iconY + 2, 220, 160, 40, 2); drawAALine(iconX + 25, iconY + 2, iconX + 35, iconY + 10, 220, 160, 40, 2); }
  }
}

y = gridStartY + GRID_TOTAL_H + 8;

// --- BOTTOM ROW: MAP (2/3) + STORY 16 (1/3) ---
const mapRowY = y;
const mapRowH = BOTTOM_ROW_H;
const mapW = Math.round(CONTENT_W * 2 / 3);
const mapX = MARGIN;
const mapH = mapRowH;
const story16W = CONTENT_W - mapW - GRID_GUTTER;
const story16X = mapX + mapW + GRID_GUTTER;

fillRect(mapX, mapRowY, mapW, mapH, ...MAP_BG);

// Graticule
const mapLonMin = -180, mapLonMax = 180;
const mapLatMin = -90, mapLatMax = 90;
function lonToX(lon: number): number {
  return mapX + Math.round(((lon - mapLonMin) / (mapLonMax - mapLonMin)) * mapW);
}
function latToY(lat: number): number {
  return mapRowY + Math.round(((mapLatMax - lat) / (mapLatMax - mapLatMin)) * mapH);
}

for (let lat = -60; lat <= 60; lat += 30) {
  const ly = latToY(lat);
  drawLine(mapX, ly, mapX + mapW, ly, ...GRATICULE, 1);
}
for (let lon = -150; lon <= 150; lon += 30) {
  const lx = lonToX(lon);
  drawLine(lx, mapRowY, lx, mapRowY + mapH, ...GRATICULE, 1);
}

// Continents
const continents: [number, number][][] = [
  [[-130, 60], [-60, 60], [-60, 15], [-80, 15], [-90, 30], [-110, 35], [-130, 50]],
  [[-80, 15], [-60, 15], [-60, -55], [-80, -55]],
  [[-20, 70], [40, 70], [40, 35], [30, 35], [20, 20], [10, 15], [-10, 35], [-20, 50]],
  [[-20, 35], [55, 35], [55, -35], [-20, -35]],
  [[100, 30], [150, 30], [150, -10], [100, -10]],
  [[110, -10], [155, -10], [155, -45], [110, -45]],
];

for (const poly of continents) {
  const pts: [number, number][] = poly.map(([lon, lat]) => [lonToX(lon), latToY(lat)]);
  drawPolygon(pts, ...CONTINENT_FILL, true);
  drawPolygon(pts, ...CONTINENT_STROKE, false);
}

// Pins
for (const pin of pins) {
  if (pin.special) continue;
  const px = lonToX(pin.lon);
  const py = latToY(pin.lat);
  drawCircle(px, py, 7, ...WHITE, true);
  drawCircle(px, py, 4, ...CRIMSON, true);
  drawTextSingleLine(`${pin.id}`, px - 4, py - 5, 0.7, ...WHITE, true);
}

// Voyager label
const voyagerX = mapX + mapW - 10;
const voyagerY = mapRowY + 10;
drawRoundedRect(voyagerX - 55, voyagerY, 65, 20, 4, 0, 100, 200);
drawTextSingleLine('3 → VOYAGER', voyagerX - 53, voyagerY + 4, 0.55, ...WHITE, true);

drawTextSingleLine('WHERE IT HAPPENED', mapX + 10, mapRowY + 10, 0.8, ...WHITE, true);

// Story 16 card
drawShadow(story16X, mapRowY, story16W, mapH, 8);
drawRoundedRect(story16X, mapRowY, story16W, mapH, 8, ...CARD_WHITE);
const s16 = stories[15];
const [r16, g16, b16] = REGION_COLORS[s16.region];
fillRect(story16X, mapRowY, 5, mapH, r16, g16, b16);
drawTextSingleLine('16', story16X + 8, mapRowY + 8, 1.2, ...WHITE, true);
drawWrappedText(s16.title, story16X + 28, mapRowY + 8, story16W - 36, 0.95, ...DARK_TEXT, true);

// Glacier illustration
const glacierX = story16X + 15;
const glacierY = mapRowY + 50;
const glacierW = story16W - 30;
drawPolygon([
  [glacierX, glacierY],
  [glacierX + glacierW, glacierY - 15],
  [glacierX + glacierW, glacierY + 50],
  [glacierX, glacierY + 70]
], 200, 230, 255, true);
drawPolygon([
  [glacierX, glacierY + 70],
  [glacierX + glacierW, glacierY + 50],
  [glacierX + glacierW, glacierY + 80],
  [glacierX, glacierY + 100]
], 80, 140, 180, true);
drawPolygon([
  [glacierX + 10, glacierY + 80],
  [glacierX + glacierW - 10, glacierY + 60],
  [glacierX + glacierW - 10, glacierY + 90],
  [glacierX + 10, glacierY + 110]
], 40, 100, 150, true);

drawWrappedText(s16.summary, story16X + 10, mapRowY + 130, story16W - 20, 0.7, ...MID_TEXT, false);
drawTextSingleLine(s16.source, story16X + 10, mapRowY + mapH - 18, 0.55, ...MID_TEXT, false);

y = mapRowY + mapH + 8;

// --- FOOTER (35px) ---
const footerH = FOOTER_H;
fillRect(0, y, WIDTH, footerH, 18, 24, 32);
let fx = 40;
for (const region of REGION_ORDER) {
  const [rr, rg, rb] = REGION_COLORS[region];
  fillRect(fx, y + 9, 16, 16, rr, rg, rb);
  drawTextSingleLine(region, fx + 22, y + 12, 0.6, ...LIGHT_GRAY, false);
  fx += measureText(region, 0.6) + 35;
}
drawTextSingleLine('THURSDAY 19 NOVEMBER 2026 | 16 VERIFIED STORIES', WIDTH - 380, y + 12, 0.6, ...LIGHT_GRAY, false);

// ============================================================
// OUTPUT
// ============================================================

const outputDir = '/output';
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
const pngData = encodePNG(canvas, WIDTH, HEIGHT);
writeFileSync('/output/entry.png', pngData);

const outDir = join(process.cwd(), 'out');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
copyFileSync('/output/entry.png', join(outDir, 'entry.png'));

console.log('Render complete: /output/entry.png -> out/entry.png');