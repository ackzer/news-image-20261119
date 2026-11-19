function drawMasthead(canvas: CanvasRGB, news: NewsItem[]): void {
  canvas.fillRect(0, 0, WIDTH, 106, HEADER_BG);
  canvas.fillRect(0, 103, WIDTH, 3, CRIMSON);

  // Left crimson calendar badge
  const bx = 20;
  const by = 12;
  const bw = 72;
  const bh = 80;
  canvas.fillRect(bx, by, bw, bh, CRIMSON);
  canvas.strokeRect(bx, by, bw, bh, { r: 235, g: 130, b: 130 }, 1);
  const novW = measureText("NOV", 1, 1);
  drawText(canvas, "NOV", bx + (bw - novW) / 2, by + 7, 1, WHITE, 1);
  const d19W = measureText("19", 2.5, 1, true);
  drawText(canvas, "19", bx + (bw - d19W) / 2, by + 23, 2.5, WHITE, 1, undefined, true);
  const thuW = measureText("THU 26", 1, 1);
  drawText(canvas, "THU 26", bx + (bw - thuW) / 2, by + 61, 1, { r: 255, g: 225, b: 225 }, 1);

  // Main Masthead + Subtitle
  drawText(canvas, "THURSDAY 19 NOVEMBER 2026", 108, 16, 2.8, WHITE, 2, { x: 106, y: 10, w: 730, h: 48 }, true);
  drawText(canvas, "THE WORLD'S NEWS IN ONE IMAGE", 108, 63, 1.5, CREAM, 2, { x: 106, y: 58, w: 730, h: 30 });

  // Right edition stats
  const rx = 860;
  drawText(canvas, "16 STORIES", rx, 16, 1, WHITE, 1);
  drawText(canvas, " 7 REGIONS", rx, 39, 1, CREAM, 1);
  drawText(canvas, "  ONE PAGE", rx, 62, 1, { r: 160, g: 175, b: 192 }, 1);

  // Segmented regional distribution bar (y = 106..130)
  const counts: Record<string, number> = {};
  for (const r of REGION_ORDER) counts[r] = 0;
  for (const n of news) counts[n.region] = (counts[n.region] ?? 0) + 1;

  let curX = 0;
  const total = news.length;
  for (let i = 0; i < REGION_ORDER.length; i++) {
    const reg = REGION_ORDER[i];
    const cnt = counts[reg] || 0;
    const segW = i === REGION_ORDER.length - 1 ? WIDTH - curX : Math.round((cnt / total) * WIDTH);
    const col = REGION_COLORS[reg];
    canvas.fillRect(curX, 106, segW, 24, col);
    if (i > 0) canvas.fillRect(curX, 106, 1, 24, WHITE);

    const lbl = `${REGION_SHORT[reg]} ${cnt}`;
    const lw = measureText(lbl, 1, 1);
    if (lw + 8 < segW) {
      drawText(canvas, lbl, curX + (segW - lw) / 2, 112, 1, WHITE, 1);
    }
    curX += segW;
  }

  // "THE DAY IN NUMBERS" KPI strip (y = 130..182)
  canvas.fillRect(0, 130, WIDTH, 52, BG_STRIP);
  canvas.fillRect(0, 181, WIDTH, 1, CARD_BORDER);

  drawText(canvas, "DAY IN", 20, 139, 1, CRIMSON, 1);
  drawText(canvas, "NUMBERS", 20, 157, 1, CRIMSON, 1);
  canvas.fillRect(92, 136, 1, 40, CARD_BORDER);

  const kpis: Array<{ val: string; desc: string; color: ColorRGB }> = [
    { val: "$20M", desc: "Xi APEC trade fund", color: REGION_COLORS["Asia-Pacific"] },
    { val: "25.9B km", desc: "Voyager 1 light-day", color: REGION_COLORS["Science"] },
    { val: "1,000+", desc: "UK drones to Kyiv", color: REGION_COLORS["Europe"] },
    { val: "3.1%", desc: "IMF 2026 AI growth", color: REGION_COLORS["World"] },
    { val: "15,000", desc: "Antarctic cliffs", color: REGION_COLORS["Science"] },
  ];

  const colStart = 104;
  const colW = Math.floor((WIDTH - 20 - colStart) / kpis.length);
  for (let i = 0; i < kpis.length; i++) {
    const kx = colStart + i * colW;
    if (i > 0) canvas.fillRect(kx - 8, 138, 1, 36, CARD_BORDER);
    drawText(canvas, kpis[i].val, kx, 136, 1.5, kpis[i].color, 1, { x: kx, y: 134, w: colW - 10, h: 24 }, true);
    drawText(canvas, kpis[i].desc, kx, 162, 1, INK_BODY, 1, { x: kx, y: 160, w: colW - 10, h: 16 });
  }
}

