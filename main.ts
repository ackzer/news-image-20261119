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

// Proper 8x8 bitmap font: each character = 8 row bytes (MSB = leftmost pixel)
const CHAR_BITMAPS: Record<string, number[]> = {
  ' ': [0,0,0,0,0,0,0,0],
  '!': [0x18,0x18,0x18,0x18,0x18,0x00,0x18,0x00],
  '"': [0x66,0x66,0x24,0x00,0x00,0x00,0x00,0x00],
  '#': [0x36,0x36,0x7F,0x36,0x7F,0x36,0x36,0x00],
  '$': [0x0C,0x3E,0x60,0x3C,0x06,0x7C,0x18,0x00],
  '%': [0x62,0x64,0x08,0x10,0x26,0x46,0x00,0x00],
  '&': [0x38,0x4C,0x48,0x30,0x5A,0x4C,0x36,0x00],
  "'": [0x18,0x18,0x10,0x00,0x00,0x00,0x00,0x00],
  '(': [0x0C,0x18,0x30,0x30,0x30,0x18,0x0C,0x00],
  ')': [0x30,0x18,0x0C,0x0C,0x0C,0x18,0x30,0x00],
  '*': [0x00,0x66,0x3C,0xFF,0x3C,0x66,0x00,0x00],
  '+': [0x00,0x18,0x18,0x7E,0x18,0x18,0x00,0x00],
  ',': [0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x10],
  '-': [0x00,0x00,0x00,0x7E,0x00,0x00,0x00,0x00],
  '.': [0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x00],
  '/': [0x02,0x04,0x08,0x10,0x20,0x40,0x00,0x00],
  '0': [0x3C,0x66,0x6E,0x76,0x66,0x66,0x3C,0x00],
  '1': [0x18,0x38,0x18,0x18,0x18,0x18,0x3C,0x00],
  '2': [0x3C,0x66,0x06,0x0C,0x30,0x60,0x7E,0x00],
  '3': [0x3C,0x66,0x06,0x1C,0x06,0x66,0x3C,0x00],
  '4': [0x0C,0x1C,0x3C,0x6C,0x7E,0x0C,0x0C,0x00],
  '5': [0x7E,0x60,0x7C,0x06,0x06,0x66,0x3C,0x00],
  '6': [0x1C,0x30,0x60,0x7C,0x66,0x66,0x3C,0x00],
  '7': [0x7E,0x06,0x0C,0x18,0x30,0x30,0x30,0x00],
  '8': [0x3C,0x66,0x66,0x3C,0x66,0x66,0x3C,0x00],
  '9': [0x3C,0x66,0x66,0x3E,0x06,0x0C,0x38,0x00],
  ':': [0x00,0x18,0x18,0x00,0x18,0x18,0x00,0x00],
  ';': [0x00,0x18,0x18,0x00,0x18,0x18,0x10,0x00],
  '<': [0x0C,0x18,0x30,0x60,0x30,0x18,0x0C,0x00],
  '=': [0x00,0x00,0x7E,0x00,0x7E,0x00,0x00,0x00],
  '>': [0x30,0x18,0x0C,0x06,0x0C,0x18,0x30,0x00],
  '?': [0x3C,0x66,0x06,0x0C,0x18,0x00,0x18,0x00],
  '@': [0x3C,0x66,0x6E,0x6A,0x6E,0x60,0x3C,0x00],
  'A': [0x3C,0x66,0x66,0x7E,0x66,0x66,0x66,0x00],
  'B': [0x7C,0x66,0x66,0x7C,0x66,0x66,0x7C,0x00],
  'C': [0x3C,0x66,0x60,0x60,0x60,0x66,0x3C,0x00],
  'D': [0x7C,0x66,0x66,0x66,0x66,0x66,0x7C,0x00],
  'E': [0x7E,0x60,0x60,0x7C,0x60,0x60,0x7E,0x00],
  'F': [0x7E,0x60,0x60,0x7C,0x60,0x60,0x60,0x00],
  'G': [0x3C,0x66,0x60,0x6E,0x66,0x66,0x3C,0x00],
  'H': [0x66,0x66,0x66,0x7E,0x66,0x66,0x66,0x00],
  'I': [0x3C,0x18,0x18,0x18,0x18,0x18,0x3C,0x00],
  'J': [0x1E,0x0C,0x0C,0x0C,0x0C,0x6C,0x38,0x00],
  'K': [0x66,0x6C,0x78,0x70,0x78,0x6C,0x66,0x00],
  'L': [0x60,0x60,0x60,0x60,0x60,0x60,0x7E,0x00],
  'M': [0x63,0x77,0x7F,0x6B,0x63,0x63,0x63,0x00],
  'N': [0x66,0x76,0x7E,0x7E,0x6E,0x66,0x66,0x00],
  'O': [0x3C,0x66,0x66,0x66,0x66,0x66,0x3C,0x00],
  'P': [0x7C,0x66,0x66,0x7C,0x60,0x60,0x60,0x00],
  'Q': [0x3C,0x66,0x66,0x66,0x66,0x6C,0x36,0x00],
  'R': [0x7C,0x66,0x66,0x7C,0x6C,0x66,0x66,0x00],
  'S': [0x3C,0x66,0x60,0x3C,0x06,0x66,0x3C,0x00],
  'T': [0x7E,0x18,0x18,0x18,0x18,0x18,0x18,0x00],
  'U': [0x66,0x66,0x66,0x66,0x66,0x66,0x3C,0x00],
  'V': [0x66,0x66,0x66,0x66,0x66,0x3C,0x18,0x00],
  'W': [0x63,0x63,0x63,0x6B,0x7F,0x77,0x63,0x00],
  'X': [0x66,0x66,0x3C,0x18,0x3C,0x66,0x66,0x00],
  'Y': [0x66,0x66,0x66,0x3C,0x18,0x18,0x18,0x00],
  'Z': [0x7E,0x06,0x0C,0x18,0x30,0x60,0x7E,0x00],
  '[': [0x3C,0x30,0x30,0x30,0x30,0x30,0x3C,0x00],
  '\\': [0x40,0x20,0x10,0x08,0x04,0x02,0x00,0x00],
  ']': [0x3C,0x0C,0x0C,0x0C,0x0C,0x0C,0x3C,0x00],
  '^': [0x18,0x3C,0x66,0x00,0x00,0x00,0x00,0x00],
  '_': [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xFF],
  '`': [0x30,0x18,0x0C,0x00,0x00,0x00,0x00,0x00],
  'a': [0x00,0x00,0x3C,0x06,0x3E,0x66,0x3E,0x00],
  'b': [0x60,0x60,0x7C,0x66,0x66,0x66,0x7C,0x00],
  'c': [0x00,0x00,0x3C,0x60,0x60,0x66,0x3C,0x00],
  'd': [0x06,0x06,0x3E,0x66,0x66,0x66,0x3E,0x00],
  'e': [0x00,0x00,0x3C,0x66,0x7E,0x60,0x3C,0x00],
  'f': [0x1C,0x30,0x7E,0x30,0x30,0x30,0x30,0x00],
  'g': [0x00,0x00,0x3E,0x66,0x66,0x3E,0x06,0x3C],
  'h': [0x60,0x60,0x7C,0x66,0x66,0x66,0x66,0x00],
  'i': [0x18,0x00,0x38,0x18,0x18,0x18,0x3C,0x00],
  'j': [0x0C,0x00,0x1C,0x0C,0x0C,0x0C,0x6C,0x38],
  'k': [0x60,0x60,0x66,0x6C,0x78,0x6C,0x66,0x00],
  'l': [0x38,0x18,0x18,0x18,0x18,0x18,0x3C,0x00],
  'm': [0x00,0x00,0x66,0x7F,0x7F,0x6B,0x63,0x00],
  'n': [0x00,0x00,0x7C,0x66,0x66,0x66,0x66,0x00],
  'o': [0x00,0x00,0x3C,0x66,0x66,0x66,0x3C,0x00],
  'p': [0x00,0x00,0x7C,0x66,0x66,0x7C,0x60,0x60],
  'q': [0x00,0x00,0x3E,0x66,0x66,0x3E,0x06,0x06],
  'r': [0x00,0x00,0x7C,0x66,0x60,0x60,0x60,0x00],
  's': [0x00,0x00,0x3E,0x60,0x3C,0x06,0x7C,0x00],
  't': [0x30,0x30,0x7E,0x30,0x30,0x30,0x1E,0x00],
  'u': [0x00,0x00,0x66,0x66,0x66,0x66,0x3E,0x00],
  'v': [0x00,0x00,0x66,0x66,0x66,0x3C,0x18,0x00],
  'w': [0x00,0x00,0x63,0x6B,0x7F,0x77,0x63,0x00],
  'x': [0x00,0x00,0x66,0x3C,0x18,0x3C,0x66,0x00],
  'y': [0x00,0x00,0x66,0x66,0x66,0x3E,0x06,0x3C],
  'z': [0x00,0x00,0x7E,0x0C,0x18,0x30,0x7E,0x00],
  '{': [0x0E,0x18,0x18,0x70,0x18,0x18,0x0E,0x00],
  '|': [0x18,0x18,0x18,0x18,0x18,0x18,0x18,0x00],
  '}': [0x70,0x18,0x18,0x0E,0x18,0x18,0x70,0x00],
  '~': [0x00,0x00,0x31,0x7A,0x46,0x00,0x00,0x00],
};

