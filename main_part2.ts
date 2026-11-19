function sanitizeAscii(input: string): string {
  const map: Record<string, string> = {
    "‘": "'", "’": "'", "“": "\"", "”": "\"",
    "–": "-", "—": "-", "…": "...", "•": "|",
    "€": "EUR ", "£": "GBP ", "ñ": "n", "Ñ": "N",
    "é": "e", "è": "e", "ê": "e", "á": "a",
    "à": "a", "í": "i", "ó": "o", "ú": "u",
    "ü": "u", "ç": "c",
  };
  let out = "";
  for (const ch of input) {
    const rep = map[ch] ?? ch;
    for (const c of rep) {
      const code = c.charCodeAt(0);
      out += code >= 32 && code <= 126 ? c : " ";
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

function lerpColor(a: ColorRGB, b: ColorRGB, t: number): ColorRGB {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  };
}

class CanvasRGB {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number, bg: ColorRGB) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 3);
    this.fillRect(0, 0, width, height, bg);
  }

  private inClip(x: number, y: number, clip?: Rect): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    if (!clip) return true;
    return x >= clip.x && x < clip.x + clip.w && y >= clip.y && y < clip.y + clip.h;
  }

  setPixel(x: number, y: number, c: ColorRGB, clip?: Rect): void {
    const ix = x | 0;
    const iy = y | 0;
    if (!this.inClip(ix, iy, clip)) return;
    const idx = (iy * this.width + ix) * 3;
    this.data[idx] = c.r;
    this.data[idx + 1] = c.g;
    this.data[idx + 2] = c.b;
  }

  blendPixel(x: number, y: number, c: ColorRGB, alpha: number, clip?: Rect): void {
    if (alpha <= 0) return;
    if (alpha >= 1) {
      this.setPixel(x, y, c, clip);
      return;
    }
    const ix = x | 0;
    const iy = y | 0;
    if (!this.inClip(ix, iy, clip)) return;
    const idx = (iy * this.width + ix) * 3;
    const inv = 1 - alpha;
    this.data[idx] = Math.round(this.data[idx] * inv + c.r * alpha);
    this.data[idx + 1] = Math.round(this.data[idx + 1] * inv + c.g * alpha);
    this.data[idx + 2] = Math.round(this.data[idx + 2] * inv + c.b * alpha);
  }

  fillRect(x: number, y: number, w: number, h: number, c: ColorRGB): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.floor(x + w));
    const y1 = Math.min(this.height, Math.floor(y + h));
    for (let py = y0; py < y1; py++) {
      let idx = (py * this.width + x0) * 3;
      for (let px = x0; px < x1; px++) {
        this.data[idx] = c.r;
        this.data[idx + 1] = c.g;
        this.data[idx + 2] = c.b;
        idx += 3;
      }
    }
  }

  fillGradV(x: number, y: number, w: number, h: number, top: ColorRGB, bot: ColorRGB): void {
    for (let dy = 0; dy < h; dy++) {
      const c = lerpColor(top, bot, dy / Math.max(1, h - 1));
      this.fillRect(x, y + dy, w, 1, c);
    }
  }

  strokeRect(x: number, y: number, w: number, h: number, c: ColorRGB, t = 1): void {
    this.fillRect(x, y, w, t, c);
    this.fillRect(x, y + h - t, w, t, c);
    this.fillRect(x, y, t, h, c);
    this.fillRect(x + w - t, y, t, h, c);
  }

  fillCircleAA(cx: number, cy: number, r: number, c: ColorRGB, alpha = 1, clip?: Rect): void {
    const x0 = Math.floor(cx - r - 1);
    const y0 = Math.floor(cy - r - 1);
    const x1 = Math.ceil(cx + r + 1);
    const y1 = Math.ceil(cy + r + 1);
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dist = Math.hypot(px + 0.5 - cx, py + 0.5 - cy) - r;
        if (dist < 0.75) {
          const cov = Math.max(0, Math.min(1, 0.75 - dist));
          this.blendPixel(px, py, c, cov * alpha, clip);
        }
      }
    }
  }

  drawLineAA(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    radius: number,
    c: ColorRGB,
    alpha = 1,
    clip?: Rect
  ): void {
    const minX = Math.floor(Math.min(x0, x1) - radius - 1);
    const maxX = Math.ceil(Math.max(x0, x1) + radius + 1);
    const minY = Math.floor(Math.min(y0, y1) - radius - 1);
    const maxY = Math.ceil(Math.max(y0, y1) + radius + 1);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const lenSq = dx * dx + dy * dy;

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        let t = 0;
        if (lenSq > 0) {
          t = Math.max(0, Math.min(1, ((px + 0.5 - x0) * dx + (py + 0.5 - y0) * dy) / lenSq));
        }
        const nx = x0 + t * dx;
        const ny = y0 + t * dy;
        const dist = Math.hypot(px + 0.5 - nx, py + 0.5 - ny) - radius;
        if (dist < 0.75) {
          const cov = Math.max(0, Math.min(1, 0.75 - dist));
          this.blendPixel(px, py, c, cov * alpha, clip);
        }
      }
    }
  }

  fillPolygon(pts: Array<[number, number]>, c: ColorRGB, clip?: Rect): void {
    if (pts.length < 3) return;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const yStart = Math.max(clip ? clip.y : 0, Math.floor(minY));
    const yEnd = Math.min(clip ? clip.y + clip.h - 1 : this.height - 1, Math.ceil(maxY));

    for (let py = yStart; py <= yEnd; py++) {
      const scanY = py + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= scanY && y2 > scanY) || (y2 <= scanY && y1 > scanY)) {
          const ix = x1 + ((scanY - y1) * (x2 - x1)) / (y2 - y1);
          xs.push(ix);
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xStart = Math.max(clip ? clip.x : 0, Math.floor(xs[i]));
        const xEnd = Math.min(clip ? clip.x + clip.w - 1 : this.width - 1, Math.ceil(xs[i + 1]));
        for (let px = xStart; px <= xEnd; px++) {
          this.setPixel(px, py, c, clip);
        }
      }
    }
  }
}

