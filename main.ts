import * as fs from 'fs';
import * as zlib from 'zlib';
import * as path from 'path';

// ============================================================================
// Types & Constants
// ============================================================================

interface NewsItem {
  region: string;
  title: string;
  summary: string;
}

interface RegionInfo {
  name: string;
  shortName: string;
  color: number;
  count: number;
}

interface Point {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Canvas dimensions
const WIDTH = 1024;
const HEIGHT = 1024;

// Colors (0xRRGGBB)
const COLORS = {
  paper: 0xF4EFE4,
  mastheadBg: 0x141C24,
  accentRed: 0xC8232C,
  white: 0xFFFFFF,
  cream: 0xF4EFE4,
  distBg: 0xEBE4D6,
  cardBg: 0xFFFFFF,
  cardBorder: 0xCDC5B6,
  cardShadow: 0xE0D9CB,
  titleInk: 0x12161C,
  bodyInk: 0x3A3C44,
  mutedInk: 0x66605E,
  ocean: 0xA8C8E8,
  land: 0xF4EFE4,
  footerLine: 0xCDC5B6,
  // Region colors
  world: 0x204070,
  asiaPacific: 0xBE202E,
  europe: 0x006884,
  middleEast: 0xBA6216,
  americas: 0x247046,
  africa: 0x762FB0,
  science: 0x0C7E98,
};

const REGIONS: RegionInfo[] = [
  { name: 'World', shortName: 'WORLD', color: COLORS.world, count: 2 },
  { name: 'Asia-Pacific', shortName: 'ASIA-PAC', color: COLORS.asiaPacific, count: 3 },
  { name: 'Europe', shortName: 'EUROPE', color: COLORS.europe, count: 3 },
  { name: 'Middle East', shortName: 'MID EAST', color: COLORS.middleEast, count: 2 },
  { name: 'Americas', shortName: 'AMERICAS', color: COLORS.americas, count: 2 },
  { name: 'Africa', shortName: 'AFRICA', color: COLORS.africa, count: 2 },
  { name: 'Science', shortName: 'SCIENCE', color: COLORS.science, count: 2 },
];

const TOPIC_BADGES = [
  'APEC', 'RIYADH', 'NASA', 'ICJ', '$20M', 'DROUGHT',
  'IAEA', '1,000+', 'KERCH', 'CYBER', 'GULF', 'CARTELS',
  'STRIKE', 'IMF', 'ENVOY', '15,000',
];

const KPI_ITEMS = [
  { label: '$20M', detail: 'Xi APEC trade fund', regionColor: COLORS.asiaPacific },
  { label: '25.9B km', detail: 'Voyager 1 light-day', regionColor: COLORS.science },
  { label: '1,000+', detail: 'UK drones to Kyiv', regionColor: COLORS.europe },
  { label: '49 YRS', detail: 'Voyager 1 mission age', regionColor: COLORS.science },
  { label: '15,000', detail: 'Antarctic cliffs', regionColor: COLORS.science },
];

// ============================================================================
// Canvas / Pixel Buffer
// ============================================================================

class Canvas {
  private data: Uint8Array; // RGBA
  private width: number;
  private height: number;

  constructor(width: number, height: number, bgColor: number = 0xFFFFFFFF) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
    this.fill(bgColor);
  }

