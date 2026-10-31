/**
 * Generates build/icon.png and build/icon.ico without native image deps.
 * Design: graphite-to-blue rounded square, black notch, luminous bloom lens.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MASTER = 1024;
const SCALE = MASTER / 256;

const CRC_TABLE = (function () {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
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
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function clamp(value) {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function insideRounded(x, y, left, top, right, bottom, radii) {
  if (x < left || x > right || y < top || y > bottom) return false;
  let cx, cy, radius;
  if (x < left + radii.tl && y < top + radii.tl) {
    cx = left + radii.tl; cy = top + radii.tl; radius = radii.tl;
  } else if (x > right - radii.tr && y < top + radii.tr) {
    cx = right - radii.tr; cy = top + radii.tr; radius = radii.tr;
  } else if (x > right - radii.br && y > bottom - radii.br) {
    cx = right - radii.br; cy = bottom - radii.br; radius = radii.br;
  } else if (x < left + radii.bl && y > bottom - radii.bl) {
    cx = left + radii.bl; cy = bottom - radii.bl; radius = radii.bl;
  } else {
    return true;
  }
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function blend(dst, index, color, alpha) {
  if (alpha <= 0) return;
  const a = alpha > 1 ? 1 : alpha;
  const inv = 1 - a;
  dst[index] = clamp(dst[index] * inv + color[0] * a);
  dst[index + 1] = clamp(dst[index + 1] * inv + color[1] * a);
  dst[index + 2] = clamp(dst[index + 2] * inv + color[2] * a);
  dst[index + 3] = clamp(dst[index + 3] * inv + 255 * a);
}

function renderMaster() {
  const buffer = Buffer.alloc(MASTER * MASTER * 4);
  const S = SCALE;
  const square = { left: 8 * S, top: 8 * S, right: 248 * S, bottom: 248 * S };
  const radii = { tl: 54 * S, tr: 54 * S, br: 54 * S, bl: 54 * S };
  const topColor = [10, 132, 255];
  const bottomColor = [94, 92, 230];

  for (let y = 0; y < MASTER; y++) {
    for (let x = 0; x < MASTER; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      if (!insideRounded(px, py, square.left, square.top, square.right, square.bottom, radii)) continue;

      const t = (px + py) / (2 * MASTER);
      let color = mix(topColor, bottomColor, t);
      const shade = 1 - 0.16 * (py / MASTER);
      color = [color[0] * shade, color[1] * shade, color[2] * shade];

      const highlight = Math.max(0, 1 - (px + py) / MASTER) * 0.10;
      color = mix(color, [255, 255, 255], highlight);

      const index = (y * MASTER + x) * 4;
      buffer[index] = clamp(color[0]);
      buffer[index + 1] = clamp(color[1]);
      buffer[index + 2] = clamp(color[2]);
      buffer[index + 3] = 255;
    }
  }

  // Notch: touches the top edge, rounded bottom corners.
  const notch = {
    left: 76 * S,
    top: 8 * S,
    right: 180 * S,
    bottom: 40 * S,
    radii: { tl: 0, tr: 0, br: 16 * S, bl: 16 * S },
  };
  for (let y = 0; y < MASTER; y++) {
    for (let x = 0; x < MASTER; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      if (!insideRounded(px, py, notch.left, notch.top, notch.right, notch.bottom, notch.radii)) continue;
      const index = (y * MASTER + x) * 4;
      blend(buffer, index, [5, 5, 6], 1);
    }
  }

  // Camera lens inside the notch.
  const lensX = 128 * S;
  const lensY = 24 * S;
  const lensR = 3.2 * S;
  for (let y = 0; y < MASTER; y++) {
    for (let x = 0; x < MASTER; x++) {
      const dx = x + 0.5 - lensX;
      const dy = y + 0.5 - lensY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > lensR) continue;
      const index = (y * MASTER + x) * 4;
      const edge = d / lensR;
      blend(buffer, index, mix([44, 44, 46], [10, 20, 30], edge), 1);
    }
  }

  // Bloom orb: soft glow, white ring, blue core, highlight.
  const orbX = 128 * S;
  const orbY = 136 * S;
  const glowR = 68 * S;
  const outerR = 40 * S;
  const coreR = 24 * S;

  for (let y = 0; y < MASTER; y++) {
    for (let x = 0; x < MASTER; x++) {
      const dx = x + 0.5 - orbX;
      const dy = y + 0.5 - orbY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > glowR) continue;

      const index = (y * MASTER + x) * 4;

      if (d > outerR) {
        const fade = 1 - (d - outerR) / (glowR - outerR);
        blend(buffer, index, [100, 210, 255], 0.26 * fade * fade);
        continue;
      }

      if (d > coreR) {
        const t = (d - coreR) / (outerR - coreR);
        blend(buffer, index, mix([255, 255, 255], [100, 210, 255], t), 1);
        continue;
      }

      const t = d / coreR;
      const core = mix([18, 120, 245], [10, 70, 190], t);
      blend(buffer, index, core, 1);

      const hx = x + 0.5 - (orbX - 8 * S);
      const hy = y + 0.5 - (orbY - 8 * S);
      const hd = Math.sqrt(hx * hx + hy * hy);
      if (hd < 7 * S) {
        blend(buffer, index, [255, 255, 255], 0.55 * (1 - hd / (7 * S)));
      }
    }
  }

  return buffer;
}

function downsample(master, size) {
  const factor = MASTER / size;
  const out = Buffer.alloc(size * size * 4);
  const samples = factor * factor;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < factor; sy++) {
        const sourceY = Math.floor(y * factor) + sy;
        for (let sx = 0; sx < factor; sx++) {
          const sourceX = Math.floor(x * factor) + sx;
          const index = (sourceY * MASTER + sourceX) * 4;
          const alpha = master[index + 3] / 255;
          r += master[index] * alpha;
          g += master[index + 1] * alpha;
          b += master[index + 2] * alpha;
          a += alpha;
        }
      }
      const outIndex = (y * size + x) * 4;
      if (a > 0) {
        out[outIndex] = clamp(r / a);
        out[outIndex + 1] = clamp(g / a);
        out[outIndex + 2] = clamp(b / a);
        out[outIndex + 3] = clamp((a / samples) * 255);
      }
    }
  }
  return out;
}

function buildIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const entries = Buffer.alloc(16 * count);
  let offset = 6 + entries.length;
  pngs.forEach(function (png, i) {
    const size = png.size;
    const entry = i * 16;
    entries[entry] = size >= 256 ? 0 : size;
    entries[entry + 1] = size >= 256 ? 0 : size;
    entries[entry + 2] = 0;
    entries[entry + 3] = 0;
    entries.writeUInt16LE(1, entry + 4);
    entries.writeUInt16LE(32, entry + 6);
    entries.writeUInt32LE(png.data.length, entry + 8);
    entries.writeUInt32LE(offset, entry + 12);
    offset += png.data.length;
  });

  return Buffer.concat([header, entries].concat(pngs.map(function (png) { return png.data; })));
}

const master = renderMaster();
const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });

const sizes = [16, 32, 64, 128, 256];
const pngs = sizes.map(function (size) {
  return { size: size, data: encodePng(size, size, downsample(master, size)) };
});

fs.writeFileSync(path.join(outDir, 'icon.ico'), buildIco(pngs));
fs.writeFileSync(path.join(outDir, 'icon.png'), encodePng(512, 512, downsample(master, 512)));

console.log('Wrote build/icon.ico (' + sizes.join(', ') + ') and build/icon.png (512).');
