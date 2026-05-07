import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    const nodePath = process.env.NODE_PATH;
    if (!nodePath) {
      throw new Error('Playwright not found. Set NODE_PATH to the Codex bundled node_modules or install Playwright.');
    }
    return createRequire(path.join(nodePath, 'package.json'))('playwright');
  }
}

function pngLooksBlank(filePath) {
  const data = fs.readFileSync(filePath);
  const sample = data.subarray(Math.max(0, data.length - 4096));
  const unique = new Set(sample);
  return unique.size < 12;
}

const { chromium } = loadPlaywright();
const target = process.env.FUZZAHOLIC_URL || 'http://127.0.0.1:3000/';
const outDir = process.env.FUZZAHOLIC_VISUAL_OUT || 'visual-check-productization';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];

async function capture(name, page) {
  const filePath = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  return {
    name,
    path: filePath,
    bytes: fs.statSync(filePath).size,
    blankish: pngLooksBlank(filePath),
  };
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 980 } });
desktop.on('pageerror', error => errors.push(error.message));
desktop.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});
await desktop.goto(target, { waitUntil: 'networkidle' });

const artifacts = [];
artifacts.push(await capture('desktop-discover', desktop));
await desktop.getByRole('button', { name: 'Effect Studio' }).first().click();
await desktop.getByRole('button', { name: 'Poster' }).first().click();
await desktop.getByRole('button', { name: 'Extrude' }).first().click();
await desktop.getByRole('button', { name: 'Scan' }).first().click();
await desktop.getByRole('button', { name: 'Viewport Expand' }).first().click();
await desktop.getByRole('button', { name: 'Background Reveal' }).first().click();
artifacts.push(await capture('desktop-effects', desktop));
await desktop.getByRole('button', { name: 'Export' }).first().click();
artifacts.push(await capture('desktop-export', desktop));

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
mobile.on('pageerror', error => errors.push(error.message));
mobile.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});
await mobile.goto(target, { waitUntil: 'networkidle' });
artifacts.push(await capture('mobile-discover', mobile));

await browser.close();

const report = {
  target,
  generatedAt: new Date().toISOString(),
  errors,
  artifacts,
  ok: errors.length === 0 && artifacts.every(artifact => artifact.bytes > 1000 && !artifact.blankish),
};

fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