// =====================================================================
// PROCEDURAL HERO ILLUSTRATIONS (DETERMINISTIC, VECTOR-SMOOTH)
// =====================================================================

function drawHeroArtSummit(canvas: CanvasRGB, box: Rect): void {
  const clip = box;
  canvas.fillGradV(box.x, box.y, box.w, box.h, { r: 244, g: 208, b: 136 }, { r: 222, g: 165, b: 92 });
  // Distant Shenzhen skyline silhouettes
  const skyCol: ColorRGB = { r: 175, g: 134, b: 84 };
  const blds = [
    [12, 34, 24], [40, 26, 20], [64, 42, 18], [86, 20, 22],
    [220, 28, 22], [248, 44, 26], [280, 24, 20], [302, 36, 16],
  ];
  for (const [bx, bh, bw] of blds) {
    canvas.fillRect(box.x + bx, box.y + box.h - bh - 12, bw, bh, skyCol);
  }
  // Stage & podium floor
  canvas.fillRect(box.x, box.y + box.h - 14, box.w, 14, { r: 44, g: 52, b: 64 });

  // Flagpoles & 3 Flags (China, USA, Russia)
  const fxList = [box.x + 104, box.x + 144, box.x + 184];
  for (const fx of fxList) {
    canvas.fillRect(fx, box.y + 10, 2, box.h - 22, { r: 230, g: 230, b: 235 });
  }
  // China flag
  canvas.fillRect(fxList[0] + 2, box.y + 12, 30, 20, { r: 212, g: 30, b: 30 });
  canvas.fillCircleAA(fxList[0] + 8, box.y + 18, 2.5, { r: 250, g: 220, b: 40 }, 1, clip);
  // USA flag
  const ux = fxList[1] + 2;
  const uy = box.y + 12;
  for (let s = 0; s < 5; s++) {
    canvas.fillRect(ux, uy + s * 4, 30, 2, { r: 196, g: 30, b: 42 });
    canvas.fillRect(ux, uy + s * 4 + 2, 30, 2, WHITE);
  }
  canvas.fillRect(ux, uy, 14, 11, { r: 24, g: 54, b: 120 });
  // Russia flag
  const rx = fxList[2] + 2;
  const ry = box.y + 12;
  canvas.fillRect(rx, ry, 30, 7, WHITE);
  canvas.fillRect(rx, ry + 7, 30, 6, { r: 24, g: 72, b: 175 });
  canvas.fillRect(rx, ry + 13, 30, 7, { r: 205, g: 32, b: 36 });

  drawText(canvas, "SHENZHEN", box.x + 236, box.y + box.h - 28, 1, WHITE, 1, clip);
}

