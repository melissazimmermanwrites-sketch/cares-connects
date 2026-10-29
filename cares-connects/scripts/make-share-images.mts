/**
 * Generates the social share image and app icons into /public from SVG, so they stay in sync
 * with the brand colors and can be regenerated after a rebrand.
 *
 *   npm run make:images
 *
 * Outputs: og-image.png (1200×630, Facebook/LinkedIn/X/iMessage previews), favicon.svg,
 * favicon-32.png, apple-touch-icon.png (180), icon-192.png, icon-512.png.
 */
import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const NAVY = '#003868';
const SKY = '#5bc0de';
const RAINBOW = ['#003868', '#1a7fc1', '#5bc0de', '#6ab04c', '#ffc61e', '#ff6b4a'];
const FONT_FAMILY = 'Arial Black, Arial, Helvetica, sans-serif';

function render(svg: string, width: number): Buffer {
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true, defaultFontFamily: 'Arial' },
  })
    .render()
    .asPng();
}

/** The three-ring mark used in the header. */
function rings(x: number, y: number, size: number): string {
  const r = size * 0.32;
  const w = size * 0.12;
  return `
    <circle cx="${x + size * 0.34}" cy="${y + size * 0.34}" r="${r}" fill="none" stroke="#ffc61e" stroke-width="${w}"/>
    <circle cx="${x + size * 0.66}" cy="${y + size * 0.42}" r="${r}" fill="none" stroke="#ff6b4a" stroke-width="${w}"/>
    <circle cx="${x + size * 0.46}" cy="${y + size * 0.66}" r="${r}" fill="none" stroke="${NAVY}" stroke-width="${w}"/>`;
}

const rainbowBar = (x: number, y: number, width: number, height: number) =>
  RAINBOW.map(
    (c, i) => `<rect x="${x + (i * width) / 6}" y="${y}" width="${width / 6 + 0.5}" height="${height}" fill="${c}"/>`,
  ).join('');

const ogImage = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#ffffff"/>
  <rect x="760" y="0" width="440" height="630" fill="${SKY}"/>
  <g stroke="#ffffff" stroke-opacity=".5" stroke-width="14">
    <path d="M840 0V630M960 0V630M1080 0V630M760 150H1200M760 330H1200M760 500H1200"/>
  </g>
  <path d="M760 470 L1200 250" stroke="#ffffff" stroke-width="40" stroke-opacity=".9"/>
  <path d="M760 590 C880 540 980 640 1100 570 S1200 540 1210 545" fill="none" stroke="#1a7fc1" stroke-width="34"/>
  <g transform="translate(905 270)"><path d="M0 0 C-22-28-34-42-34-60 A34 34 0 1 1 34-60 C34-42 22-28 0 0Z" fill="${NAVY}" stroke="#fff" stroke-width="4"/><circle cy="-60" r="13" fill="#fff"/></g>
  <g transform="translate(1085 420)"><path d="M0 0 C-22-28-34-42-34-60 A34 34 0 1 1 34-60 C34-42 22-28 0 0Z" fill="#ff6b4a" stroke="#fff" stroke-width="4"/><circle cy="-60" r="13" fill="#fff"/></g>
  <g transform="translate(1020 150)"><path d="M0 0 C-22-28-34-42-34-60 A34 34 0 1 1 34-60 C34-42 22-28 0 0Z" fill="#ffc61e" stroke="#fff" stroke-width="4"/><circle cy="-60" r="13" fill="#fff"/></g>

  ${rings(70, 64, 64)}
  <text x="150" y="98" font-family="${FONT_FAMILY}" font-size="26" font-weight="900" fill="${NAVY}">CARES CONNECTS</text>
  ${rainbowBar(70, 190, 150, 10)}
  <text font-family="${FONT_FAMILY}" font-size="78" font-weight="900" fill="#0d3b66">
    <tspan x="66" y="300">Find verified</tspan>
    <tspan x="66" y="392">local help.</tspan>
  </text>
  <text font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#1f2a37">
    <tspan x="70" y="462">Food, shelter, health care, crisis support</tspan>
    <tspan x="70" y="502">and more in Placer &amp; Sacramento Counties.</tspan>
  </text>
  <rect x="70" y="540" width="300" height="56" rx="28" fill="#ff6b4a"/>
  <text x="220" y="577" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="22" font-weight="900" fill="#0a2a4a">caresconnects.org</text>
</svg>`;

const icon = (rounded: boolean) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#ffffff"/>
  ${rings(56, 56, 400)}
</svg>`;

writeFileSync('public/og-image.png', render(ogImage, 1200));
writeFileSync('public/favicon.svg', icon(true).trim() + '\n');
writeFileSync('public/favicon-32.png', render(icon(true), 32));
writeFileSync('public/apple-touch-icon.png', render(icon(false), 180));
writeFileSync('public/icon-192.png', render(icon(true), 192));
writeFileSync('public/icon-512.png', render(icon(true), 512));
console.log('Wrote public/og-image.png, favicon.svg, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png');
