// Draws the mark, as SVG and as PNG, from one description of the shapes.
//
//   node scripts/make-icons.mjs
//
// The mark is a redaction that failed: three lines of text on paper, a bar
// struck across the middle one, and the struck line still legible through
// it. Rectangles only, which is why this can rasterise itself with no
// image library — the project does not take a dependency it can avoid.

import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const PAPER = [0xf6, 0xf4, 0xef];
const INK = [0x28, 0x26, 0x24];
const ACCENT = [0x1d, 0x42, 0x69];

// On a 64-unit grid, scaled to whatever size is asked for.
//
// Seven lines of verse with one struck by a marker. The marker is
// translucent, so the struck line darkens and stays legible rather than
// disappearing: that is the name, and it is the claim. The struck line is
// the longest one — the thing someone most wanted said.
const LINES = [28, 17, 36, 42, 21, 31, 14]; // set like a poem, not a column
const H = 2.4, GAP = 3.1, TOP = 13.5, STRUCK = 3;

const SHAPES = [
  { x: 0, y: 0, w: 64, h: 64, r: 13, fill: PAPER },
  ...LINES.map((w, i) => ({ x: 11, y: TOP + i * (H + GAP), w, h: H, r: H / 2, fill: INK })),
  {
    x: 5, y: TOP + STRUCK * (H + GAP) + H / 2 - 3.6,
    w: 54, h: 7.2, r: 1, rot: -3.5, fill: ACCENT, alpha: 0.82,
  },
];

const svg = (size = 64, sheet = 1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="Indelebile">
  <title>Indelebile — a redaction that failed</title>
${SHAPES.map((s, i) => {
  const alpha = i === 0 && sheet !== 1 ? sheet : s.alpha;
  const hex = '#' + s.fill.map((c) => c.toString(16).padStart(2, '0')).join('');
  const n = (v) => Number(v.toFixed(3));
  const spin = s.rot ? ` transform="rotate(${s.rot} ${n(s.x + s.w / 2)} ${n(s.y + s.h / 2)})"` : '';
  const ink = alpha !== undefined ? ` fill-opacity="${alpha}"` : '';
  return `  <rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}" rx="${n(s.r)}" fill="${hex}"${ink}${spin}/>`;
}).join('\n')}
</svg>
`;

/// Coverage of one pixel sample by a rounded rectangle, which may be
/// rotated about its own centre.
function inside(s, px, py) {
  const { x, y, w, h, r } = s;
  if (s.rot) {
    const a = (-s.rot * Math.PI) / 180;
    const cx = x + w / 2, cy = y + h / 2;
    const dx = px - cx, dy = py - cy;
    px = cx + dx * Math.cos(a) - dy * Math.sin(a);
    py = cy + dx * Math.sin(a) + dy * Math.cos(a);
  }
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r + 1e-9;
}

function raster(size) {
  const SS = 4; // supersampling, so the corners are not staircases
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = ((px + (sx + 0.5) / SS) / size) * 64;
          const uy = ((py + (sy + 0.5) / SS) / size) * 64;
          let hit = null;
          for (const s of SHAPES) {
            if (!inside(s, ux, uy)) continue;
            const al = s.alpha ?? 1;
            // Translucent ink mixes with what is under it; opaque ink replaces it.
            hit = hit ? hit.map((c, i) => c * (1 - al) + s.fill[i] * al) : s.fill;
          }
          if (hit) { r += hit[0]; g += hit[1]; b += hit[2]; a += 255; }
        }
      }
      const n = SS * SS, i = (py * size + px) * 4;
      // Premultiplied averages would darken the edge against a light
      // backdrop; dividing by the covered samples keeps the colour true.
      const cov = a / 255;
      buf[i] = cov ? Math.round(r / cov) : 0;
      buf[i + 1] = cov ? Math.round(g / cov) : 0;
      buf[i + 2] = cov ? Math.round(b / cov) : 0;
      buf[i + 3] = Math.round(a / n);
    }
  }
  return buf;
}

function png(size) {
  const raw = raster(size);
  const stride = size * 4;
  const withFilters = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    withFilters[y * (stride + 1)] = 0; // filter: none
    raw.copy(withFilters, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(withFilters, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let TABLE = null;
function crc32(buf) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }
  let c = -1;
  for (const byte of buf) c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

const at = (f) => new URL('../web/' + f, import.meta.url);
writeFileSync(at('favicon.svg'), svg());
// Beside the title the sheet is softened, so it sits in a dark page rather
// than on it. Only there: an icon in a browser's chrome or a chat preview
// has a backdrop this project does not control, and has to stay opaque.
writeFileSync(at('mark.svg'), svg(64, 0.9));
for (const size of [32, 180, 512]) writeFileSync(at(`icon-${size}.png`), png(size));
console.log('wrote web/favicon.svg, mark.svg and icon-32/180/512.png');

// New files under old addresses are invisible to every cache that matters
// here, so the page's links are restamped as part of drawing.
const { STAMPED, stampOf } = await import('./stamp-assets.mjs');
const page = at('index.html');
const html = readFileSync(page, 'utf8');
writeFileSync(page, html.replace(STAMPED, (_, f) => `${f}?v=${stampOf(f)}`));
console.log('restamped the page\u2019s icon links');
