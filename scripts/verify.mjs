// Gate check against `npm run preview`: hashed bundle loads, zero failed/4xx+
// requests, zero console errors, WebGL context active on #scene.
import { chromium } from 'playwright';

const url = process.env.VERIFY_URL || 'http://localhost:4173/';

try {
  await fetch(url, { signal: AbortSignal.timeout(2000) });
} catch {
  console.error(
    `\nNo server responding at ${url}.\nStart it first: npm run preview -- --port 4173 --strictPort\n`
  );
  process.exit(1);
}

const consoleMessages = [];
const failedRequests = [];
const badResponses = [];

const browser = await chromium.launch();
const page = await browser.newPage();

page.on('console', (msg) => {
  consoleMessages.push({ type: msg.type(), text: msg.text() });
});
page.on('pageerror', (err) => {
  consoleMessages.push({ type: 'pageerror', text: String(err) });
});
page.on('requestfailed', (req) => {
  failedRequests.push({ url: req.url(), failure: req.failure()?.errorText });
});
page.on('response', (res) => {
  if (res.status() >= 400) {
    badResponses.push({ url: res.url(), status: res.status() });
  }
});

const response = await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

const title = await page.title();
const scriptSrcs = await page.evaluate(() =>
  Array.from(document.querySelectorAll('script[src]')).map((s) => s.src)
);
const canvasInfo = await page.evaluate(() => {
  const c = document.getElementById('scene');
  if (!c) return null;
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  return { exists: true, width: c.width, height: c.height, hasWebGLContext: !!gl };
});

console.log('--- PAGE LOAD ---');
console.log('status:', response.status());
console.log('title:', title);
console.log('script tags:', scriptSrcs);
console.log('canvas info:', JSON.stringify(canvasInfo));
console.log('--- CONSOLE MESSAGES ---');
console.log(JSON.stringify(consoleMessages, null, 2));
console.log('--- FAILED REQUESTS ---');
console.log(JSON.stringify(failedRequests, null, 2));
console.log('--- BAD RESPONSES (>=400) ---');
console.log(JSON.stringify(badResponses, null, 2));

const errors = consoleMessages.filter((m) => m.type === 'error' || m.type === 'pageerror');
const ok =
  errors.length === 0 &&
  failedRequests.length === 0 &&
  badResponses.length === 0 &&
  canvasInfo?.hasWebGLContext;

console.log('--- GATE RESULT ---');
console.log(ok ? 'PASS' : 'FAIL');

await browser.close();
process.exit(ok ? 0 : 1);
