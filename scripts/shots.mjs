// Screenshot loop for the §4 Rule-of-the-Empty-Half critique: scrolls the
// preview page through t = 0, 0.1 … 1.0 at two viewports and saves stills
// to shots/ (gitignored — inspect locally, do not commit the images).
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

// ?debug attaches window.__debugT (main.js) so this can poll for real
// convergence instead of guessing a wall-clock delay — see the note by
// waitForT below. It attaches no visible UI, so screenshots are unaffected.
const url = (process.env.VERIFY_URL || 'http://localhost:4173/') + '?debug';
const OUT_DIR = 'shots';
const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '390x844', width: 390, height: 844 },
];
// Standard 0, 0.1 ... 1.0 grid plus the P2 gate's finer-grained steps around
// the Act I/II beat transitions (hero fade, teardown explode ramp).
const STANDARD_STEPS = Array.from({ length: 11 }, (_, i) => i / 10);
const EXTRA_STEPS = [0.12, 0.18, 0.24, 0.3, 0.36];
const STEPS = [...new Set([...STANDARD_STEPS, ...EXTRA_STEPS])].sort((a, b) => a - b);

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

// P2.5: a fixed wall-clock wait here (1200ms, previously bumped from
// 600ms) turned out to be unreliable for a different reason than settle
// *rate* — headless Chromium can throttle requestAnimationFrame on a
// backgrounded page, so wall-clock time doesn't reliably map to
// accumulated animation dt at all (observed: T reaching only 0.065 of a
// 0.10 target after a 2000ms wait in this environment). Poll the actual
// damped T (via ?debug's window.__debugT) until it truly converges,
// instead of guessing a delay that may or may not be enough depending on
// how throttled this particular run is. See NOTES.md.
async function waitForT(page, target, { epsilon = 0.0015, timeoutMs = 15000, intervalMs = 150 } = {}) {
  const start = Date.now();
  let T = await page.evaluate(() => window.__debugT());
  while (Math.abs(T - target) > epsilon && Date.now() - start < timeoutMs) {
    await page.waitForTimeout(intervalMs);
    T = await page.evaluate(() => window.__debugT());
  }
  return T;
}

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  for (const t of STEPS) {
    await page.evaluate((tt) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.max(0, max) * tt);
    }, t);
    await waitForT(page, t);
    // Camera position/look-at damp *toward* the already-damped T (a
    // cascaded lag) — give it a little more time to catch up once T
    // itself has landed.
    await page.waitForTimeout(400);
    const path = `${OUT_DIR}/${vp.name}_t${t.toFixed(2)}.png`;
    await page.screenshot({ path });
    console.log('saved', path);
  }

  await page.close();
}

await browser.close();