  fill(color: number): void {
    const r = (color >> 16) & 0xFF;
    const g = (color >> 8) & 0xFF;
    const b = color & 0xFF;
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
    }
  }

  setPixel(x: number, y: number, color: number, alpha: number = 255): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const idx = (y * this.width + x) * 4;
    const r = (color >> 16) & 0xFF;
    const g = (color >> 8) & 0xFF;
    const b = color & 0xFF;
    if (alpha === 255) {
      this.data[idx] = r;
      this.data[idx + 1] = g;
      this.data[idx + 2] = b;
      this.data[idx + 3] = 255;
    } else {
      // Alpha blend
      const a = alpha / 255;
      this.data[idx] = Math.round(this.data[idx] * (1 - a) + r * a);
      this.data[idx + 1] = Math.round(this.data[idx + 1] * (1 - a) + g * a);
      this.data[idx + 2] = Math.round(this.data[idx + 2] * (1 - a) + b * a);
      this.data[idx + 3] = 255;
    }
  }

  getPixel(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    const idx = (y * this.width + x) * 4;
    return (this.data[idx] << 16) | (this.data[idx + 1] << 8) | this.data[idx + 2];
  }

  getData(): Uint8Array {
    return this.data;
  }

  getWidth(): number { return this.width; }
  getHeight(): number { return this.height; }

  // Drawing primitives
  fillRect(x: number, y: number, w: number, h: number, color: number): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        this.setPixel(xx, yy, color);
      }
    }
  }

  drawRect(x: number, y: number, w: number, h: number, color: number): void {
    this.drawLine(x, y, x + w - 1, y, color);
    this.drawLine(x, y + h - 1, x + w - 1, y + h - 1, color);
    this.drawLine(x, y, x, y + h - 1, color);
    this.drawLine(x + w - 1, y, x + w - 1, y + h - 1, color);
  }

  drawLine(x0: number, y0: number, x1: number, y1: number, color: number): void {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0;
    let y = y0;

    while (true) {
      this.setPixel(x, y, color);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  drawThickLine(x0: number, y0: number, x1: number, y1: number, color: number, thickness: number = 1): void {
    if (thickness <= 1) {
      this.drawLine(x0, y0, x1, y1, color);
      return;
    }
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const nx = -dy / len * (thickness / 2);
    const ny = dx / len * (thickness / 2);

    // Draw as polygon
    const pts: Point[] = [
      { x: x0 + nx, y: y0 + ny },
      { x: x1 + nx, y: y1 + ny },
      { x: x1 - nx, y: y1 - ny },
      { x: x0 - nx, y: y0 - ny },
    ];
    this.fillPolygon(pts, color);
  }

  fillPolygon(points: Point[], color: number): void {
    if (points.length < 3) return;

    // Find bounds
    let minY = points[0].y, maxY = points[0].y;
    for (const p of points) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
      const intersections: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
          const x = p1.x + (y - p1.y) * (p2.x - p1.x) / (p2.y - p1.y);
          intersections.push(x);
        }
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i < intersections.length; i += 2) {
        const xStart = Math.ceil(intersections[i]);
        const xEnd = Math.floor(intersections[i + 1]);
        for (let x = xStart; x <= xEnd; x++) {
          this.setPixel(x, y, color);
        }
      }
    }
  }

  drawCircle(cx: number, cy: number, r: number, color: number, filled: boolean = false): void {
    if (filled) {
      for (let y = -r; y <= r; y++) {
        const dx = Math.floor(Math.sqrt(r * r - y * y));
        for (let x = -dx; x <= dx; x++) {
          this.setPixel(cx + x, cy + y, color);
        }
      }
    } else {
      // Midpoint circle algorithm
      let x = r;
      let y = 0;
      let err = 0;
      while (x >= y) {
        this.setPixel(cx + x, cy + y, color);
        this.setPixel(cx + y, cy + x, color);
        this.setPixel(cx - y, cy + x, color);
        this.setPixel(cx - x, cy + y, color);
        this.setPixel(cx - x, cy - y, color);
        this.setPixel(cx - y, cy - x, color);
        this.setPixel(cx + y, cy - x, color);
        this.setPixel(cx + x, cy - y, color);
        y++;
        err += 1 + 2 * y;
        if (2 * (err - x) + 1 > 0) {
          x--;
          err += 1 - 2 * x;
        }
      }
    }
  }

  drawArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number, color: number, thickness: number = 1): void {
    const steps = Math.max(16, Math.floor(r * 0.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = startAngle + t * (endAngle - startAngle);
      const x = Math.round(cx + r * Math.cos(angle));
      const y = Math.round(cy + r * Math.sin(angle));
      if (thickness <= 1) {
        this.setPixel(x, y, color);
      } else {
        for (let dx = -Math.floor(thickness/2); dx <= Math.floor(thickness/2); dx++) {
          for (let dy = -Math.floor(thickness/2); dy <= Math.floor(thickness/2); dy++) {
            this.setPixel(x + dx, y + dy, color);
          }
        }
      }
    }
  }

  drawVerticalGradient(x: number, y: number, w: number, h: number, colorTop: number, colorBottom: number): void {
    const r1 = (colorTop >> 16) & 0xFF;
    const g1 = (colorTop >> 8) & 0xFF;
    const b1 = colorTop & 0xFF;
    const r2 = (colorBottom >> 16) & 0xFF;
    const g2 = (colorBottom >> 8) & 0xFF;
    const b2 = colorBottom & 0xFF;

    for (let yy = 0; yy < h; yy++) {
      const t = yy / (h - 1);
      const r = Math.round(r1 * (1 - t) + r2 * t);
      const g = Math.round(g1 * (1 - t) + g2 * t);
      const b = Math.round(b1 * (1 - t) + b2 * t);
      const color = (r << 16) | (g << 8) | b;
      for (let xx = 0; xx < w; xx++) {
        this.setPixel(x + xx, y + yy, color);
      }
    }
  }

  drawShadow(x: number, y: number, w: number, h: number, radius: number = 4): void {
    // Simple drop shadow - draw offset rectangles with decreasing alpha
    for (let i = radius; i > 0; i--) {
      const alpha = Math.floor(30 * (i / radius));
      const shadowColor = COLORS.cardShadow;
      this.fillRect(x + i, y + i, w, h, shadowColor);
      // Could add alpha blending here but keeping simple
    }
  }
}

// ============================================================================
// Bitmap Font (5x7 scaled)
// ============================================================================

