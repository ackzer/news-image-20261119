function drawFooter(canvas: CanvasRGB): void {
  const left = 20;
  const width = WIDTH - 40;
  const yTop = 968;

  canvas.fillRect(left, yTop, width, 2, HEADER_BG);

  const gap = 20;
  const swatchSize = 12;
  const swatchGap = 6;
  let totalW = 0;
  for (let i = 0; i < REGION_ORDER.length; i++) {
    totalW += swatchSize + swatchGap + measureText(REGION_ORDER[i], 1, 1);
    if (i < REGION_ORDER.length - 1) totalW += gap;
  }

  let cx = Math.round((WIDTH - totalW) / 2);
  const cy = yTop + 10;
  for (let i = 0; i < REGION_ORDER.length; i++) {
    const reg = REGION_ORDER[i];
    canvas.fillRect(cx, cy + 1, swatchSize, swatchSize, REGION_COLORS[reg]);
    drawText(canvas, reg, cx + swatchSize + swatchGap, cy, 1, INK_DARK, 1);
    cx += swatchSize + swatchGap + measureText(reg, 1, 1) + gap;
  }

  const credit = "THURSDAY 19 NOVEMBER 2026  |  WORLD NEWS SUMMARY  |  16 VERIFIED STORIES";
  const cw = measureText(credit, 1, 1);
  drawText(canvas, credit, Math.round((WIDTH - cw) / 2), yTop + 31, 1, INK_MUTED, 1);
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Uint8Array): Buffer {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, "ascii");
  if (len > 0) Buffer.from(data.buffer, data.byteOffset, len).copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + len)), 8 + len);
  return chunk;
}

function encodePngRGB(width: number, height: number, rgb: Uint8Array): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 3 + 1;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * stride + 1);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, makePngChunk("IHDR", ihdr), makePngChunk("IDAT", compressed), makePngChunk("IEND", new Uint8Array(0))]);
}

function main(): void {
  const news = JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) as NewsItem[];
  if (!Array.isArray(news) || news.length !== 16) {
    throw new Error(`Expected 16 news items for this layout, got ${Array.isArray(news) ? news.length : 0}`);
  }

  const canvas = new CanvasRGB(WIDTH, HEIGHT, BG_NEWSPRINT);
  drawMasthead(canvas, news);

  // Row 1: 3 Hero Cards with Procedural Illustrations (y = 190..404)
  const heroW = 320;
  const gapX = 12;
  for (let i = 0; i < 3; i++) {
    drawHeroCard(canvas, news[i], i, { x: 20 + i * (heroW + gapX), y: 190, w: heroW, h: 214 });
  }

  // Rows 2..5: 12 Grid Cards (3 cols x 4 rows, y = 412..848)
  const cardH = 103;
  const gapY = 8;
  for (let i = 0; i < 12; i++) {
    const r = Math.floor(i / 3);
    const c = i % 3;
    drawGridCard(canvas, news[3 + i], 3 + i, {
      x: 20 + c * (heroW + gapX),
      y: 412 + r * (cardH + gapY),
      w: heroW,
      h: cardH,
    });
  }

  // Row 6: World Map (left 2 columns) + Story #16 (right column, y = 856..960)
  drawWorldMapPanel(canvas, news, { x: 20, y: 856, w: heroW * 2 + gapX, h: 104 });
  drawGridCard(canvas, news[15], 15, { x: 20 + 2 * (heroW + gapX), y: 856, w: heroW, h: 104 });

  drawFooter(canvas);

  const pngBuffer = encodePngRGB(WIDTH, HEIGHT, canvas.data);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, pngBuffer);
  console.log(`Wrote ${OUTPUT_PATH} (${pngBuffer.length} bytes)`);
}

main();