const FONT_DATA: number[] = [];
for (let code = 32; code <= 126; code++) {
  const ch = String.fromCharCode(code);
  const rows = CHAR_BITMAPS[ch] || [0x7E,0x42,0x42,0x42,0x42,0x42,0x7E,0x00];
  FONT_DATA.push(...rows);
}

function drawChar(ch: string, x: number, y: number, scale: number, r: number, g: number, b: number, bold = false): number {
  const code = ch.charCodeAt(0);
  if (code < 32 || code > 126) return Math.round(8 * scale);
  const charIndex = (code - 32) * 8;
  const w = Math.round(8 * scale);
  for (let cy = 0; cy < 8; cy++) {
    const row = FONT_DATA[charIndex + cy];
    for (let cx = 0; cx < 8; cx++) {
      if (row & (1 << (7 - cx))) {
        // Solid fill for each glyph pixel scaled up
        const px = Math.floor(x + cx * scale);
        const py = Math.floor(y + cy * scale);
        const pw = Math.ceil(scale);
        const ph = Math.ceil(scale);
        fillRect(px, py, pw, ph, r, g, b);
        if (bold) {
          // Slight offset for bold effect
          fillRect(px + 1, py, pw, ph, r, g, b);
        }
      }
    }
  }
  return w;
}