// 5x7 font for ASCII 32-126
const FONT_5x7: number[][] = [
  // Space (32)
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  // ! (33)
  [0x10, 0x10, 0x10, 0x10, 0x10, 0x00, 0x10],
  // " (34)
  [0x28, 0x28, 0x10, 0x00, 0x00, 0x00, 0x00],
  // # (35)
  [0x28, 0x7C, 0x28, 0x7C, 0x28, 0x00, 0x00],
  // $ (36)
  [0x10, 0x38, 0x54, 0x38, 0x54, 0x38, 0x10],
  // % (37)
  [0x64, 0x68, 0x10, 0x20, 0x48, 0x94, 0x0C],
  // & (38)
  [0x10, 0x28, 0x28, 0x10, 0x2A, 0x2A, 0x1C],
  // ' (39)
  [0x10, 0x10, 0x08, 0x00, 0x00, 0x00, 0x00],
  // ( (40)
  [0x04, 0x08, 0x10, 0x10, 0x10, 0x08, 0x04],
  // ) (41)
  [0x20, 0x10, 0x08, 0x08, 0x08, 0x10, 0x20],
  // * (42)
  [0x00, 0x08, 0x10, 0x38, 0x10, 0x08, 0x00],
  // + (43)
  [0x00, 0x08, 0x08, 0x3E, 0x08, 0x08, 0x00],
  // , (44)
  [0x00, 0x00, 0x00, 0x00, 0x10, 0x10, 0x08],
  // - (45)
  [0x00, 0x00, 0x00, 0x3E, 0x00, 0x00, 0x00],
  // . (46)
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x10],
  // / (47)
  [0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80],
  // 0 (48)
  [0x3C, 0x42, 0x46, 0x4A, 0x52, 0x62, 0x3C],
  // 1 (49)
  [0x08, 0x18, 0x28, 0x08, 0x08, 0x08, 0x3E],
  // 2 (50)
  [0x3C, 0x42, 0x02, 0x0C, 0x30, 0x40, 0x7E],
  // 3 (51)
  [0x3C, 0x42, 0x02, 0x1C, 0x02, 0x42, 0x3C],
  // 4 (52)
  [0x04, 0x0C, 0x14, 0x24, 0x7E, 0x04, 0x04],
  // 5 (53)
  [0x7E, 0x40, 0x7C, 0x02, 0x02, 0x42, 0x3C],
  // 6 (54)
  [0x1C, 0x20, 0x40, 0x7C, 0x42, 0x42, 0x3C],
  // 7 (55)
  [0x7E, 0x02, 0x04, 0x08, 0x10, 0x10, 0x10],
  // 8 (56)
  [0x3C, 0x42, 0x42, 0x3C, 0x42, 0x42, 0x3C],
  // 9 (57)
  [0x3C, 0x42, 0x42, 0x3E, 0x02, 0x04, 0x38],
  // : (58)
  [0x00, 0x18, 0x18, 0x00, 0x18, 0x18, 0x00],
  // ; (59)
  [0x00, 0x18, 0x18, 0x00, 0x18, 0x18, 0x08],
  // < (60)
  [0x04, 0x08, 0x10, 0x20, 0x10, 0x08, 0x04],
  // = (61)
  [0x00, 0x00, 0x3E, 0x00, 0x3E, 0x00, 0x00],
  // > (62)
  [0x20, 0x10, 0x08, 0x04, 0x08, 0x10, 0x20],
  // ? (63)
  [0x3C, 0x42, 0x02, 0x0C, 0x10, 0x00, 0x10],
  // @ (64)
  [0x3C, 0x42, 0x5A, 0x5A, 0x5E, 0x40, 0x3C],
  // A (65)
  [0x1C, 0x22, 0x42, 0x7E, 0x42, 0x42, 0x42],
  // B (66)
  [0x7C, 0x42, 0x42, 0x7C, 0x42, 0x42, 0x7C],
  // C (67)
  [0x3C, 0x42, 0x40, 0x40, 0x40, 0x42, 0x3C],
  // D (68)
  [0x78, 0x44, 0x42, 0x42, 0x42, 0x44, 0x78],
  // E (69)
  [0x7E, 0x40, 0x40, 0x7C, 0x40, 0x40, 0x7E],
  // F (70)
  [0x7E, 0x40, 0x40, 0x7C, 0x40, 0x40, 0x40],
  // G (71)
  [0x3C, 0x42, 0x40, 0x4E, 0x42, 0x42, 0x3C],
  // H (72)
  [0x42, 0x42, 0x42, 0x7E, 0x42, 0x42, 0x42],
  // I (73)
  [0x3C, 0x10, 0x10, 0x10, 0x10, 0x10, 0x3C],
  // J (74)
  [0x1E, 0x08, 0x08, 0x08, 0x08, 0x48, 0x30],
  // K (75)
  [0x42, 0x44, 0x48, 0x70, 0x48, 0x44, 0x42],
  // L (76)
  [0x40, 0x40, 0x40, 0x40, 0x40, 0x40, 0x7E],
  // M (77)
  [0x42, 0x66, 0x5A, 0x5A, 0x42, 0x42, 0x42],
  // N (78)
  [0x42, 0x62, 0x52, 0x4A, 0x46, 0x42, 0x42],
  // O (79)
  [0x3C, 0x42, 0x42, 0x42, 0x42, 0x42, 0x3C],
  // P (80)
  [0x7C, 0x42, 0x42, 0x7C, 0x40, 0x40, 0x40],
  // Q (81)
  [0x3C, 0x42, 0x42, 0x42, 0x4A, 0x44, 0x3A],
  // R (82)
  [0x7C, 0x42, 0x42, 0x7C, 0x48, 0x44, 0x42],
  // S (83)
  [0x3C, 0x42, 0x40, 0x3C, 0x02, 0x42, 0x3C],
  // T (84)
  [0x7E, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10],
  // U (85)
  [0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x3C],
  // V (86)
  [0x42, 0x42, 0x42, 0x42, 0x42, 0x24, 0x18],
  // W (87)
  [0x42, 0x42, 0x42, 0x5A, 0x5A, 0x66, 0x42],
  // X (88)
  [0x42, 0x42, 0x24, 0x18, 0x24, 0x42, 0x42],
  // Y (89)
  [0x42, 0x42, 0x24, 0x18, 0x18, 0x18, 0x18],
  // Z (90)
  [0x7E, 0x02, 0x04, 0x08, 0x10, 0x20, 0x7E],
  // [ (91)
  [0x3C, 0x20, 0x20, 0x20, 0x20, 0x20, 0x3C],
  // \ (92)
  [0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02],
  // ] (93)
  [0x3C, 0x04, 0x04, 0x04, 0x04, 0x04, 0x3C],
  // ^ (94)
  [0x10, 0x28, 0x44, 0x00, 0x00, 0x00, 0x00],
  // _ (95)
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7E],
  // ` (96)
  [0x20, 0x10, 0x08, 0x00, 0x00, 0x00, 0x00],
  // a (97)
  [0x00, 0x00, 0x3C, 0x02, 0x3E, 0x42, 0x3E],
  // b (98)
  [0x40, 0x40, 0x7C, 0x42, 0x42, 0x42, 0x7C],
  // c (99)
  [0x00, 0x00, 0x3C, 0x42, 0x40, 0x42, 0x3C],
  // d (100)
  [0x02, 0x02, 0x3A, 0x46, 0x42, 0x42, 0x3E],
  // e (101)
  [0x00, 0x00, 0x3C, 0x42, 0x7E, 0x40, 0x3C],
  // f (102)
  [0x1C, 0x20, 0x20, 0x7C, 0x20, 0x20, 0x20],
  // g (103)
  [0x00, 0x00, 0x3E, 0x42, 0x42, 0x3E, 0x02, 0x3C], // note: 8 rows, we'll handle
  // h (104)
  [0x40, 0x40, 0x7C, 0x42, 0x42, 0x42, 0x42],
  // i (105)
  [0x10, 0x00, 0x30, 0x10, 0x10, 0x10, 0x38],
  // j (106)
  [0x08, 0x00, 0x18, 0x08, 0x08, 0x48, 0x30],
  // k (107)
  [0x40, 0x40, 0x44, 0x48, 0x70, 0x48, 0x44],
  // l (108)
  [0x30, 0x10, 0x10, 0x10, 0x10, 0x10, 0x38],
  // m (109)
  [0x00, 0x00, 0xAC, 0xD6, 0xD6, 0xD6, 0xD6],
  // n (110)
  [0x00, 0x00, 0x7C, 0x42, 0x42, 0x42, 0x42],
  // o (111)
  [0x00, 0x00, 0x3C, 0x42, 0x42, 0x42, 0x3C],
  // p (112)
  [0x00, 0x00, 0x7C, 0x42, 0x42, 0x7C, 0x40, 0x40], // 8 rows
  // q (113)
  [0x00, 0x00, 0x3E, 0x42, 0x42, 0x3E, 0x02, 0x02], // 8 rows
  // r (114)
  [0x00, 0x00, 0x7C, 0x42, 0x40, 0x40, 0x40],
  // s (115)
  [0x00, 0x00, 0x3C, 0x40, 0x3C, 0x02, 0x7C],
  // t (116)
  [0x10, 0x20, 0x7C, 0x20, 0x20, 0x24, 0x18],
  // u (117)
  [0x00, 0x00, 0x42, 0x42, 0x42, 0x46, 0x3A],
  // v (118)
  [0x00, 0x00, 0x42, 0x42, 0x42, 0x24, 0x18],
  // w (119)
  [0x00, 0x00, 0x42, 0x5A, 0x5A, 0x66, 0x24],
  // x (120)
  [0x00, 0x00, 0x42, 0x24, 0x18, 0x24, 0x42],
  // y (121)
  [0x00, 0x00, 0x42, 0x42, 0x46, 0x3E, 0x02, 0x3C], // 8 rows
  // z (122)
  [0x00, 0x00, 0x7E, 0x04, 0x08, 0x10, 0x7E],
  // { (123)
  [0x08, 0x10, 0x10, 0x20, 0x10, 0x10, 0x08],
  // | (124)
  [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10],
  // } (125)
  [0x20, 0x10, 0x10, 0x08, 0x10, 0x10, 0x20],
  // ~ (126)
  [0x00, 0x00, 0x28, 0x50, 0x00, 0x00, 0x00],
];