function drawHeroArtRiyadh(canvas: CanvasRGB, box: Rect): void {
  const clip = box;
  canvas.fillGradV(box.x, box.y, box.w, box.h, { r: 16, g: 22, b: 38 }, { r: 58, g: 36, b: 48 });

  // Riyadh skyline + tall PIF tower
  const towerCol: ColorRGB = { r: 28, g: 34, b: 48 };
  canvas.fillRect(box.x, box.y + box.h - 10, box.w, 10, { r: 18, g: 20, b: 28 });
  const towers = [[18, 28, 26], [52, 38, 22], [86, 22, 28], [134, 62, 20], [166, 30, 24], [218, 42, 22], [268, 26, 28]];
  for (const [tx, th, tw] of towers) {
    canvas.fillRect(box.x + tx, box.y + box.h - th - 10, tw, th, towerCol);
  }
  // Highlighted windows on PIF tower
  for (let wy = 0; wy < 46; wy += 6) {
    canvas.fillRect(box.x + 138, box.y + box.h - 68 + wy, 12, 2, { r: 110, g: 165, b: 215 });
  }

  // Incoming red missile trail + Patriot cyan interception arc + flash
  canvas.drawLineAA(box.x + 295, box.y + 8, box.x + 186, box.y + 28, 1.4, { r: 240, g: 82, b: 64 }, 0.9, clip);
  canvas.drawLineAA(box.x + 80, box.y + box.h - 12, box.x + 186, box.y + 28, 1.6, { r: 95, g: 220, b: 255 }, 0.95, clip);
  canvas.fillCircleAA(box.x + 186, box.y + 28, 8, { r: 255, g: 180, b: 60 }, 0.65, clip);
  canvas.fillCircleAA(box.x + 186, box.y + 28, 4, WHITE, 0.95, clip);

  drawText(canvas, "INTERCEPT", box.x + 236, box.y + box.h - 24, 1, { r: 255, g: 210, b: 140 }, 1, clip);
}

function drawHeroArtVoyager(canvas: CanvasRGB, box: Rect): void {
  const clip = box;
  canvas.fillGradV(box.x, box.y, box.w, box.h, { r: 8, g: 14, b: 32 }, { r: 18, g: 34, b: 64 });

  // Deterministic starfield via simple hash
  for (let i = 0; i < 42; i++) {
    const sx = box.x + ((i * 73 + 19) % (box.w - 8)) + 4;
    const sy = box.y + ((i * 41 + 11) % (box.h - 8)) + 4;
    const bright = (i % 3 === 0) ? 245 : 165;
    canvas.setPixel(sx, sy, { r: bright, g: bright, b: 255 }, clip);
  }

  // Tiny blue Earth dot on left
  canvas.fillCircleAA(box.x + 36, box.y + 44, 7, { r: 64, g: 156, b: 255 }, 1, clip);
  canvas.fillCircleAA(box.x + 34, box.y + 42, 3, { r: 120, g: 220, b: 150 }, 0.8, clip);

  // Radio signal arcs traveling 24h
  for (let r = 18; r <= 72; r += 18) {
    for (let a = -0.35; a <= 0.35; a += 0.04) {
      const px = box.x + 36 + Math.cos(a) * r;
      const py = box.y + 44 + Math.sin(a) * r;
      canvas.setPixel(px, py, { r: 80, g: 225, b: 235 }, clip);
    }
  }

  // Stylized Voyager 1 probe on right
  const vx = box.x + 215;
  const vy = box.y + 34;
  canvas.drawLineAA(vx - 32, vy + 10, vx, vy, 1.4, { r: 210, g: 215, b: 225 }, 1, clip); // magnetometer boom
  canvas.drawLineAA(vx, vy, vx + 18, vy + 18, 1.6, { r: 180, g: 185, b: 195 }, 1, clip); // RTG boom
  canvas.fillCircleAA(vx, vy, 11, { r: 235, g: 235, b: 242 }, 1, clip); // high-gain dish
  canvas.fillCircleAA(vx - 1, vy, 8, { r: 195, g: 160, b: 70 }, 1, clip); // gold inner dish
  canvas.fillRect(vx - 2, vy - 2, 5, 5, { r: 50, g: 55, b: 68 });

  drawText(canvas, "1 LIGHT-DAY", box.x + 216, box.y + box.h - 18, 1, { r: 150, g: 235, b: 255 }, 1, clip);
}

