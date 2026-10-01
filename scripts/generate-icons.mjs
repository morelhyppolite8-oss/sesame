// Génère les icônes PNG de la PWA à partir d'un dessin vectoriel, avec le Chromium de Playwright.
import { chromium } from '@playwright/test';

// Emblème : une clé ancienne dans un double cercle or champagne, sur fond noir.
const icon = (size, padding) => `<!doctype html><html><head><style>html,body{margin:0;background:#0B0B0C}</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0B0B0C"/>
  <g transform="translate(256 256) scale(${1 - padding}) translate(-256 -256)">
    <circle cx="256" cy="256" r="200" fill="none" stroke="#C9A96E" stroke-width="5"/>
    <circle cx="256" cy="256" r="178" fill="none" stroke="#C9A96E" stroke-opacity=".35" stroke-width="3"/>
    <g fill="none" stroke="#C9A96E" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="184" cy="256" r="52"/>
      <circle cx="184" cy="256" r="21" stroke-width="9"/>
      <path d="M236 256H368 M324 256v40 M364 256v28"/>
    </g>
  </g>
</svg></body></html>`;

const targets = [
  ['public/pwa-192.png', 192, 0],
  ['public/pwa-512.png', 512, 0],
  ['public/pwa-maskable-512.png', 512, 0.22],
  ['public/apple-touch-icon.png', 180, 0.08],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, pad] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(icon(size, pad));
  await page.waitForTimeout(150);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('Icônes générées.');