const FONT_WIDTH = 5;
const FONT_HEIGHT = 7;

class FontRenderer {
  private canvas: Canvas;
  private scale: number;
  private bold: boolean;

  constructor(canvas: Canvas, scale: number = 1, bold: boolean = false) {
    this.canvas = canvas;
    this.scale = scale;
    this.bold = bold;
  }

  setScale(scale: number): void { this.scale = scale; }
  setBold(bold: boolean): void { this.bold = bold; }

  drawChar(ch: string, x: number, y: number, color: number): number {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) return this.scale * FONT_WIDTH;
    const glyph = FONT_5x7[code - 32];
    if (!glyph) return this.scale * FONT_WIDTH;

    const charW = FONT_WIDTH * this.scale;
    const charH = FONT_HEIGHT * this.scale;

    for (let row = 0; row < FONT_HEIGHT; row++) {
      const bits = glyph[row];
      for (let col = 0; col < FONT_WIDTH; col++) {
        if (bits & (0x80 >> col)) {
          for (let sy = 0; sy < this.scale; sy++) {
            for (let sx = 0; sx < this.scale; sx++) {
              this.canvas.setPixel(x + col * this.scale + sx, y + row * this.scale + sy, color);
            }
          }
          if (this.bold) {
            // Draw one pixel to the right for bold effect
            for (let sy = 0; sy < this.scale; sy++) {
              for (let sx = 0; sx < this.scale; sx++) {
                this.canvas.setPixel(x + col * this.scale + sx + 1, y + row * this.scale + sy, color);
              }
            }
          }
        }
      }
    }
    return charW + (this.bold ? this.scale : 0);
  }

  drawText(text: string, x: number, y: number, color: number, maxWidth?: number): number {
    let curX = x;
    const words = text.split(' ');
    let lineStart = x;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const isLast = i === words.length - 1;
      let wordWidth = 0;
      for (const ch of word) {
        wordWidth += this.drawChar(ch, 0, 0, color); // measure
      }
      if (!isLast) wordWidth += this.scale * FONT_WIDTH; // space

      if (maxWidth && curX + wordWidth > x + maxWidth) {
        // Word wrap
        curX = x;
        y += this.scale * (FONT_HEIGHT + 1);
        if (curX !== x) continue; // re-evaluate same word
      }

      for (const ch of word) {
        curX += this.drawChar(ch, curX, y, color);
      }
      if (!isLast) {
        curX += this.scale * FONT_WIDTH;
      }
    }
    return y + this.scale * FONT_HEIGHT;
  }

  measureText(text: string): { width: number; height: number } {
    let width = 0;
    let maxWidth = 0;
    for (const ch of text) {
      if (ch === '\n') {
        maxWidth = Math.max(maxWidth, width);
        width = 0;
      } else {
        width += this.drawChar(ch, 0, 0, 0);
      }
    }
    maxWidth = Math.max(maxWidth, width);
    return { width: maxWidth, height: this.scale * FONT_HEIGHT };
  }

  drawTextMultiline(text: string, x: number, y: number, color: number, maxWidth: number, lineHeight?: number): number {
    const words = text.split(' ');
    let curX = x;
    let curY = y;
    const lh = lineHeight || this.scale * (FONT_HEIGHT + 1);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let wordWidth = 0;
      for (const ch of word) {
        wordWidth += this.drawChar(ch, 0, 0, color);
      }
      if (i < words.length - 1) wordWidth += this.scale * FONT_WIDTH;

      if (curX + wordWidth > x + maxWidth) {
        curX = x;
        curY += lh;
      }

      for (const ch of word) {
        curX += this.drawChar(ch, curX, curY, color);
      }
      if (i < words.length - 1) {
        curX += this.scale * FONT_WIDTH;
      }
    }
    return curY + lh;
  }
}

// ============================================================================
// PNG Encoder (Manual)
// ============================================================================

// CRC32 table
const CRC_TABLE: number[] = [];
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function writeUInt32BE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 24) & 0xFF;
  buf[offset + 1] = (value >>> 16) & 0xFF;
  buf[offset + 2] = (value >>> 8) & 0xFF;
  buf[offset + 3] = value & 0xFF;
}

