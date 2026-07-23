// Permanent post-build gate: run against `npm run preview` (not `dev`).
// Three checks, 51 T-steps (0, 0.02, ..., 1.00) per viewport:
//
//  1. Overlap — point-based (NOTES.md "Table E/G are the trustworthy
//     gates; Table D [[a Box3 AABB]] overstates"): projects each drone
//     component's actual screen position and checks it doesn't fall
//     inside any visible content rect, rather than an axis-aligned-box
//     test (which inflates during banking/rotation and produces false
//     positives — see NOTES.md 2026-07-19/20).
//  2. Anti-emptiness — at every T, at least one of {visible content-block,
//     visible callout-label, visible console-row, phase-readout} must be
//     at effective opacity >= 0.9, so a beat-boundary gap can never ship
//     as a literal empty frame again (NOTES.md 2026-07-21).
//  3. Overflow — no visible .content-block's scrollHeight may exceed its
//     clientHeight. overflow:hidden (content.css) is a clip-only safety
//     net, never a real budget; this was added v1.1-B after a stricter
//     ad-hoc version of this same check (not committed at the time)
//     caught real, pre-existing mobile overflow on the services/project
//     blocks (NOTES.md 2026-07-22) that the overlap/anti-emptiness checks
//     structurally can't see. Formalized here so it can't silently
//     regress again — this is now part of every gate run, not a one-off.
import { chromium } from 'playwright';

const url = (process.env.VERIFY_URL || 'http://localhost:4173/') + '?debug';
const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '390x844', width: 390, height: 844 },
];
const STEPS = Array.from({ length: 51 }, (_, i) => i / 50);

async function waitForT(page, target, { epsilon = 0.0015, timeoutMs = 15000, intervalMs = 150 } = {}) {
  const start = Date.now();
  let T = await page.evaluate(() => window.__debugT());
  while (Math.abs(T - target) > epsilon && Date.now() - start < timeoutMs) {
    await page.waitForTimeout(intervalMs);
    T = await page.evaluate(() => window.__debugT());
  }
  return T;
}

try {
  await fetch(url, { signal: AbortSignal.timeout(2000) });
} catch {
  console.error(`\nNo server responding at ${url}.\nStart it first: npm run preview -- --port 4173 --strictPort\n`);
  process.exit(1);
}

const browser = await chromium.launch();
let totalFailures = 0;
const failureLog = [];

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  for (const t of STEPS) {
    await page.evaluate((tt) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.max(0, max) * tt);
    }, t);
    const settledT = await waitForT(page, t);
    await page.waitForTimeout(400);

    const result = await page.evaluate(() => {
      const ndc = window.__debugNDC();
      const cssW = window.innerWidth;
      const cssH = window.innerHeight;

      function toPx(p) {
        return { x: (p.x * 0.5 + 0.5) * cssW, y: (1 - (p.y * 0.5 + 0.5)) * cssH };
      }

      const rects = [];
      document.querySelectorAll('.content-block').forEach((el) => {
        if (getComputedStyle(el).display === 'none') return;
        const opacity = el.style.opacity === '' ? 1 : Number(el.style.opacity);
        if (opacity < 0.9) return;
        rects.push(el.getBoundingClientRect());
      });
      document.querySelectorAll('.callout-label.visible, .console-row.visible').forEach((el) => {
        rects.push(el.getBoundingClientRect());
      });

      const overlaps = [];
      for (const [key, p] of Object.entries(ndc.components)) {
        if (p.z > 1) continue; // behind camera
        const px = toPx(p);
        for (const r of rects) {
          if (r.width === 0 || r.height === 0) continue;
          if (px.x >= r.left && px.x <= r.right && px.y >= r.top && px.y <= r.bottom) {
            overlaps.push({ component: key, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, px });
          }
        }
      }

      let anyVisible = false;
      document.querySelectorAll('.content-block').forEach((el) => {
        if (getComputedStyle(el).display === 'none') return;
        const opacity = el.style.opacity === '' ? 1 : Number(el.style.opacity);
        if (opacity >= 0.9) anyVisible = true;
      });
      document.querySelectorAll('.callout-label.visible, .console-row.visible').forEach(() => {
        anyVisible = true;
      });
      const phaseEl = document.getElementById('phase-readout');
      if (phaseEl && Number(phaseEl.style.opacity || 0) >= 0.9) anyVisible = true;

      const clipped = [];
      document.querySelectorAll('.content-block').forEach((el) => {
        if (getComputedStyle(el).display === 'none') return;
        if (el.scrollHeight > el.clientHeight + 2) {
          clipped.push({ cls: el.className, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
        }
      });

      return { overlaps, anyVisible, clipped, layout: ndc.layout, focus: ndc.focus };
    });

    if (result.overlaps.length) {
      totalFailures++;
      failureLog.push({ vp: vp.name, t: t.toFixed(2), settledT, type: 'overlap', detail: result.overlaps });
    }
    if (!result.anyVisible) {
      totalFailures++;
      failureLog.push({ vp: vp.name, t: t.toFixed(2), settledT, type: 'empty', layout: result.layout, focus: result.focus });
    }
    if (result.clipped.length) {
      totalFailures++;
      failureLog.push({ vp: vp.name, t: t.toFixed(2), settledT, type: 'overflow', detail: result.clipped });
    }
  }

  console.log(`${vp.name}: done`);
  await page.close();
}

await browser.close();

console.log('--- GATE RESULT ---');
console.log(JSON.stringify(failureLog, null, 2));
console.log(totalFailures === 0 ? 'PASS (0 failures)' : `FAIL (${totalFailures} failures)`);
process.exit(totalFailures === 0 ? 0 : 1);
