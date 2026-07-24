// Permanent post-build gate: run against `npm run preview` (not `dev`).
// Four checks, 51 T-steps (0, 0.02, ..., 1.00) per viewport:
//
//  1. Overlap — point-based (NOTES.md "Table E/G are the trustworthy
//     gates; Table D [[a Box3 AABB]] overstates"): projects each drone
//     component's actual screen position and checks it doesn't fall
//     inside any visible content rect, rather than an axis-aligned-box
//     test (which inflates during banking/rotation and produces false
//     positives — see NOTES.md 2026-07-19/20).
//  2. Anti-emptiness — at every T, at least one of {content-block,
//     callout-label, console-row, phase-readout, .blurb} must be on
//     screen, so a beat-boundary gap can never ship as a literal empty
//     frame again (NOTES.md 2026-07-21). v1.2.1 Step 4: restored the
//     strict opacity>=0.9 bar for content-block/callout-label/console-row
//     (previously "display/class present" alone was enough, a v1.2 #B
//     allowance) — EXCEPT for .blurb elements (decode.js's decodeBody
//     targets), which keep the old reveal-start allowance: a .blurb
//     counts as soon as its container has actually started revealing,
//     even while its own opacity is still ramping. That's now proven
//     bounded rather than just assumed — check 4 below.
//  3. Overflow — no visible .content-block's scrollHeight may exceed its
//     clientHeight. overflow:hidden (content.css) is a clip-only safety
//     net, never a real budget; this was added v1.1-B after a stricter
//     ad-hoc version of this same check (not committed at the time)
//     caught real, pre-existing mobile overflow on the services/project
//     blocks (NOTES.md 2026-07-22) that the overlap/anti-emptiness checks
//     structurally can't see. Formalized here so it can't silently
//     regress again — this is now part of every gate run, not a one-off.
//  4. Blurb-guard (v1.2.1 Step 4) — the "reveal-start allowance" check 2
//     grants .blurb is only safe if a .blurb can't stay mid-reveal
//     indefinitely. decode.js sets el.dataset.revealing='true' for the
//     duration of an actual reveal transition (cleared on completion);
//     this check fails if the SAME .blurb is still marked revealing more
//     than 700ms after first observed, at any T step.
import { chromium } from 'playwright';

// v1.3 Step 2.0: headless Chromium's WebGL context is SwiftShader (software),
// which scene/tier.js's renderer blacklist self-reports as tier: LOW -- and
// LOW makes post.js skip the whole composer (bloom/vignette/grain), silently,
// with no warning in this gate's own output. Every capture path now pins an
// explicit tier via ?tier= instead of leaving that to accident. Defaults to
// HIGH (what a real desktop visitor's GPU gets); override with
// CAPTURE_TIER=LOW/MED to deliberately exercise that path instead.
const CAPTURE_TIER = process.env.CAPTURE_TIER || 'HIGH';
const url = (process.env.VERIFY_URL || 'http://localhost:4173/') + `?debug&tier=${CAPTURE_TIER}`;
const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '390x844', width: 390, height: 844 },
];
const STEPS = Array.from({ length: 51 }, (_, i) => i / 50);
// v1.2.1 Step 2: camera drift (main.js) is wall-clock driven, so an unpinned
// gate run samples it at whatever phase the settle timing happened to land
// on. DRIFT_PHASE pins it via window.__setDriftPhase for a reproducible run;
// unset (default) leaves drift live, matching pre-v1.2.1 behavior.
const DRIFT_PHASE = process.env.DRIFT_PHASE !== undefined ? Number(process.env.DRIFT_PHASE) : null;

async function waitForT(page, target, { epsilon = 0.0015, timeoutMs = 15000, intervalMs = 150 } = {}) {
  const start = Date.now();
  let T = await page.evaluate(() => window.__debugT());
  while (Math.abs(T - target) > epsilon && Date.now() - start < timeoutMs) {
    await page.waitForTimeout(intervalMs);
    T = await page.evaluate(() => window.__debugT());
  }
  return T;
}

