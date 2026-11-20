/**
 * Renders blog cover images in the style of Mel's covers: a navy-to-sky band with rolling
 * hills and a soft sunrise, a white title, the organization's name in coral, and dotted paths
 * leading to a colored circle with the category's icon. 1672x941 JPEG, same as her covers.
 *
 *   node data/blog-style/make-cover.mjs <specs.json> <out-dir>
 *
 * specs.json: [{ "slug", "title", "org", "icon" }]   icon is a key of ICONS below.
 * Writes <out-dir>/<slug>.jpg, which is the name `npm run blog:import` looks for.
 * Needs rsvg-convert and ImageMagick (brew install librsvg imagemagick).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = 1672;
const H = 941;
const PATH_COLORS = ['#1aa3e0', '#4caf50', '#f5b800', '#f0705a'];

// Line icons drawn in a 100x100 box, white stroke.
const ICONS = {
  food: 'M18 50h64l-8 26H26z M30 50c0-14 6-22 12-26 M44 50c2-12 10-20 18-22 M58 50c2-8 8-14 14-14',
  house: 'M20 50 50 24l30 26 M28 44v34h44V44 M44 78V60h12v18',
  medical: 'M40 20h20v20h20v20H60v20H40V60H20V40h20z',
  recovery: 'M50 82V46 M50 56c-18 0-26-12-26-26 18 0 26 12 26 26z M50 46c0-16 10-24 26-24 0 16-10 24-26 24z',
  briefcase: 'M18 36h64v40H18z M38 36v-8h24v8 M18 54h64',
  youth: 'M50 18l9 19 21 3-15 15 4 21-19-10-19 10 4-21-15-15 21-3z',
  senior: 'M50 78C30 64 18 52 18 38a14 14 0 0 1 32-6 14 14 0 0 1 32 6c0 14-12 26-32 40z',
  parenting: 'M36 34a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M64 44a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M24 82V52c0-8 6-12 12-12s12 4 12 12v30 M54 82V62c0-6 4-10 10-10s10 4 10 10v20',
  money: 'M50 16v68 M66 30c-4-6-10-8-16-8-10 0-16 6-16 13 0 18 32 10 32 28 0 8-7 13-16 13-7 0-13-3-17-9',
  veterans: 'M30 18v66 M30 22h44l-8 14 8 14H30',
  disability: 'M50 26a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M50 30v24h20l8 22 M44 40a22 22 0 1 0 26 30',
  foster: 'M20 48 50 22l30 26 M28 42v38h44V42 M50 72c-10-7-14-12-14-17a7 7 0 0 1 14-2 7 7 0 0 1 14 2c0 5-4 10-14 17z',
  shield: 'M50 16 78 26v22c0 18-12 30-28 36-16-6-28-18-28-36V26z M38 50l9 9 17-18',
  legal: 'M50 18v62 M30 80h40 M22 30h56 M30 30 18 56h24z M70 30 58 56h24z',
  bus: 'M24 22h52v48H24z M24 50h52 M30 70v10 M70 70v10 M34 61h2 M64 61h2',
  globe: 'M50 16a34 34 0 1 0 0 68 34 34 0 0 0 0-68z M16 50h68 M50 16c-12 12-12 56 0 68 M50 16c12 12 12 56 0 68',
  phone: 'M30 18h14l6 16-9 6c4 9 10 15 19 19l6-9 16 6v14c0 4-4 8-8 8-30-2-50-22-52-52 0-4 4-8 8-8z',
  key: 'M38 62a16 16 0 1 1 0-32 16 16 0 0 1 0 32z M50 52l30 30 M66 68l8-8 M74 76l8-8',
  store: 'M18 40l6-18h52l6 18 M18 40c0 6 5 10 11 10s10-4 10-10c0 6 5 10 11 10s11-4 11-10c0 6 5 10 10 10s11-4 11-10 M24 50v30h52V50 M42 80V62h16v18',
  shirt: 'M38 18l-20 12 8 16 8-4v40h32V42l8 4 8-16-20-12c-2 6-6 10-12 10s-10-4-12-10z',
  gift: 'M20 40h60v14H20z M26 54v28h48V54 M50 40v42 M50 40c-6-14-22-16-22-6 0 6 12 6 22 6z M50 40c6-14 22-16 22-6 0 6-12 6-22 6z',
  hands: 'M50 50c-10-7-16-12-16-18a8 8 0 0 1 16-3 8 8 0 0 1 16 3c0 6-6 11-16 18z M14 62h14l12 8h14a5 5 0 0 1 0 10H40 M54 80h16l16-13a5 5 0 0 0-7-7L66 68',
  feather: 'M76 22C48 24 30 42 26 72l-6 10 M26 72c18-2 34-10 42-24 M34 56h18 M42 42h20 M54 30h18',
  candle: 'M40 46h20v36H40z M50 46v-8 M50 18c-6 8-6 14 0 18 6-4 6-10 0-18z M30 82h40',
  bed: 'M16 34v48 M16 66h68v16 M16 58h68V48c0-6-4-10-10-10H44v20 M30 52a7 7 0 1 0 0-1z',
  people: 'M36 40a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M66 46a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M18 80V64c0-10 8-16 18-16s18 6 18 16v16 M56 80V66c0-8 4-12 10-12s14 4 14 12v14',
  chat: 'M18 26h48v32H38l-12 10V58h-8z M66 40h16v28h-6v8l-10-8H44v-10',
  book: 'M50 30c-8-6-20-8-32-6v52c12-2 24 0 32 6 8-6 20-8 32-6V24c-12-2-24 0-32 6z M50 30v52',
  community: 'M50 34a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M24 44a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M76 44a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M36 80V58c0-8 6-14 14-14s14 6 14 14v22 M12 72V60c0-6 6-10 12-10 4 0 7 1 9 3 M88 72V60c0-6-6-10-12-10-4 0-7 1-9 3',
  mind: 'M50 80C30 66 18 54 18 40a14 14 0 0 1 32-6 14 14 0 0 1 32 6c0 14-12 26-32 40z M30 46h10l5-10 8 20 5-10h12',
  sunrise: 'M18 70h64 M30 70a20 20 0 0 1 40 0 M50 34v-12 M26 44l-8-8 M74 44l8-8 M28 82h44',
  paw: 'M50 82c-14 0-24-6-24-16s12-18 24-18 24 8 24 18-10 16-24 16z M30 44a7 9 0 1 0 0-1z M44 32a7 9 0 1 0 0-1z M58 32a7 9 0 1 0 0-1z M72 44a7 9 0 1 0 0-1z',
};
const ICON_COLORS = ['#0b4a7f', '#4caf50', '#f5b800', '#f0705a', '#1aa3e0'];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Greedy wrap by an estimated character width; good enough for Avenir Next Demi Bold. */
function wrap(text, maxChars) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > maxChars) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function titleBlock(title) {
  for (const size of [84, 76, 68, 60]) {
    const lines = wrap(title, Math.floor(1480 / (size * 0.56)));
    if (lines.length <= 3) return { size, lines };
  }
  const size = 56;
  return { size, lines: wrap(title, Math.floor(1480 / (size * 0.56))) };
}