function charWidth(scale: number): number {
  return Math.round(8 * scale) + Math.round(scale * 0.3);
}
function drawText(text: string, x: number, y: number, scale: number, r: number, g: number, b: number, bold = false, maxWidth?: number): number {
  let cursorX = x;
  const words = text.split(' ');
  let lineHeight = Math.round(8 * scale * 1.3);
  let currentLine = '';
  let lineCount = 0;
  for (const word of words) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    let testWidth = 0;
    for (const ch of testLine) testWidth += Math.round(8 * scale) + Math.round(scale * 0.3);
    if (maxWidth && testWidth > maxWidth && currentLine) {
      drawText(currentLine, x, y + lineCount * lineHeight, scale, r, g, b, bold);
      currentLine = word;
      lineCount++;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    drawText(currentLine, x, y + lineCount * lineHeight, scale, r, g, b, bold);
    lineCount++;
  }
  return lineCount * lineHeight;
}

function drawTextSingleLine(text: string, x: number, y: number, scale: number, r: number, g: number, b: number, bold = false): number {
  let cursorX = x;
  for (const ch of text) {
    cursorX += drawChar(ch, cursorX, y, scale, r, g, b, bold) + Math.round(scale * 0.3);
  }
  return cursorX - x;
}

function drawTextCentered(text: string, cx: number, y: number, scale: number, r: number, g: number, b: number, bold = false): void {
  let totalWidth = 0;
  for (const ch of text) totalWidth += Math.round(8 * scale) + Math.round(scale * 0.3);
  totalWidth -= Math.round(scale * 0.3);
  drawTextSingleLine(text, cx - totalWidth / 2, y, scale, r, g, b, bold);
}

function measureText(text: string, scale: number): number {
  let w = 0;
  for (const ch of text) w += Math.round(8 * scale) + Math.round(scale * 0.3);
  return w - Math.round(scale * 0.3);
}