// =====================================================================
// CARDS & MICRO-CHARTS
// =====================================================================

function drawHeroCard(canvas: CanvasRGB, item: NewsItem, idx: number, box: Rect): void {
  const accent = REGION_COLORS[item.region] ?? INK_DARK;
  canvas.fillRect(box.x + 2, box.y + 2, box.w, box.h, CARD_SHADOW);
  canvas.fillRect(box.x, box.y, box.w, box.h, CARD_BG);

  const artBox: Rect = { x: box.x + 1, y: box.y + 1, w: box.w - 2, h: 72 };
  if (idx === 0) drawHeroArtSummit(canvas, artBox);
  else if (idx === 1) drawHeroArtRiyadh(canvas, artBox);
  else drawHeroArtVoyager(canvas, artBox);

  canvas.strokeRect(box.x, box.y, box.w, box.h, CARD_BORDER, 1);
  canvas.fillRect(box.x, box.y + 73, 6, box.h - 73, accent);

  const tx = box.x + 13;
  const tw = box.w - 21;

  // Number pin + region + source/topic badge
  const meta = STORY_META[idx];
  const regText = `${idx + 1} | ${sanitizeAscii(item.region).toUpperCase()}`;
  drawText(canvas, regText, tx, box.y + 79, 1, accent, 1, { x: tx, y: box.y + 77, w: tw, h: 16 });
  const bw = measureText(meta.badge, 1, 1) + 10;
  canvas.fillRect(box.x + box.w - bw - 8, box.y + 77, bw, 16, BG_STRIP);
  drawText(canvas, meta.badge, box.x + box.w - bw - 3, box.y + 79, 1, INK_BODY, 1);

  // Title (21px bold >= 20px)
  const titleLines = wrapText(item.title, tw, 1.5, 1, 2, true);
  const tClip: Rect = { x: tx, y: box.y + 96, w: tw, h: 45 };
  for (let i = 0; i < titleLines.length; i++) {
    drawText(canvas, titleLines[i], tx, box.y + 97 + i * 21, 1.5, INK_DARK, 1, tClip, true);
  }

  // Summary (14px >= 14px)
  const sumLines = wrapText(item.summary, tw, 1, 1, 3, false);
  const sClip: Rect = { x: tx, y: box.y + 143, w: tw, h: box.h - 147 };
  for (let i = 0; i < sumLines.length; i++) {
    drawText(canvas, sumLines[i], tx, box.y + 144 + i * 17, 1, INK_BODY, 1, sClip);
  }
}

function drawMicroChart(canvas: CanvasRGB, type: "up" | "bars" | "pulse", x: number, y: number, col: ColorRGB): void {
  if (type === "up") {
    const pts = [11, 9, 10, 6, 4, 2];
    for (let i = 0; i < pts.length - 1; i++) {
      canvas.drawLineAA(x + i * 6, y + pts[i], x + (i + 1) * 6, y + pts[i + 1], 1.1, col, 1);
    }
  } else if (type === "bars") {
    const hs = [4, 7, 5, 10, 12];
    for (let i = 0; i < hs.length; i++) {
      canvas.fillRect(x + i * 6, y + 13 - hs[i], 4, hs[i], col);
    }
  } else {
    const pts = [7, 7, 2, 12, 4, 7, 7];
    for (let i = 0; i < pts.length - 1; i++) {
      canvas.drawLineAA(x + i * 5, y + pts[i], x + (i + 1) * 5, y + pts[i + 1], 1.0, col, 1);
    }
  }
}