// Check 4 (see header): most T steps have nothing revealing at all, so a
// single cheap poll skips the expensive loop entirely for those. Only when
// something IS mid-reveal do we poll at intervalMs, tracking per-index (by
// querySelectorAll('.blurb') position, stable across polls since decode.js
// only ever toggles classes/attributes on these elements, never reorders
// or recreates them) how long each one has been continuously revealing.
async function checkBlurbGuard(page, { budgetMs = 700, intervalMs = 100, maxMs = 1500 } = {}) {
  const anyRevealing = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.blurb')).some((el) => el.dataset.revealing === 'true')
  );
  if (!anyRevealing) return [];

  const firstSeen = new Map();
  const failed = new Map();
  const start = Date.now();
  for (;;) {
    const revealing = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.blurb')).map((el) => el.dataset.revealing === 'true')
    );
    const now = Date.now();
    let stillAny = false;
    revealing.forEach((isRevealing, i) => {
      if (!isRevealing) {
        firstSeen.delete(i);
        return;
      }
      stillAny = true;
      if (!firstSeen.has(i)) firstSeen.set(i, now);
      const elapsed = now - firstSeen.get(i);
      if (elapsed > budgetMs && !failed.has(i)) failed.set(i, elapsed);
    });
    if (!stillAny || Date.now() - start > maxMs) break;
    await page.waitForTimeout(intervalMs);
  }
  return Array.from(failed.entries()).map(([blurbIndex, elapsedMs]) => ({ blurbIndex, elapsedMs }));
}

try {
  await fetch(url, { signal: AbortSignal.timeout(2000) });
} catch {
  console.error(`\nNo server responding at ${url}.\nStart it first: npm run preview -- --port 4173 --strictPort\n`);
  process.exit(1);
}

console.log(DRIFT_PHASE !== null ? `drift phase: pinned p=${DRIFT_PHASE}` : 'drift phase: live (unpinned)');
console.log(`render tier: ${CAPTURE_TIER} (pinned)`);

const browser = await chromium.launch();
let totalFailures = 0;
const failureLog = [];

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  if (DRIFT_PHASE !== null) {
    await page.evaluate((p) => window.__setDriftPhase(p), DRIFT_PHASE);
  }

  for (const t of STEPS) {
    await page.evaluate((tt) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.max(0, max) * tt);
    }, t);
    const settledT = await waitForT(page, t);
    // Right after landing on T, before the fixed pad below — catches a
    // freshly-triggered reveal as close to its own start as this loop's
    // granularity allows, so the 700ms budget is measured from something
    // close to the real trigger instant, not diluted by an extra wait.
    const blurbFailures = await checkBlurbGuard(page);
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

      // v1.2.1 Step 4: strict opacity>=0.9 bar restored for everything
      // except .blurb (below) — a bare display:block/.visible class is no
      // longer sufficient on its own.
      let anyVisible = false;
      document.querySelectorAll('.content-block').forEach((el) => {
        if (getComputedStyle(el).display === 'none') return;
        const opacity = el.style.opacity === '' ? 1 : Number(el.style.opacity);
        if (opacity >= 0.9) anyVisible = true;
      });
      document.querySelectorAll('.callout-label.visible, .console-row.visible').forEach((el) => {
        if (Number(getComputedStyle(el).opacity) >= 0.9) anyVisible = true;
      });
      const phaseEl = document.getElementById('phase-readout');
      if (phaseEl && Number(phaseEl.style.opacity || 0) >= 0.9) anyVisible = true;
      // The one deliberate exception: a .blurb (decode.js's decodeBody
      // targets) counts as soon as its container has started revealing,
      // even while the blurb's own opacity is still ramping — bounded by
      // the blurb-guard check (below the main loop) proving it can't stay
      // mid-reveal past 700ms. Eligibility still requires the CURRENT
      // container state to be reveal-started, not just "decoded at some
      // point" — a stale blurb under an already-hidden section must not
      // keep this permanently true.
      document.querySelectorAll('.blurb').forEach((el) => {
        if (!el.textContent.trim()) return;
        const block = el.closest('.content-block');
        if (block && getComputedStyle(block).display !== 'none') {
          anyVisible = true;
          return;
        }
        const label = el.closest('.callout-label');
        if (label && label.classList.contains('visible')) {
          anyVisible = true;
          return;
        }
        const row = el.closest('.console-row');
        if (row && row.classList.contains('visible')) {
          anyVisible = true;
        }
      });

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
    if (blurbFailures.length) {
      totalFailures++;
      failureLog.push({ vp: vp.name, t: t.toFixed(2), settledT, type: 'blurb-guard', detail: blurbFailures });
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