function svg({ title, org, icon }, index) {
  const { size, lines } = titleBlock(title);
  const lh = size * 1.18;
  const top = 70 + size;
  const orgY = top + lh * (lines.length - 1) + size * 0.95;
  const bandBottom = orgY + 70;
  const cx = W / 2;
  const cy = Math.min(bandBottom + 260, 700);
  const iconColor = ICON_COLORS[index % ICON_COLORS.length];

  // Four dotted paths from the bottom edge curving in to the icon, dots growing toward the viewer.
  const starts = [120, 560, 1110, 1550];
  const paths = starts
    .map((sx, i) => {
      const dots = [];
      const c1x = sx + (cx - sx) * 0.15;
      const c2x = cx + (sx - cx) * 0.55;
      let last = null;
      // Walk the curve finely; drop a dot whenever we've gone ~3 radii since the last one.
      for (let t = 0.1; t <= 1.02; t += 0.001) {
        const u = 1 - t; // t=1 at bottom edge
        const x = u ** 3 * cx + 3 * u * u * t * c2x + 3 * u * t * t * c1x + t ** 3 * sx;
        const y = u ** 3 * cy + 3 * u * u * t * (cy + 120) + 3 * u * t * t * (H - 160) + t ** 3 * (H + 10);
        const wx = x + Math.sin(t * Math.PI * 2.2 + i * 1.7) * 38 * t;
        const r = 3 + 15 * t * t;
        if (last && Math.hypot(wx - last[0], y - last[1]) < r * 3) continue;
        last = [wx, y];
        dots.push(`<circle cx="${wx.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`);
      }
      return `<g fill="${PATH_COLORS[i]}" opacity="0.9">${dots.join('')}</g>`;
    })
    .join('');

  const titleText = lines
    .map((l, i) => `<text x="${cx}" y="${top + i * lh}">${esc(l)}</text>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#14558f"/>
      <stop offset="${(bandBottom / H).toFixed(2)}" stop-color="#3a82b8"/>
      <stop offset="${Math.min((bandBottom + 240) / H, 0.95).toFixed(2)}" stop-color="#b9d3e6"/>
      <stop offset="1" stop-color="#eef4f9"/>
    </linearGradient>
    <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffe7a8" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#ffe7a8" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#0b3a66" flood-opacity="0.25"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <path d="M0 0 H ${W} V ${bandBottom - 60} C 1450 ${bandBottom - 150}, 1150 ${bandBottom + 10}, 850 ${bandBottom - 40} S 300 ${bandBottom - 110}, 0 ${bandBottom - 30} Z" fill="#0b4a85" opacity="0.55"/>
  <path d="M0 0 H ${W} V ${bandBottom + 30} C 1350 ${bandBottom - 50}, 1000 ${bandBottom + 80}, 700 ${bandBottom + 20} S 250 ${bandBottom - 40}, 0 ${bandBottom + 40} Z" fill="#0b4a85" opacity="0.35"/>
  <ellipse cx="${cx}" cy="${cy}" rx="420" ry="260" fill="url(#sun)"/>
  ${paths}
  <circle cx="${cx}" cy="${cy}" r="84" fill="${iconColor}" filter="url(#soft)"/>
  <g transform="translate(${cx - 60} ${cy - 60}) scale(1.2)" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path d="${ICONS[icon] ?? ICONS.senior}"/>
  </g>
  <g font-family="Avenir Next" font-weight="700" text-anchor="middle">
    <g fill="#ffffff" font-size="${size}">${titleText}</g>
    <text x="${cx}" y="${orgY}" fill="#ff7a5c" font-size="${Math.round(size * 0.56)}">${esc(org)}</text>
  </g>
</svg>`;
}

const [specFile, outDir] = process.argv.slice(2);
if (!specFile || !outDir) throw new Error('usage: make-cover.mjs <specs.json> <out-dir>');
const specs = JSON.parse(readFileSync(specFile, 'utf8'));
const work = mkdtempSync(join(tmpdir(), 'cover-'));
specs.forEach((spec, i) => {
  if (!ICONS[spec.icon]) console.warn(`  ${spec.slug}: unknown icon "${spec.icon}", using a heart`);
  const svgPath = join(work, `${spec.slug}.svg`);
  const pngPath = join(work, `${spec.slug}.png`);
  writeFileSync(svgPath, svg(spec, i));
  execFileSync('rsvg-convert', ['-w', String(W), '-h', String(H), '-o', pngPath, svgPath]);
  execFileSync('magick', [pngPath, '-quality', '86', join(outDir, `${spec.slug}.jpg`)]);
  console.log(`  ${spec.slug}.jpg`);
});