function writeChunk(buf: Uint8Array, offset: number, type: string, data: Uint8Array): number {
  writeUInt32BE(buf, offset, data.length);
  buf[offset + 4] = type.charCodeAt(0);
  buf[offset + 5] = type.charCodeAt(1);
  buf[offset + 6] = type.charCodeAt(2);
  buf[offset + 7] = type.charCodeAt(3);
  buf.set(data, offset + 8);
  const crc = crc32(new Uint8Array([...buf.slice(offset + 4, offset + 8), ...data]));
  writeUInt32BE(buf, offset + 8 + data.length, crc);
  return 12 + data.length;
}

function encodePNG(canvas: Canvas): Uint8Array {
  const width = canvas.getWidth();
  const height = canvas.getHeight();
  const data = canvas.getData();

  // Convert RGBA to RGB scanlines with filter byte (0 = none)
  const scanlineWidth = width * 3 + 1;
  const rawData = new Uint8Array(scanlineWidth * height);

  for (let y = 0; y < height; y++) {
    rawData[y * scanlineWidth] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const dst = y * scanlineWidth + 1 + x * 3;
      rawData[dst] = data[idx];
      rawData[dst + 1] = data[idx + 1];
      rawData[dst + 2] = data[idx + 2];
    }
  }

  // Compress with zlib
  const compressed = zlib.deflateSync(rawData, { level: 9 });

  // PNG signature
  const signature = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR chunk
  const ihdrData = new Uint8Array(13);
  writeUInt32BE(ihdrData, 0, width);
  writeUInt32BE(ihdrData, 4, height);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: truecolor (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  // IDAT chunk
  const idatData = compressed;

  // IEND chunk
  const iendData = new Uint8Array(0);

  // Calculate total size
  const ihdrSize = 12 + 13;
  const idatSize = 12 + idatData.length;
  const iendSize = 12 + 0;
  const totalSize = 8 + ihdrSize + idatSize + iendSize;

  const png = new Uint8Array(totalSize);
  let offset = 0;

  // Signature
  png.set(signature, offset);
  offset += 8;

  // IHDR
  offset += writeChunk(png, offset, 'IHDR', ihdrData);

  // IDAT
  offset += writeChunk(png, offset, 'IDAT', idatData);

  // IEND
  offset += writeChunk(png, offset, 'IEND', iendData);

  return png;
}

// ============================================================================
// Main Drawing Logic
// ============================================================================

function loadNewsData(): NewsItem[] {
  const data = fs.readFileSync(path.join(process.cwd(), 'news-data.json'), 'utf-8');
  return JSON.parse(data);
}

function drawMasthead(canvas: Canvas): void {
  // Background
  canvas.fillRect(0, 0, WIDTH, 106, COLORS.mastheadBg);

  // Red accent line at bottom
  canvas.fillRect(0, 106, WIDTH, 3, COLORS.accentRed);

  // Date badge (left)
  const badgeX = 24;
  const badgeY = 12;
  // Red "NOV"
  const font = new FontRenderer(canvas, 2, true);
  font.drawText('NOV', badgeX, badgeY, COLORS.accentRed);
  // Large "19"
  const fontBig = new FontRenderer(canvas, 5, true);
  fontBig.drawText('19', badgeX, badgeY + 22, COLORS.accentRed);
  // "THU 26"
  const fontSmall = new FontRenderer(canvas, 1.5, true);
  fontSmall.drawText('THU 26', badgeX, badgeY + 62, COLORS.accentRed);

  // Title (center)
  const titleFont = new FontRenderer(canvas, 3, true);
  const title = 'THURSDAY 19 NOVEMBER 2026';
  const titleWidth = title.length * 5 * 3;
  titleFont.drawText(title, (WIDTH - titleWidth) / 2, 20, COLORS.white);

  // Subtitle
  const subFont = new FontRenderer(canvas, 1.5, false);
  const subTitle = "THE WORLD'S NEWS IN ONE IMAGE";
  const subWidth = subTitle.length * 5 * 1.5;
  subFont.drawText(subTitle, (WIDTH - subWidth) / 2, 56, COLORS.cream);

  // Right side stats
  const rightFont = new FontRenderer(canvas, 1.2, false);
  const stats = ['16 STORIES', '7 REGIONS', 'ONE PAGE'];
  for (let i = 0; i < stats.length; i++) {
    const str = stats[i];
    const w = str.length * 5 * 1.2;
    rightFont.drawText(str, WIDTH - w - 24, 20 + i * 22, COLORS.cream);
  }
}

function drawRegionDistribution(canvas: Canvas): void {
  const y = 106;
  const h = 24;
  let x = 0;
  const totalStories = 16;

  for (const region of REGIONS) {
    const w = Math.round((region.count / totalStories) * WIDTH);
    canvas.fillRect(x, y, w, h, region.color);
    // Label
    const font = new FontRenderer(canvas, 1, true);
    const label = `${region.shortName} ${region.count}`;
    const labelW = label.length * 5;
    const labelX = x + Math.max(4, (w - labelW) / 2);
    font.drawText(label, labelX, y + 6, COLORS.white);
    x += w;
  }
}

function drawDayInNumbers(canvas: Canvas): void {
  const y = 130;
  const h = 52;
  canvas.fillRect(0, y, WIDTH, h, COLORS.distBg);

  const fontLabel = new FontRenderer(canvas, 1, true);
  const fontValue = new FontRenderer(canvas, 1.8, true);
  const fontDetail = new FontRenderer(canvas, 0.9, false);

  const itemWidth = WIDTH / 5;

  for (let i = 0; i < KPI_ITEMS.length; i++) {
    const item = KPI_ITEMS[i];
    const x = i * itemWidth + 20;

    // Colored dot
    canvas.fillRect(x, y + 12, 8, 8, item.regionColor);

    // Value
    fontValue.drawText(item.label, x + 14, y + 6, item.regionColor);
    // Detail
    fontDetail.drawText(item.detail, x + 14, y + 28, COLORS.mutedInk);
  }
}

