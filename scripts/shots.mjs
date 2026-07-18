// Screenshot loop for the §4 Rule-of-the-Empty-Half critique: scrolls the
// preview page through t = 0, 0.1 … 1.0 at two viewports and saves stills
// to shots/ (gitignored — inspect locally, do not commit the images).
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const url = process.env.VERIFY_URL || 'http://localhost:4173/';
const OUT_DIR = 'shots';
const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '390x844', width: 390, height: 844 },
];
const STEPS = Array.from({ length: 11 }, (_, i) => i / 10); // 0, 0.1 ... 1.0

try {
  await fetch(url, { signal: AbortSignal.timeout(2000) });
} catch {
  console.error(
    `\nNo server responding at ${url}.\nStart it first: npm run preview -- --port 4173 --strictPort\n`
  );
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  for (const t of STEPS) {
    await page.evaluate((tt) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.max(0, max) * tt);
    }, t);
    await page.waitForTimeout(600);
    const path = `${OUT_DIR}/${vp.name}_t${t.toFixed(2)}.png`;
    await page.screenshot({ path });
    console.log('saved', path);
  }

  await page.close();
}

await browser.close();
