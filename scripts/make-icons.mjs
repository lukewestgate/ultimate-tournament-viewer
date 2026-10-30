// Renders the app icons (from ui-design/design/Icon.dc.html) to PNG.
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

const BG = '#0E1A3A';
const DISC = '#FF6A3D';

const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="112" fill="${BG}"/>
<rect x="72" y="150" width="368" height="212" rx="10" fill="none" stroke="#FFFFFF" stroke-opacity=".5" stroke-width="12"/>
<path d="M150 150v212M362 150v212" stroke="#FFFFFF" stroke-opacity=".5" stroke-width="12"/>
<path d="M118 318C170 300 200 270 222 248" fill="none" stroke="#FFFFFF" stroke-opacity=".35" stroke-width="10" stroke-linecap="round" stroke-dasharray="2 22"/>
<ellipse cx="282" cy="232" rx="84" ry="34" fill="${DISC}"/>
<ellipse cx="282" cy="226" rx="52" ry="17" fill="none" stroke="#FFFFFF" stroke-opacity=".55" stroke-width="7"/>
</svg>`;

// Full-bleed square for iOS (it applies its own mask) and maskable Android.
const square = (inset) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" fill="${BG}"/>
<g transform="translate(256 256) scale(${inset}) translate(-256 -256)">
<rect x="72" y="150" width="368" height="212" rx="10" fill="none" stroke="#FFFFFF" stroke-opacity=".5" stroke-width="12"/>
<path d="M150 150v212M362 150v212" stroke="#FFFFFF" stroke-opacity=".5" stroke-width="12"/>
<ellipse cx="282" cy="232" rx="84" ry="34" fill="${DISC}"/>
<ellipse cx="282" cy="226" rx="52" ry="17" fill="none" stroke="#FFFFFF" stroke-opacity=".55" stroke-width="7"/>
</g></svg>`;

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${BG}"/><ellipse cx="256" cy="256" rx="150" ry="70" fill="${DISC}"/></svg>`;

const png = (svg, size, out) => {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  writeFileSync(out, r.render().asPng());
};

writeFileSync('public/favicon.svg', favicon);
png(rounded, 192, 'public/icon-192.png');
png(rounded, 512, 'public/icon-512.png');
png(square(0.78), 512, 'public/icon-maskable-512.png');
png(square(0.9), 180, 'public/apple-touch-icon.png');
console.log('icons written');