function drawHeroCard(canvas: Canvas, index: number, story: NewsItem, regionColor: number, x: number, y: number): void {
  const cardW = 320;
  const cardH = 214;
  const illusH = 72;

  // Shadow
  canvas.fillRect(x + 3, y + 3, cardW, cardH, COLORS.cardShadow);
  // Card background
  canvas.fillRect(x, y, cardW, cardH, COLORS.cardBg);
  // Border
  canvas.drawRect(x, y, cardW, cardH, COLORS.cardBorder);

  // Illustration area
  const illusY = y + 4;
  const illusX = x + 4;
  const illusW = cardW - 8;

  drawHeroIllustration(canvas, index, illusX, illusY, illusW, illusH, regionColor);

  // Content below illustration
  const contentY = y + illusH + 8;

  // Number + region
  const fontNum = new FontRenderer(canvas, 1.2, true);
  const fontRegion = new FontRenderer(canvas, 1, true);
  fontNum.drawText(`${index + 1}.`, illusX, contentY, COLORS.titleInk);
  fontRegion.drawText(REGIONS.find(r => r.color === regionColor)?.shortName || '', illusX + 24, contentY, regionColor);

  // Topic badge
  const badgeFont = new FontRenderer(canvas, 0.85, true);
  const badgeText = TOPIC_BADGES[index];
  const badgeW = badgeText.length * 5 * 0.85 + 8;
  canvas.fillRect(illusX, contentY + 18, badgeW, 14, regionColor);
  badgeFont.drawText(badgeText, illusX + 4, contentY + 20, COLORS.white);

  // Title
  const titleFont = new FontRenderer(canvas, 1.6, true);
  titleFont.drawTextMultiline(story.title, illusX, contentY + 36, COLORS.titleInk, illusW - 4, 22);

  // Summary
  const bodyFont = new FontRenderer(canvas, 1.1, false);
  bodyFont.drawTextMultiline(story.summary, illusX, contentY + 80, COLORS.bodyInk, illusW - 4, 16);
}

function drawHeroIllustration(canvas: Canvas, index: number, x: number, y: number, w: number, h: number, regionColor: number): void {
  const cx = x + w / 2;
  const cy = y + h / 2;

  switch (index) {
    case 0: // Shenzhen Summit - three flags + building silhouette
      drawSummitIllustration(canvas, x, y, w, h);
      break;
    case 1: // Riyadh missile interception
      drawRiyadhIllustration(canvas, x, y, w, h);
      break;
    case 2: // Voyager 1
      drawVoyagerIllustration(canvas, x, y, w, h);
      break;
  }
}

function drawSummitIllustration(canvas: Canvas, x: number, y: number, w: number, h: number): void {
  const cx = x + w / 2;
  // Building silhouette
  const bx = x + 20;
  const by = y + h - 40;
  canvas.fillRect(bx, by - 30, w - 40, 30, COLORS.mutedInk);
  // Windows
  for (let i = 0; i < 5; i++) {
    canvas.fillRect(bx + 10 + i * 40, by - 25, 8, 20, COLORS.cream);
  }
  // Three flags
  const flagColors = [COLORS.asiaPacific, COLORS.world, 0xFFFFFF]; // China, US, Russia (simplified)
  const flagX = [cx - 40, cx, cx + 40];
  for (let i = 0; i < 3; i++) {
    const fx = flagX[i];
    // Pole
    canvas.drawLine(fx, y + 10, fx, by - 5, COLORS.mutedInk);
    // Flag
    canvas.fillRect(fx, y + 10, 25, 15, flagColors[i]);
    if (i === 2) {
      // Russia flag stripes
      canvas.fillRect(fx, y + 10, 25, 5, 0xFFFFFF);
      canvas.fillRect(fx, y + 15, 25, 5, 0x0033A0);
      canvas.fillRect(fx, y + 20, 25, 5, 0xDA291C);
    }
  }
}

function drawRiyadhIllustration(canvas: Canvas, x: number, y: number, w: number, h: number): void {
  // Tall tower
  const tx = x + w / 2;
  const ty = y + h - 10;
  // Tower body
  canvas.fillRect(tx - 8, y + 15, 16, h - 30, 0x888888);
  // Tower top
  canvas.fillPolygon([
    { x: tx - 12, y: y + 15 },
    { x: tx, y: y + 5 },
    { x: tx + 12, y: y + 15 },
  ], 0xAAAAAA);

  // Missile trail (red arc from top-right)
  canvas.drawArc(x + w - 10, y + 10, 50, Math.PI * 0.8, Math.PI * 1.4, COLORS.accentRed, 3);
  // Interception arc (cyan)
  canvas.drawArc(tx, ty, 35, Math.PI * 1.2, Math.PI * 1.8, 0x00FFFF, 3);
  // Flash
  canvas.drawCircle(tx - 15, y + 25, 8, 0xFFFF00, true);
  canvas.drawCircle(tx - 15, y + 25, 4, 0xFFFFFF, true);
}

function drawVoyagerIllustration(canvas: Canvas, x: number, y: number, w: number, h: number): void {
  // Starfield
  for (let i = 0; i < 30; i++) {
    const sx = x + Math.random() * w;
    const sy = y + Math.random() * h;
    canvas.setPixel(Math.round(sx), Math.round(sy), COLORS.white);
  }
  // Earth (small blue dot)
  canvas.drawCircle(x + 30, y + h - 30, 6, 0x0066CC, true);
  canvas.drawCircle(x + 30, y + h - 30, 3, 0x44AAFF, true);

  // Radio signal arc
  canvas.drawArc(x + 30, y + h - 30, 40, -Math.PI * 0.3, Math.PI * 0.3, 0x00FFFF, 2);
  canvas.drawArc(x + 30, y + h - 30, 60, -Math.PI * 0.3, Math.PI * 0.3, 0x00AAAA, 1);

  // Voyager spacecraft (parabolic dish + boom)
  const vx = x + w - 40;
  const vy = y + 30;
  // Dish
  canvas.drawArc(vx, vy, 15, -Math.PI * 0.6, Math.PI * 0.6, 0xCCCCCC, 2);
  // Boom
  canvas.drawLine(vx, vy, vx - 35, vy, 0xCCCCCC);
  // Body
  canvas.fillRect(vx - 35, vy - 4, 20, 8, 0x888888);
  // RTG
  canvas.fillRect(vx - 40, vy - 2, 8, 12, 0x666666);
}

