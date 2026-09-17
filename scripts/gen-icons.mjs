import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const hex = (h) => [
  parseInt(h.slice(0, 2), 16),
  parseInt(h.slice(2, 4), 16),
  parseInt(h.slice(4, 6), 16),
];

const TOP = hex("d97706");
const BOTTOM = hex("78350f");
const RING = [255, 255, 255];

function insideRoundedRect(px, py, size, radius) {
  const qLeft = Math.max(0, px - radius);
  const qRight = Math.max(0, size - radius - px);
  const qTop = Math.max(0, py - radius);
  const qBottom = Math.max(0, size - radius - py);
  const qx = Math.max(qLeft, qRight);
  const qy = Math.max(qTop, qBottom);
  if (px < 0 || px > size || py < 0 || py > size) return 0;
  if (qx + qy <= radius) return 1;
  return (qx - radius) ** 2 + (qy - radius) ** 2 <= radius * radius ? 1 : 0;
}

function render(size, { rounded, ringOuter, ringInner }) {
  const rgba = Buffer.alloc(size * size * 4);
  const center = size / 2;
  const cornerRadius = rounded ? size * 0.22 : 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let ringCov = 0;
      let cornerCov = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const px = x + (sx + 0.5) / 4;
          const py = y + (sy + 0.5) / 4;
          if (rounded) {
            cornerCov += insideRoundedRect(px, py, size, cornerRadius);
          } else {
            cornerCov += 1;
          }
          const d = Math.hypot(px - center, py - center);
          if (d >= ringInner && d <= ringOuter) ringCov += 1;
        }
      }
      ringCov /= 16;
      cornerCov /= 16;

      const t = y / (size - 1);
      const bg = [
        TOP[0] + (BOTTOM[0] - TOP[0]) * t,
        TOP[1] + (BOTTOM[1] - TOP[1]) * t,
        TOP[2] + (BOTTOM[2] - TOP[2]) * t,
      ];
      const cr = bg[0] + (RING[0] - bg[0]) * ringCov;
      const cg = bg[1] + (RING[1] - bg[1]) * ringCov;
      const cb = bg[2] + (RING[2] - bg[2]) * ringCov;

      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round(cr);
      rgba[idx + 1] = Math.round(cg);
      rgba[idx + 2] = Math.round(cb);
      rgba[idx + 3] = Math.round(255 * cornerCov);
    }
  }
  return rgba;
}

mkdirSync(OUT_DIR, { recursive: true });

const variants = [
  { file: "icon-192.png", size: 192, rounded: true, ringOuter: 66, ringInner: 42 },
  { file: "icon-512.png", size: 512, rounded: true, ringOuter: 176, ringInner: 112 },
  { file: "icon-512-maskable.png", size: 512, rounded: false, ringOuter: 170, ringInner: 106 },
];

for (const v of variants) {
  const rgba = render(v.size, v);
  const png = encodePng(v.size, v.size, rgba);
  writeFileSync(join(OUT_DIR, v.file), png);
  console.log(`wrote public/icons/${v.file} (${png.length} bytes)`);
}