function drawGridCard(canvas: CanvasRGB, item: NewsItem, idx: number, box: Rect): void {
  const accent = REGION_COLORS[item.region] ?? INK_DARK;
  canvas.fillRect(box.x + 2, box.y + 2, box.w, box.h, CARD_SHADOW);
  canvas.fillRect(box.x, box.y, box.w, box.h, CARD_BG);
  canvas.strokeRect(box.x, box.y, box.w, box.h, CARD_BORDER, 1);
  canvas.fillRect(box.x, box.y, 6, box.h, accent);

  const tx = box.x + 13;
  const tw = box.w - 21;
  const meta = STORY_META[idx];

  // Region line + pin number + optional badge/chart
  const regLabel = `${idx + 1} | ${sanitizeAscii(item.region).toUpperCase()}`;
  drawText(canvas, regLabel, tx, box.y + 5, 1, accent, 1, { x: tx, y: box.y + 4, w: tw, h: 16 });

  const bw = measureText(meta.badge, 1, 1) + 8;
  const bx = box.x + box.w - bw - 7;
  canvas.fillRect(bx, box.y + 4, bw, 15, BG_STRIP);
  drawText(canvas, meta.badge, bx + 4, box.y + 5, 1, INK_BODY, 1);
  if (meta.chart) {
    drawMicroChart(canvas, meta.chart, bx - 36, box.y + 4, accent);
  }

  // Title (21px bold >= 20px, max 2 lines)
  const titleLines = wrapText(item.title, tw, 1.5, 1, 2, true);
  const tClip: Rect = { x: tx, y: box.y + 20, w: tw, h: 45 };
  for (let i = 0; i < titleLines.length; i++) {
    drawText(canvas, titleLines[i], tx, box.y + 21 + i * 21, 1.5, INK_DARK, 1, tClip, true);
  }

  // Summary (14px >= 14px, 2 lines)
  const sumStartY = titleLines.length === 1 ? box.y + 49 : box.y + 66;
  const maxSumLines = titleLines.length === 1 ? 3 : 2;
  const sumLines = wrapText(item.summary, tw, 1, 1, maxSumLines, false);
  const sClip: Rect = { x: tx, y: sumStartY - 1, w: tw, h: box.y + box.h - sumStartY - 3 };
  for (let i = 0; i < sumLines.length; i++) {
    drawText(canvas, sumLines[i], tx, sumStartY + i * 16, 1, INK_BODY, 1, sClip);
  }
}

// =====================================================================
// WORLD MAP ("WHERE IT HAPPENED") WITH 16 NUMBERED PINS
// =====================================================================