function drawGridCards(canvas: Canvas, stories: NewsItem[], startIndex: number): void {
  const startY = 412;
  const cardW = 320;
  const cardH = 103;
  const gapX = 12;
  const gapY = 8;
  const cols = 3;
  const rows = 4;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = startIndex + row * cols + col;
      if (idx >= stories.length) break;

      const x = 24 + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      const story = stories[idx];
      const region = REGIONS.find(r => r.name === story.region);
      const regionColor = region?.color || COLORS.world;

      drawGridCard(canvas, idx, story, regionColor, x, y, cardW, cardH);
    }
  }
}

function drawGridCard(canvas: Canvas, index: number, story: NewsItem, regionColor: number, x: number, y: number, w: number, h: number): void {
  // Shadow
  canvas.fillRect(x + 2, y + 2, w, h, COLORS.cardShadow);
  // Background
  canvas.fillRect(x, y, w, h, COLORS.cardBg);
  // Border
  canvas.drawRect(x, y, w, h, COLORS.cardBorder);

  // Region color strip (left)
  canvas.fillRect(x, y, 6, h, regionColor);

  const contentX = x + 14;
  const contentY = y + 6;
  const contentW = w - 20;

  // Number + region
  const fontNum = new FontRenderer(canvas, 1.1, true);
  const fontRegion = new FontRenderer(canvas, 0.9, true);
  fontNum.drawText(`${index + 1}.`, contentX, contentY, COLORS.titleInk);
  const region = REGIONS.find(r => r.color === regionColor);
  fontRegion.drawText(region?.shortName || '', contentX + 22, contentY, regionColor);

  // Topic badge
  const badgeFont = new FontRenderer(canvas, 0.75, true);
  const badgeText = TOPIC_BADGES[index];
  const badgeW = badgeText.length * 5 * 0.75 + 6;
  canvas.fillRect(contentX, contentY + 16, badgeW, 12, regionColor);
  badgeFont.drawText(badgeText, contentX + 3, contentY + 17, COLORS.white);

  // Title (max 2 lines)
  const titleFont = new FontRenderer(canvas, 1.3, true);
  titleFont.drawTextMultiline(story.title, contentX, contentY + 32, COLORS.titleInk, contentW, 18);

  // Summary (max 2-3 lines)
  const bodyFont = new FontRenderer(canvas, 0.95, false);
  bodyFont.drawTextMultiline(story.summary, contentX, contentY + 62, COLORS.bodyInk, contentW, 14);

  // Micro-chart for some cards (near badge)
  if ([4, 7, 8, 10, 12, 14].includes(index)) {
    drawMicroChart(canvas, x + w - 50, y + 8, 40, 30, index);
  }
}

function drawMicroChart(canvas: Canvas, x: number, y: number, w: number, h: number, type: number): void {
  const ctx = canvas;
  switch (type) {
    case 4: // $20M - rising line
      ctx.drawLine(x, y + h, x + w, y, COLORS.asiaPacific);
      ctx.drawLine(x + w, y, x + w, y + h, COLORS.asiaPacific);
      break;
    case 7: // 1,000+ - bars
      for (let i = 0; i < 4; i++) {
        const bh = 5 + i * 6;
        ctx.fillRect(x + i * 10, y + h - bh, 6, bh, COLORS.europe);
      }
      break;
    case 8: // Kerch - pulse
      ctx.drawLine(x, y + h/2, x + w, y + h/2, COLORS.europe);
      for (let i = 0; i < 3; i++) {
        ctx.drawLine(x + i * 13, y + h/2 - 5, x + i * 13, y + h/2 + 5, COLORS.europe);
      }
      break;
    case 10: // Cyber - jagged
      ctx.drawLine(x, y + h, x + w/3, y, COLORS.middleEast);
      ctx.drawLine(x + w/3, y, x + 2*w/3, y + h, COLORS.middleEast);
      ctx.drawLine(x + 2*w/3, y + h, x + w, y, COLORS.middleEast);
      break;
    case 12: // Strike - flat then up
      ctx.drawLine(x, y + h, x + w/2, y + h, COLORS.americas);
      ctx.drawLine(x + w/2, y + h, x + w, y, COLORS.americas);
      break;
    case 14: // Envoy - dots
      for (let i = 0; i < 5; i++) {
        ctx.drawCircle(x + i * 8 + 4, y + h/2, 2, COLORS.africa, true);
      }
      break;
  }
}