function getGlyph(ch: string): string[] {
  return GLYPHS_14[ch] ?? GLYPHS_14[" "];
}

function glyphAdvance(ch: string, scale: number, tracking: number, bold = false): number {
  return getGlyph(ch)[0].length * scale + tracking + (bold ? 0.8 : 0);
}

function measureText(text: string, scale: number, tracking = 1, bold = false): number {
  if (!text.length) return 0;
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    total += glyphAdvance(text[i], scale, i < text.length - 1 ? tracking : 0, bold);
  }
  return total;
}

function sampleGlyph(glyph: string[], sx: number, sy: number): number {
  if (sx < 0 || sy < 0 || sx >= glyph[0].length || sy >= glyph.length) return 0;
  return glyph[sy][sx] === "#" ? 1 : 0;
}

function drawGlyph(
  canvas: CanvasRGB,
  ch: string,
  dx: number,
  dy: number,
  scale: number,
  color: ColorRGB,
  clip?: Rect,
  bold = false
): void {
  const glyph = getGlyph(ch);
  const gw = glyph[0].length;
  const gh = glyph.length;

  if (scale === 1 && !bold) {
    for (let sy = 0; sy < gh; sy++) {
      const row = glyph[sy];
      for (let sx = 0; sx < gw; sx++) {
        if (row[sx] === "#") canvas.setPixel(dx + sx, dy + sy, color, clip);
      }
    }
    return;
  }

  const outW = Math.ceil(gw * scale) + (bold ? 1 : 0);
  const outH = Math.ceil(gh * scale);
  const sub = 3;

  for (let py = 0; py < outH; py++) {
    for (let px = 0; px < outW; px++) {
      let hits = 0;
      for (let ay = 0; ay < sub; ay++) {
        for (let ax = 0; ax < sub; ax++) {
          const sx = Math.floor((px + (ax + 0.5) / sub) / scale);
          const sy = Math.floor((py + (ay + 0.5) / sub) / scale);
          let val = sampleGlyph(glyph, sx, sy);
          if (bold && val === 0) {
            const sxPrev = Math.floor((px - 0.75 + (ax + 0.5) / sub) / scale);
            val = sampleGlyph(glyph, sxPrev, sy);
          }
          hits += val;
        }
      }
      if (hits > 0) {
        const rawAlpha = hits / (sub * sub);
        const alpha = Math.min(1, rawAlpha * (scale >= 2 ? 1.15 : 1.25));
        canvas.blendPixel(dx + px, dy + py, color, alpha, clip);
      }
    }
  }
}

function drawText(
  canvas: CanvasRGB,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: ColorRGB,
  tracking = 1,
  clip?: Rect,
  bold = false
): void {
  let cx = x;
  const cy = Math.round(y);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    drawGlyph(canvas, ch, Math.round(cx), cy, scale, color, clip, bold);
    cx += glyphAdvance(ch, scale, tracking, bold);
  }
}

function wrapText(
  text: string,
  maxWidth: number,
  scale: number,
  tracking: number,
  maxLines: number,
  bold = false
): string[] {
  const clean = sanitizeAscii(text);
  const words = clean.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureText(candidate, scale, tracking, bold) <= maxWidth) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
        current = word;
      } else {
        let part = "";
        for (const ch of word) {
          if (measureText(part + ch, scale, tracking, bold) <= maxWidth) part += ch;
          else break;
        }
        lines.push(part || word.slice(0, 1));
        current = word.slice(part.length);
      }
      if (lines.length === maxLines) break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  } else if (current && lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (last.length > 0 && measureText(last + "...", scale, tracking, bold) > maxWidth) {
      last = last.slice(0, -1).trimEnd();
    }
    lines[maxLines - 1] = last + "...";
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (measureText(line, scale, tracking, bold) > maxWidth) {
      while (line.length > 0 && measureText(line + "...", scale, tracking, bold) > maxWidth) {
        line = line.slice(0, -1).trimEnd();
      }
      lines[i] = line + "...";
    }
  }
  return lines.slice(0, maxLines);
}

// =====================================================================
// EDITORIAL MASTHEAD, REGION BAR & NUMBERS STRIP
// =====================================================================