function drawWorldMapPanel(canvas: CanvasRGB, news: NewsItem[], box: Rect): void {
  canvas.fillRect(box.x + 2, box.y + 2, box.w, box.h, CARD_SHADOW);
  canvas.fillRect(box.x, box.y, box.w, box.h, CARD_BG);
  canvas.strokeRect(box.x, box.y, box.w, box.h, CARD_BORDER, 1);

  // Header strip inside map panel
  drawText(canvas, "WHERE IT HAPPENED", box.x + 10, box.y + 5, 1, INK_DARK, 1);
  drawText(canvas, "16 LOCATIONS + SPACE", box.x + box.w - 148, box.y + 5, 1, INK_MUTED, 1);

  const mapBox: Rect = { x: box.x + 8, y: box.y + 22, w: box.w - 16, h: box.h - 28 };
  const ocean: ColorRGB = { r: 220, g: 232, b: 239 };
  const gridCol: ColorRGB = { r: 202, g: 216, b: 225 };
  const land: ColorRGB = { r: 213, g: 205, b: 180 };
  const coast: ColorRGB = { r: 162, g: 152, b: 128 };

  canvas.fillRect(mapBox.x, mapBox.y, mapBox.w, mapBox.h, ocean);

  const proj = (lon: number, lat: number): [number, number] => {
    const px = mapBox.x + ((lon + 180) / 360) * mapBox.w;
    const py = mapBox.y + ((78 - lat) / 160) * mapBox.h;
    return [px, py];
  };

  // Lat/Long grid
  for (let lon = -120; lon <= 120; lon += 60) {
    const [gx] = proj(lon, 0);
    canvas.fillRect(gx, mapBox.y, 1, mapBox.h, gridCol);
  }
  for (const lat of [45, 0, -45]) {
    const [, gy] = proj(0, lat);
    canvas.fillRect(mapBox.x, gy, mapBox.w, 1, gridCol);
  }

  // Stylized continent polygons [lon, lat]
  const continents: Array<Array<[number, number]>> = [
    // North America
    [[-168, 65], [-140, 70], [-95, 72], [-78, 62], [-55, 50], [-75, 36], [-82, 25], [-96, 19], [-84, 9], [-78, 8], [-93, 14], [-112, 24], [-125, 48], [-150, 60]],
    // Greenland
    [[-52, 76], [-20, 77], [-22, 66], [-45, 60]],
    // South America
    [[-79, 10], [-62, 10], [-35, -6], [-40, -22], [-58, -38], [-68, -54], [-74, -46], [-72, -18], [-81, -4]],
    // Europe + Eurasia + Asia
    [[-10, 37], [-9, 43], [-4, 48], [6, 54], [12, 56], [5, 61], [26, 71], [65, 72], [125, 73], [174, 66], [160, 54], [140, 42], [128, 35], [122, 30], [108, 18], [104, 2], [96, 16], [80, 8], [72, 20], [58, 25], [44, 13], [35, 30], [28, 41], [18, 40], [12, 44], [2, 43]],
    // UK
    [[-6, 50], [-5, 58], [1, 56], [1, 51]],
    // Japan
    [[131, 32], [140, 36], [144, 44], [140, 42]],
    // Africa
    [[-17, 15], [-6, 35], [12, 37], [32, 31], [43, 12], [51, 12], [40, -10], [32, -26], [19, -35], [13, -18], [9, 4], [-12, 6]],
    // Australia
    [[114, -22], [130, -12], [145, -14], [153, -27], [146, -38], [130, -33], [115, -34]],
    // Antarctica
    [[-175, -67], [-115, -73], [-60, -64], [-40, -75], [30, -70], [140, -68], [175, -73], [175, -82], [-175, -82]],
  ];

  for (const poly of continents) {
    const pts = poly.map(([lon, lat]) => proj(lon, lat));
    canvas.fillPolygon(pts, land, mapBox);
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      canvas.drawLineAA(x1, y1, x2, y2, 0.5, coast, 0.7, mapBox);
    }
  }

  // Plot pins 1..16 (pin 3 points to Voyager in Space)
  for (let i = 0; i < news.length; i++) {
    const meta = STORY_META[i];
    const col = REGION_COLORS[news[i].region] ?? INK_DARK;

    if (i === 2) {
      // Voyager space pill top-right
      const vx = mapBox.x + mapBox.w - 92;
      const vy = mapBox.y + 4;
      canvas.fillRect(vx, vy, 88, 16, col);
      drawText(canvas, "3->VOYAGER", vx + 4, vy + 2, 1, WHITE, 1, mapBox);
      continue;
    }

    const [px, py] = proj(meta.lon, meta.lat);
    const num = String(i + 1);
    const pillW = num.length === 1 ? 14 : 20;
    const pillH = 15;
    const bx = Math.max(mapBox.x + 1, Math.min(mapBox.x + mapBox.w - pillW - 1, Math.round(px - pillW / 2)));
    const by = Math.max(mapBox.y + 1, Math.min(mapBox.y + mapBox.h - pillH - 1, Math.round(py - pillH / 2)));

    canvas.fillRect(bx - 1, by - 1, pillW + 2, pillH + 2, WHITE);
    canvas.fillRect(bx, by, pillW, pillH, col);
    const tw = measureText(num, 1, 1);
    drawText(canvas, num, bx + (pillW - tw) / 2, by + 2, 1, WHITE, 1, mapBox);
  }

  canvas.strokeRect(mapBox.x, mapBox.y, mapBox.w, mapBox.h, CARD_BORDER, 1);
}

// =====================================================================
// FOOTER & CRC32 PNG ENCODER
// =====================================================================