function drawWorldMapPanel(canvas: Canvas): void {
  const panelX = 24;
  const panelY = 856;
  const panelW = 652;
  const panelH = 104;

  // Panel background
  canvas.fillRect(panelX, panelY, panelW, panelH, COLORS.cardBg);
  canvas.drawRect(panelX, panelY, panelW, panelH, COLORS.cardBorder);

  // Title
  const font = new FontRenderer(canvas, 1.2, true);
  font.drawText('WHERE IT HAPPENED', panelX + 12, panelY + 8, COLORS.titleInk);

  // Simplified world map - continents as polygons
  const mapX = panelX + 12;
  const mapY = panelY + 28;
  const mapW = panelW - 24;
  const mapH = panelH - 40;

  // Ocean background
  canvas.fillRect(mapX, mapY, mapW, mapH, COLORS.ocean);

  // Continents (simplified polygons)
  // North America
  drawContinent(canvas, [
    { x: mapX + 20, y: mapY + 30 },
    { x: mapX + 100, y: mapY + 20 },
    { x: mapX + 120, y: mapY + 60 },
    { x: mapX + 80, y: mapY + 80 },
    { x: mapX + 30, y: mapY + 70 },
  ], COLORS.land);

  // South America
  drawContinent(canvas, [
    { x: mapX + 50, y: mapY + 80 },
    { x: mapX + 80, y: mapY + 100 },
    { x: mapX + 70, y: mapY + 140 },
    { x: mapX + 40, y: mapY + 130 },
  ], COLORS.land);

  // Europe
  drawContinent(canvas, [
    { x: mapX + 160, y: mapY + 20 },
    { x: mapX + 220, y: mapY + 15 },
    { x: mapX + 230, y: mapY + 50 },
    { x: mapX + 170, y: mapY + 55 },
  ], COLORS.land);

  // Africa
  drawContinent(canvas, [
    { x: mapX + 180, y: mapY + 50 },
    { x: mapX + 220, y: mapY + 45 },
    { x: mapX + 210, y: mapY + 110 },
    { x: mapX + 170, y: mapY + 115 },
  ], COLORS.land);

  // Asia
  drawContinent(canvas, [
    { x: mapX + 220, y: mapY + 15 },
    { x: mapX + 300, y: mapY + 10 },
    { x: mapX + 310, y: mapY + 60 },
    { x: mapX + 280, y: mapY + 70 },
    { x: mapX + 230, y: mapY + 50 },
  ], COLORS.land);

  // Australia
  drawContinent(canvas, [
    { x: mapX + 290, y: mapY + 90 },
    { x: mapX + 320, y: mapY + 85 },
    { x: mapX + 315, y: mapY + 120 },
    { x: mapX + 285, y: mapY + 125 },
  ], COLORS.land);

  // Antarctica
  canvas.fillRect(mapX + 10, mapY + 130, mapW - 20, 10, COLORS.land);

  // Story markers (1-16)
  const markerPositions: Point[] = [
    { x: mapX + 250, y: mapY + 35 }, // 1 Shenzhen
    { x: mapX + 200, y: mapY + 45 }, // 2 Riyadh
    { x: mapX + 350, y: mapY + 10 }, // 3 Voyager (special)
    { x: mapX + 230, y: mapY + 40 }, // 4 Myanmar
    { x: mapX + 250, y: mapY + 35 }, // 5 Shenzhen
    { x: mapX + 300, y: mapY + 100 }, // 6 Tonga
    { x: mapX + 270, y: mapY + 25 }, // 7 North Korea
    { x: mapX + 180, y: mapY + 30 }, // 8 Berlin
    { x: mapX + 220, y: mapY + 40 }, // 9 Kerch
    { x: mapX + 185, y: mapY + 25 }, // 10 Brussels
    { x: mapX + 205, y: mapY + 45 }, // 11 Gulf
    { x: mapX + 60, y: mapY + 85 }, // 12 Guatemala
    { x: mapX + 55, y: mapY + 110 }, // 13 Colombia
    { x: mapX + 180, y: mapY + 85 }, // 14 Senegal
    { x: mapX + 195, y: mapY + 75 }, // 15 Somalia
    { x: mapX + 100, mapY: mapY + 135 }, // 16 Antarctica
  ];

  for (let i = 0; i < markerPositions.length; i++) {
    const pos = markerPositions[i];
    if (i === 2) {
      // Special Voyager label
      const font = new FontRenderer(canvas, 0.8, true);
      font.drawText('3->VOYAGER', mapX + mapW - 80, mapY + 4, COLORS.science);
    } else {
      const story = REGIONS.find(r => r.name === (i < 16 ? ['World','Middle East','Science','World','Asia-Pacific','Asia-Pacific','Asia-Pacific','Europe','Europe','Europe','Middle East','Americas','Americas','Africa','Africa','Science'][i] : 'World'));
      const color = story?.color || COLORS.world;
      canvas.drawCircle(pos.x, pos.y, 5, color, true);
      canvas.drawCircle(pos.x, pos.y, 2, COLORS.white, true);
      // Number
      const numFont = new FontRenderer(canvas, 0.6, true);
      numFont.drawText(`${i + 1}`, pos.x - 2, pos.y - 8, color);
    }
  }

  // Story 16 card on the right
  const cardX = panelX + panelW + 12;
  const cardY = panelY;
  const cardW = WIDTH - cardX - 24;
  const cardH = panelH;

  const story16 = stories[15];
  const region16 = REGIONS.find(r => r.name === story16.region);
  drawGridCard(canvas, 15, story16, region16?.color || COLORS.science, cardX, cardY, cardW, cardH);
}

function drawContinent(canvas: Canvas, points: Point[], color: number): void {
  canvas.fillPolygon(points, color);
}

function drawFooter(canvas: Canvas): void {
  const y = 968;
  const h = 56;

  // Separator line
  canvas.fillRect(24, y, WIDTH - 48, 1, COLORS.footerLine);

  // Region color legend
  const legendY = y + 12;
  let legendX = (WIDTH - (REGIONS.length * 100)) / 2;

  const font = new FontRenderer(canvas, 0.9, false);

  for (const region of REGIONS) {
    // Color square
    canvas.fillRect(legendX, legendY, 12, 12, region.color);
    // Label
    font.drawText(region.shortName, legendX + 16, legendY + 2, COLORS.mutedInk);
    legendX += 100;
  }

  // Credit line
  const creditFont = new FontRenderer(canvas, 0.8, false);
  const credit = 'THURSDAY 19 NOVEMBER 2026 | WORLD NEWS SUMMARY | 16 VERIFIED STORIES';
  const creditW = credit.length * 5 * 0.8;
  creditFont.drawText(credit, (WIDTH - creditW) / 2, y + 36, COLORS.mutedInk);
}

// Need to access stories in drawWorldMapPanel
let stories: NewsItem[] = [];

function main(): void {
  stories = loadNewsData();

  const canvas = new Canvas(WIDTH, HEIGHT, COLORS.paper);

  // Draw all sections
  drawMasthead(canvas);
  drawRegionDistribution(canvas);
  drawDayInNumbers(canvas);

  // Hero cards (stories 0-2)
  for (let i = 0; i < 3; i++) {
    const x = 24 + i * (320 + 12);
    const region = REGIONS.find(r => r.name === stories[i].region);
    drawHeroCard(canvas, i, stories[i], region?.color || COLORS.world, x, 190);
  }

  // Grid cards (stories 3-14)
  drawGridCards(canvas, stories, 3);

  // World map panel + story 16
  drawWorldMapPanel(canvas);

  // Footer
  drawFooter(canvas);

  // Encode and write PNG
  const png = encodePNG(canvas);

  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(path.join(outputDir, 'entry.png'), png);
  console.log(`PNG written: ${png.length} bytes`);
}

main();