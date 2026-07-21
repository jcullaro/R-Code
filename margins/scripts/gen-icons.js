'use strict';

// Generates PNG app icons (192, 512) without any image libraries: we rasterize
// the simple icon geometry (rounded squares + bars) into an RGBA buffer and
// encode it as a PNG by hand with zlib.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function inRoundedRect(px, py, x, y, w, h, r) {
  if (px < x || px >= x + w || py < y || py >= y + h) return false;
  const cx = Math.max(x + r, Math.min(px, x + w - r));
  const cy = Math.max(y + r, Math.min(py, y + h - r));
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r ||
    (px >= x + r && px < x + w - r) || (py >= y + r && py < y + h - r);
}

function drawIcon(size) {
  const s = size / 512; // geometry defined at 512
  const rgba = Buffer.alloc(size * size * 4);
  const bg = [0xb5, 0x50, 0x2a];
  const white = [0xff, 0xff, 0xff];
  const yellow = [0xff, 0xe2, 0x7a];
  const bars = [
    [120, 128, 272, 40, white],
    [120, 216, 272, 40, yellow],
    [120, 304, 180, 40, white],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!inRoundedRect(x, y, 0, 0, size, size, 96 * s)) continue; // transparent corner
      let [r, g, b] = bg;
      for (const [bx, by, bw, bh, color] of bars) {
        if (inRoundedRect(x, y, bx * s, by * s, bw * s, bh * s, 20 * s)) {
          [r, g, b] = color;
          break;
        }
      }
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

const outDir = path.join(__dirname, '..', 'public', 'icons');
for (const size of [192, 512]) {
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), drawIcon(size));
  console.log(`icon-${size}.png written`);
}
fs.writeFileSync(path.join(__dirname, '..', 'extension', 'icon-128.png'), drawIcon(128));
console.log('extension/icon-128.png written');
