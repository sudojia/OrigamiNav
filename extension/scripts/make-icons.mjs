// Generates public/icon/{16,32,48,128}.png: origami bookmark on the
// site-blue tile. Zero deps; drawn at 4× and box-downsampled.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling factor

// oklch(0.55 0.19 258) ≈ the site's blue primary, as sRGB.
const BG = [0x33, 0x6c, 0xf2, 0xff];
const FOLD = [0x1f, 0x4f, 0xc4, 0xff]; // darker triangle for the folded corner
const WHITE = [0xff, 0xff, 0xff, 0xff];

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Point-in-polygon (even-odd) for the bookmark outline.
function inPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Rounded-rect coverage 0..1 (SDF).
function roundedRectCoverage(x, y, half, radius) {
  const dx = Math.abs(x) - (half - radius);
  const dy = Math.abs(y) - (half - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - radius;
  return Math.min(1, Math.max(0, 0.5 - outside));
}

function drawPixel(u, v) {
  // Bookmark ribbon with bottom notch + folded top-right corner.
  const BOOKMARK = [
    [0.28, 0.16],
    [0.72, 0.16],
    [0.72, 0.84],
    [0.5, 0.66],
    [0.28, 0.84],
  ];
  const FOLD_TRI = [
    [0.72, 0.16],
    [0.72, 0.34],
    [0.54, 0.16],
  ];

  const tile = roundedRectCoverage(u - 0.5, v - 0.5, 0.5, 0.22);
  if (tile <= 0) return [0, 0, 0, 0];

  const bookmark = inPolygon(u, v, BOOKMARK);
  const fold = inPolygon(u, v, FOLD_TRI);
  const color = bookmark ? (fold ? FOLD : WHITE) : BG;

  // Anti-alias only the tile edge against transparency.
  return [color[0], color[1], color[2], Math.round(color[3] * tile)];
}

function render(size) {
  const hi = size * SS;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const [pr, pg, pb, pa] = drawPixel(
            (x * SS + sx + 0.5) / hi,
            (y * SS + sy + 0.5) / hi,
          );
          r += pr * pa;
          g += pg * pa;
          b += pb * pa;
          a += pa;
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) {
        rgba[o] = Math.round(r / a);
        rgba[o + 1] = Math.round(g / a);
        rgba[o + 2] = Math.round(b / a);
        rgba[o + 3] = Math.round(a / (SS * SS));
      }
    }
  }
  return rgba;
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icon');
mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  const file = join(outDir, `${size}.png`);
  writeFileSync(file, encodePng(size, render(size)));
  console.log(`wrote ${file}`);
}