function wrapText(text: string, maxWidth: number, scale: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current + (current ? ' ' : '') + word;
    if (measureText(test, scale) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawWrappedText(text: string, x: number, y: number, maxWidth: number, scale: number, r: number, g: number, b: number, bold = false, lineGap = 1.2): number {
  const lines = wrapText(text, maxWidth, scale);
  const lineHeight = Math.round(8 * scale * lineGap);
  for (let i = 0; i < lines.length; i++) {
    drawTextSingleLine(lines[i], x, y + i * lineHeight, scale, r, g, b, bold);
  }
  return lines.length * lineHeight;
}

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
  const png = new Uint8Array(8 + 0);
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

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

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

let y = 0;

const MASTHEAD_H = Math.round(HEIGHT * 0.12);
fillRect(0, 0, WIDTH, MASTHEAD_H, ...MASTHEAD_BG);

const badgeSize = Math.round(MASTHEAD_H * 0.85);
const badgeX = 40;
const badgeY = Math.round((MASTHEAD_H - badgeSize) / 2);
drawRoundedRect(badgeX, badgeY, badgeSize, badgeSize, 8, ...CRIMSON);

drawTextCentered('NOV', badgeX + badgeSize/2, badgeY + 8, 1.1, ...WHITE, true);
drawTextCentered('19', badgeX + badgeSize/2, badgeY + badgeSize/2 - 12, 3.2, ...WHITE, true);
drawTextCentered('THU', badgeX + badgeSize/2, badgeY + badgeSize - 26, 0.9, ...WHITE);
drawTextCentered('2026', badgeX + badgeSize/2, badgeY + badgeSize - 16, 0.7, ...WHITE);

const kickerX = badgeX + badgeSize + 20;
drawTextSingleLine('THE DAY IN WORLD NEWS', kickerX, badgeY + 10, 0.9, ...GOLD, true);

const headlineY = badgeY + 14;
drawTextSingleLine('THURSDAY 19 NOVEMBER 2026', kickerX, headlineY, 1.8, ...WHITE, true);
drawTextSingleLine('THE WORLD\'S NEWS IN ONE IMAGE', kickerX, headlineY + 30, 0.85, ...CREAM, false);

const statsX = WIDTH - 40;
const stats = ['16 STORIES', '7 REGIONS', 'ONE PAGE'];
let statsWidth = 0;
for (const s of stats) statsWidth = Math.max(statsWidth, measureText(s, 0.75));
let statsY = badgeY + badgeSize - 10;
for (let i = stats.length - 1; i >= 0; i--) {
  drawTextSingleLine(stats[i], statsX - statsWidth, statsY, 0.75, ...WHITE, true);
  statsY -= 20;
}

y = MASTHEAD_H + 4;

const REGION_COUNTS: Record<string, number> = {};
for (const s of stories) REGION_COUNTS[s.region] = (REGION_COUNTS[s.region] || 0) + 1;

const barHeight = 8;
const barY = y;
let barX = 40;
const totalStories = stories.length;
for (const region of REGION_ORDER) {
  const count = REGION_COUNTS[region] || 0;
  const w = Math.round((count / totalStories) * (WIDTH - 80));
  if (w > 0) {
    fillRect(barX, barY, w, barHeight, ...REGION_COLORS[region]);
  }
  barX += w;
}
y = barY + barHeight + 12;

const kpiStripY = y;
const kpiStripH = 56;
fillRect(0, kpiStripY, WIDTH, kpiStripH, 18, 24, 32);
drawTextCentered('THE DAY IN NUMBERS', WIDTH/2, kpiStripY + 8, 0.9, ...GOLD, true);
const kpiStartX = 80;
const kpiGap = (WIDTH - 160) / (kpis.length - 1);
for (let i = 0; i < kpis.length; i++) {
  const kx = Math.round(kpiStartX + i * kpiGap);
  drawTextCentered(kpis[i].value, kx, kpiStripY + 20, 1.6, ...WHITE, true);
  drawTextCentered(kpis[i].label, kx, kpiStripY + 42, 0.6, ...LIGHT_GRAY, false);
}
y = kpiStripY + kpiStripH + 8;

const heroCards = [
  { story: stories[0], pin: 1, illustration: 'summit' },
  { story: stories[1], pin: 2, illustration: 'intercept' },
  { story: stories[2], pin: 3, illustration: 'voyager' },
];

const heroCardW = Math.round((WIDTH - 100) / 3);
const heroCardH = 260;
const heroStartX = 40;
const heroIllustH = 130;

for (let i = 0; i < 3; i++) {
  const hx = heroStartX + i * (heroCardW + 10);
  const hy = y;
  const card = heroCards[i];
  const [rr, rg, rb] = REGION_COLORS[card.story.region];

  drawShadow(hx, hy, heroCardW, heroCardH, 8);
  drawRoundedRect(hx, hy, heroCardW, heroCardH, 8, ...CARD_WHITE);

  fillRect(hx, hy, 6, heroCardH, rr, rg, rb);

  const illustY = hy + 12;
  const illustX = hx + 12;
  const illustW = heroCardW - 24;

  if (card.illustration === 'summit') {
    const skyH = 60;
    fillRect(illustX, illustY, illustW, skyH, 25, 40, 60);
    const groundY = illustY + skyH;
    fillRect(illustX, groundY, illustW, heroIllustH - skyH, 35, 50, 70);

    const flagW = 16, flagH = 10;
    const poleH = 50;
    const flagColors = [
      [[255,255,255],[200,30,40],[255,255,255]],
      [[200,30,40],[255,255,255],[255,200,0]],
      [[255,255,255],[0,50,160],[255,255,255]]
    ];
    for (let fi = 0; fi < 3; fi++) {
      const fx = illustX + 20 + fi * (flagW + 30);
      drawLine(fx + flagW/2, groundY, fx + flagW/2, groundY - poleH, 80, 80, 80, 2);
      for (let fy = 0; fy < 3; fy++) {
        fillRect(fx, groundY - poleH + fy * flagH, flagW, flagH, ...flagColors[fi][fy]);
      }
    }

    const podiumX = illustX + illustW - 80;
    const podiumY = groundY;
    fillRect(podiumX, podiumY - 40, 60, 40, 60, 50, 40);
    fillRect(podiumX + 5, podiumY - 60, 50, 20, 50, 40, 30);
    fillRect(podiumX - 10, podiumY - 30, 30, 30, 70, 60, 50);
    fillRect(podiumX + 60, podiumY - 30, 30, 30, 70, 60, 50);

    for (let bx = 0; bx < illustW; bx += 8) {
      const bh = 30 + (bx % 3) * 15;
      fillRect(illustX + bx, groundY - bh, 6, bh, 40, 55, 75);
    }
  } else if (card.illustration === 'intercept') {
    fillRect(illustX, illustY, illustW, heroIllustH, 15, 15, 30);
    for (let s = 0; s < 80; s++) {
      const sx = illustX + randInt(illustW);
      const sy = illustY + randInt(60);
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
    for (let s = 0; s < 200; s++) {
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

    drawTextSingleLine('1 LIGHT-DAY', illustX + illustW/2 - 40, illustY + heroIllustH - 18, 0.7, 255, 215, 0, true);
  }

  const textY = illustY + heroIllustH + 10;
  drawTextSingleLine(`${card.pin}`, hx + 8, textY - 2, 1.2, ...WHITE, true);
  drawTextSingleLine(card.story.title, hx + 30, textY, 1.2, ...DARK_TEXT, true);
  const summaryY = textY + 28;
  drawWrappedText(card.story.summary, hx + 12, summaryY, heroCardW - 24, 0.7, ...MID_TEXT, false);
  const sourceY = hy + heroCardH - 22;
  drawTextSingleLine(card.story.source, hx + 12, sourceY, 0.6, ...MID_TEXT, false);
}

y += heroCardH + 16;

const gridStartY = y;
const gridCols = 3;
const gridRows = 4;
const cardW = Math.round((WIDTH - 100) / 3);
const cardH = 150;
const gridStories = stories.slice(3, 15);

for (let row = 0; row < gridRows; row++) {
  for (let col = 0; col < gridCols; col++) {
    const idx = row * gridCols + col;
    if (idx >= gridStories.length) continue;
    const story = gridStories[idx];
    const pinNum = idx + 4;
    const cx = 40 + col * (cardW + 10);
    const cy = gridStartY + row * (cardH + 10);
    const [rr, rg, rb] = REGION_COLORS[story.region];

    drawShadow(cx, cy, cardW, cardH, 6);
    drawRoundedRect(cx, cy, cardW, cardH, 6, ...CARD_WHITE);
    fillRect(cx, cy, 5, cardH, rr, rg, rb);

    drawTextSingleLine(`${pinNum}`, cx + 8, cy + 8, 1.0, ...WHITE, true);
    drawWrappedText(story.title, cx + 28, cy + 8, cardW - 36, 0.85, ...DARK_TEXT, true);
    const summaryY = cy + 48;
    drawWrappedText(story.summary, cx + 10, summaryY, cardW - 20, 0.65, ...MID_TEXT, false);
    drawTextSingleLine(story.source, cx + 10, cy + cardH - 18, 0.55, ...MID_TEXT, false);

    const iconX = cx + cardW - 50;
    const iconY = cy + 10;
    if (pinNum === 4) {
      drawTextSingleLine('9-6', iconX, iconY, 0.7, rr, rg, rb, true);
      drawPolygon([[iconX+25,iconY],[iconX+30,iconY+10],[iconX+20,iconY+10]], rr, rg, rb, true);
    } else if (pinNum === 5) {
      drawTextSingleLine('ANT $83', iconX - 10, iconY, 0.6, 40, 180, 60, true);
      drawAALine(iconX + 30, iconY + 12, iconX + 55, iconY + 2, 40, 180, 60, 2);
      drawAALine(iconX + 55, iconY + 2, iconX + 65, iconY - 4, 40, 180, 60, 2);
    } else if (pinNum === 6) {
      drawTextSingleLine('FOSSIL', iconX - 5, iconY, 0.55, 200, 60, 60, true);
      drawAALine(iconX + 25, iconY + 2, iconX + 45, iconY + 10, 200, 60, 60, 2);
      drawTextSingleLine('CUT', iconX + 28, iconY - 2, 0.55, 200, 60, 60, true);
    } else if (pinNum === 7) {
      drawTextSingleLine('OVERTURNED', iconX - 15, iconY, 0.5, 60, 100, 220, true);
      drawPolygon([[iconX+35,iconY+2],[iconX+40,iconY-8],[iconX+45,iconY+2]], 60, 100, 220, true);
    } else if (pinNum === 8) {
      drawTextSingleLine('109-0', iconX, iconY, 0.7, rr, rg, rb, true);
      fillRect(iconX + 32, iconY + 2, 25, 8, rr, rg, rb);
    } else if (pinNum === 9) {
      drawTextSingleLine('4.9%', iconX + 5, iconY, 0.7, 220, 60, 60, true);
      drawAALine(iconX + 30, iconY + 10, iconX + 40, iconY + 6, 220, 60, 60, 2);
      drawAALine(iconX + 40, iconY + 6, iconX + 50, iconY, 220, 60, 60, 2);
      drawAALine(iconX + 50, iconY, iconX + 60, iconY - 4, 220, 60, 60, 2);
    } else if (pinNum === 10) {
      for (let r = 12; r > 2; r -= 2) {
        drawCircle(iconX + 20, iconY + 6, r, 0, 180, 255, false);
      }
    } else if (pinNum === 11) {
      drawAALine(iconX + 10, iconY + 14, iconX + 20, iconY + 4, 180, 100, 50, 3);
      drawAALine(iconX + 20, iconY + 4, iconX + 30, iconY + 14, 180, 100, 50, 3);
      drawAALine(iconX + 30, iconY + 14, iconX + 40, iconY + 4, 180, 100, 50, 3);
    } else if (pinNum === 12) {
      drawTextSingleLine('3-YR BAN', iconX - 5, iconY, 0.55, 220, 60, 60, true);
    } else if (pinNum === 13) {
      for (let b = 0; b < 3; b++) {
        fillRect(iconX + 10 + b * 15, iconY + 12, 10, 20 - b * 5, rr, rg, rb);
      }
    } else if (pinNum === 14) {
      drawTextSingleLine('1,000+', iconX - 2, iconY, 0.55, 60, 100, 220, true);
      for (let d = 0; d < 4; d++) {
        drawAALine(iconX + 35, iconY + 2 + d * 3, iconX + 45, iconY - 2 + d * 3, 60, 100, 220, 1);
      }
    } else if (pinNum === 15) {
      drawAALine(iconX + 15, iconY + 10, iconX + 25, iconY + 2, 220, 160, 40, 2);
      drawAALine(iconX + 25, iconY + 2, iconX + 35, iconY + 10, 220, 160, 40, 2);
    }
  }
}

y = gridStartY + gridRows * (cardH + 10) + 8;

const mapRowY = y;
const mapRowH = 180;
const mapW = Math.round((WIDTH - 100) * 2 / 3);
const mapX = 40;
const mapH = mapRowH;
const story16W = WIDTH - mapX - mapW - 50;
const story16X = mapX + mapW + 10;

fillRect(mapX, mapRowY, mapW, mapH, 20, 35, 55);

const mapLonMin = -180, mapLonMax = 180;
const mapLatMin = -90, mapLatMax = 90;
function lonToX(lon: number): number {
  return mapX + Math.round(((lon - mapLonMin) / (mapLonMax - mapLonMin)) * mapW);
}
function latToY(lat: number): number {
  return mapRowY + Math.round(((mapLatMax - lat) / (mapLatMax - mapLatMin)) * mapH);
}

for (let lat = -60; lat <= 60; lat += 30) {
  const y = latToY(lat);
  drawLine(mapX, y, mapX + mapW, y, 30, 50, 80, 1);
}
for (let lon = -150; lon <= 150; lon += 30) {
  const x = lonToX(lon);
  drawLine(x, mapRowY, x, mapRowY + mapH, 30, 50, 80, 1);
}

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
  drawPolygon(pts, 60, 90, 50, true);
  drawPolygon(pts, 90, 130, 70, false);
}

for (const pin of pins) {
  if (pin.special) continue;
  const px = lonToX(pin.lon);
  const py = latToY(pin.lat);
  drawCircle(px, py, 6, 255, 255, 255, true);
  drawCircle(px, py, 4, 220, 30, 40, true);
  drawTextSingleLine(`${pin.id}`, px - 3, py - 5, 0.6, 255, 255, 255, true);
}

const voyagerX = mapX + mapW - 10;
const voyagerY = mapRowY + 10;
drawRoundedRect(voyagerX - 50, voyagerY, 60, 20, 4, 0, 100, 200);
drawTextSingleLine('3 -> VOYAGER', voyagerX - 48, voyagerY + 4, 0.5, 255, 255, 255, true);

drawTextSingleLine('WHERE IT HAPPENED', mapX + 10, mapRowY + 10, 0.7, 255, 255, 255, true);

drawShadow(story16X, mapRowY, story16W, mapH, 8);
drawRoundedRect(story16X, mapRowY, story16W, mapH, 8, ...CARD_WHITE);
const s16 = stories[15];
const [r16, g16, b16] = REGION_COLORS[s16.region];
fillRect(story16X, mapRowY, 5, mapH, r16, g16, b16);
drawTextSingleLine('16', story16X + 8, mapRowY + 8, 1.0, ...WHITE, true);
drawWrappedText(s16.title, story16X + 28, mapRowY + 8, story16W - 36, 0.85, ...DARK_TEXT, true);

const glacierX = story16X + 20;
const glacierY = mapRowY + 60;
const glacierW = story16W - 40;
drawPolygon([
  [glacierX, glacierY],
  [glacierX + glacierW, glacierY - 20],
  [glacierX + glacierW, glacierY + 60],
  [glacierX, glacierY + 80]
], 200, 230, 255, true);
drawPolygon([
  [glacierX, glacierY + 80],
  [glacierX + glacierW, glacierY + 60],
  [glacierX + glacierW, glacierY + 90],
  [glacierX, glacierY + 110]
], 80, 140, 180, true);
drawPolygon([
  [glacierX + 10, glacierY + 90],
  [glacierX + glacierW - 10, glacierY + 70],
  [glacierX + glacierW - 10, glacierY + 100],
  [glacierX + 10, glacierY + 120]
], 40, 100, 150, true);

drawWrappedText(s16.summary, story16X + 10, mapRowY + 140, story16W - 20, 0.65, ...MID_TEXT, false);
drawTextSingleLine(s16.source, story16X + 10, mapRowY + mapH - 18, 0.55, ...MID_TEXT, false);

y = mapRowY + mapH + 12;

const footerH = 36;
fillRect(0, y, WIDTH, footerH, 18, 24, 32);
let fx = 40;
for (const region of REGION_ORDER) {
  const [rr, rg, rb] = REGION_COLORS[region];
  fillRect(fx, y + 10, 16, 16, rr, rg, rb);
  drawTextSingleLine(region, fx + 22, y + 12, 0.6, ...LIGHT_GRAY, false);
  fx += measureText(region, 0.6) + 40;
}
drawTextSingleLine('THURSDAY 19 NOVEMBER 2026 | 16 VERIFIED STORIES', WIDTH - 380, y + 12, 0.6, ...LIGHT_GRAY, false);

const outputDir = '/output';
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
const pngData = encodePNG(canvas, WIDTH, HEIGHT);
writeFileSync('/output/entry.png', pngData);

const outDir = join(process.cwd(), 'out');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
copyFileSync('/output/entry.png', join(outDir, 'entry.png'));

console.log('Render complete: /output/entry.png -> out/entry.png');