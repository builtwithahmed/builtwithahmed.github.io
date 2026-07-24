// Hero + mission console content blocks. All live in one fixed grid
// (#content-stage) positioned by document.body[data-layout][data-side]
// (content.css) — this module only decides WHICH block is visible for the
// current T and writes the per-beat fades, never positioning (that's CSS's job).
import '../styles/content.css';
import '../styles/console.css';
import { identity, teardown, missionLog, inspection, services, landing, contact } from '../content/data.js';
import { decodeHeading, decodeHeadingLines, decodeEyebrow, decodeBody, decodeOut, DECODE_FADE_OUT_MS } from './decode.js';

const HERO_FADE_START = 0.08;
const HERO_FADE_END = 0.1; // "fades and translates down out of frame by T 0.10"
const TEARDOWN_START = 0.13; // P2.6: takeoff beat shortened 0.16->0.13
const TEARDOWN_END = 0.4; // matches the explode/reassemble window
const PROJECTS_START = 0.44;
const PROJECTS_END = 0.7;
const SERVICES_START = 0.71;
const SERVICES_END = 0.87;
const LANDING_START = 0.9;
const LANDING_END = 1;

export function createContent() {
  const stage = document.createElement('div');
  stage.id = 'content-stage';
  document.body.appendChild(stage);

  const hero = document.createElement('div');
  hero.className = 'content-block hero-block';
  // Icon dot lives outside the text span decodeEyebrow owns — decode.js
  // clears/rebuilds its target element's contents, so the icon can't be a
  // child of that same element or it gets wiped on every reveal.
  hero.innerHTML = `
    <div class="eyebrow"><i></i><span class="eyebrow-text">${identity.availability}</span></div>
    <h1>${identity.heroHeadlineLines[0]}<br /><span class="accent">${identity.heroHeadlineLines[1]}</span></h1>
    <p class="sub">${identity.heroSub}</p>
    <div class="ctas">
      <a class="btn-primary" href="${identity.ctaPrimary.href}">${identity.ctaPrimary.label}</a>
      <a class="btn-ghost" href="${identity.ctaSecondary.href}">${identity.ctaSecondary.label}</a>
    </div>
  `;
  stage.appendChild(hero);
  const heroEyebrowText = hero.querySelector('.eyebrow-text');
  const heroH1 = hero.querySelector('h1');
  const heroSub = hero.querySelector('.sub');
  // Hero is on screen from first paint (T=0) — no hidden->shown edge to
  // trigger off, so it decodes in once here rather than through the
  // activation tracking the other blocks use. Its existing T-driven
  // opacity/translateY fade-out (below, unchanged) is its exit; hero never
  // re-enters, so it never needs decodeOut.
  decodeEyebrow(heroEyebrowText, identity.availability);
  decodeHeadingLines(heroH1, identity.heroHeadlineLines);
  decodeBody(heroSub);

  // v1.2 #B: the real text is baked into the initial markup below (as
  // before) — this is still a client-rendered SPA with no server fallback,
  // so "SEO: real text must exist in DOM" (MISSION_PLAN §7) means present
  // as soon as the page has loaded, not gated behind a scroll-triggered
  // reveal a crawler is unlikely to simulate. decode.js's reveal functions
  // are a visual layer called on top at activation time — they clear and
  // rebuild an element's contents to animate it, always ending on the
  // exact same real text that was already there.
  const teardownBlock = document.createElement('div');
  teardownBlock.className = 'content-block teardown-block';
  teardownBlock.innerHTML = `
    <div class="teardown-header">
      <div class="eyebrow">${teardown.eyebrow}</div>
      <h2>${teardown.heading}</h2>
      <p class="sub">${teardown.sub}</p>
    </div>
    <div class="callout-stack"></div>
  `;
  stage.appendChild(teardownBlock);

  const calloutStack = teardownBlock.querySelector('.callout-stack');
  const teardownEyebrow = teardownBlock.querySelector('.eyebrow');
  const teardownH2 = teardownBlock.querySelector('h2');
  const teardownSub = teardownBlock.querySelector('.sub');

  const projectBlock = document.createElement('div');
  projectBlock.className = 'content-block project-block';
  projectBlock.innerHTML = `
    <div class="teardown-header">
      <div class="eyebrow">${missionLog.eyebrow}</div>
      <h2>${missionLog.heading}</h2>
      <p class="sub">${missionLog.sub}</p>
    </div>
    <div class="callout-stack project-stack"></div>
  `;
  stage.appendChild(projectBlock);
  const projectStack = projectBlock.querySelector('.project-stack');
  const projectEyebrow = projectBlock.querySelector('.eyebrow');
  const projectH2 = projectBlock.querySelector('h2');
  const projectSub = projectBlock.querySelector('.sub');

  const inspectionBlock = document.createElement('div');
  inspectionBlock.className = 'content-block inspection-block';
  inspectionBlock.innerHTML = `
    <div class="teardown-header">
      <div class="eyebrow">${inspection.eyebrow}</div>
      <h2>${inspection.heading}</h2>
      <p class="sub">${inspection.sub}</p>
    </div>
    <div class="console-list"></div>
  `;
  stage.appendChild(inspectionBlock);
  const consoleList = inspectionBlock.querySelector('.console-list');
  const inspectionEyebrow = inspectionBlock.querySelector('.eyebrow');
  const inspectionH2 = inspectionBlock.querySelector('h2');
  const inspectionSub = inspectionBlock.querySelector('.sub');
  const serviceRows = services.map((service) => {
    const row = document.createElement('article');
    row.className = 'console-row';
    row.innerHTML = `
      <div class="row-head">
        <span class="num">${service.num}</span>
        <h3>${service.title}</h3>
        <span class="price">${service.price}</span>
      </div>
      <p>${service.blurb}</p>
    `;
    consoleList.appendChild(row);
    return { service, row, h3: row.querySelector('h3'), p: row.querySelector('p'), wasVisible: false };
  });

  const landingBlock = document.createElement('div');
  landingBlock.className = 'content-block landing-block';
  landingBlock.innerHTML = `
    <div class="teardown-header">
      <div class="eyebrow">${landing.eyebrow}</div>
      <h2>${landing.heading}</h2>
      <p class="sub">${landing.sub}</p>
      <p class="direct">${landing.direct}</p>
    </div>
    <div class="platform-links"></div>
  `;
  stage.appendChild(landingBlock);
  const landingEyebrow = landingBlock.querySelector('.eyebrow');
  const landingH2 = landingBlock.querySelector('h2');
  const landingSub = landingBlock.querySelector('.sub');
  const landingDirect = landingBlock.querySelector('.direct');
  const platformLinks = landingBlock.querySelector('.platform-links');
  for (const item of contact) {
    const link = document.createElement('a');
    link.className = 'btn-ghost platform-link';
    link.href = item.href;
    link.target = item.href.startsWith('mailto:') ? '_self' : '_blank';
    link.rel = 'noreferrer';
    link.innerHTML = `
      <span class="icon">${item.icon}</span>
      <span class="copy">
        <strong>${item.label}</strong>
        <small>${item.sub}</small>
      </span>
    `;
    platformLinks.appendChild(link);
  }

  // v1.2 #B: content-blocks used to pop display:none<->block instantly.
  // Now the rising edge (hidden->shown) triggers each header's decode-in
  // (via onActivate) and the falling edge runs the one shared 150ms
  // opacity-out (decodeOut) before display:none, instead of an instant cut
  // — "reverse quickly and simply," never a re-scramble on exit. Each
  // block tracks its own previous-visible boolean via `.dataset.active`
  // (read back off the DOM rather than a closure var, so this stays a
  // pure function of the block + desired state, no separate state array
  // to keep in sync per block the way serviceRows needs one).
  function setVisible(block, visible, onActivate) {
    const wasVisible = block.dataset.active === 'true';
    if (visible === wasVisible) return;
    block.dataset.active = visible ? 'true' : 'false';
    if (visible) {
      if (block.__fadeTimeout) {
        clearTimeout(block.__fadeTimeout);
        block.__fadeTimeout = null;
      }
      block.style.transition = 'none';
      block.style.opacity = '1';
      block.style.display = 'block';
      onActivate();
    } else {
      decodeOut(block);
      block.__fadeTimeout = setTimeout(() => {
        block.style.display = 'none';
      }, DECODE_FADE_OUT_MS + 30);
    }
  }

  function update(state) {
    const { T, reducedMotion } = state;

    if (T <= HERO_FADE_END) {
      hero.style.display = 'block';
      const fadeT = reducedMotion
        ? T > HERO_FADE_START
          ? 1
          : 0
        : Math.max(0, Math.min(1, (T - HERO_FADE_START) / (HERO_FADE_END - HERO_FADE_START)));
      hero.style.opacity = String(1 - fadeT);
      hero.style.transform = `translateY(${fadeT * 40}px)`;
    } else {
      hero.style.display = 'none';
    }

    setVisible(teardownBlock, T >= TEARDOWN_START && T <= TEARDOWN_END, () => {
      decodeEyebrow(teardownEyebrow, teardown.eyebrow);
      decodeHeading(teardownH2, teardown.heading);
      decodeBody(teardownSub);
    });
    setVisible(projectBlock, T >= PROJECTS_START && T <= PROJECTS_END, () => {
      decodeEyebrow(projectEyebrow, missionLog.eyebrow);
      decodeHeading(projectH2, missionLog.heading);
      decodeBody(projectSub);
    });
    setVisible(inspectionBlock, T >= SERVICES_START && T <= SERVICES_END, () => {
      decodeEyebrow(inspectionEyebrow, inspection.eyebrow);
      decodeHeading(inspectionH2, inspection.heading);
      decodeBody(inspectionSub);
    });
    setVisible(landingBlock, T >= LANDING_START && T <= LANDING_END, () => {
      decodeEyebrow(landingEyebrow, landing.eyebrow);
      decodeHeading(landingH2, landing.heading);
      decodeBody(landingSub);
      decodeBody(landingDirect);
    });

    // v1.1-B #5: services used to reveal-and-never-hide, which is the
    // pre-existing mobile overflow documented in NOTES.md (2026-07-22) —
    // rows just kept accumulating for the rest of the act. Same
    // previous/active/next windowing callouts.js/projectCallouts.js
    // already use: <=3 simultaneously visible on desktop, <=2 on mobile.
    // Rows never display:none-pop — .visible/.active (console.css) still
    // drive the existing opacity/transform/max-height transition; only
    // WHICH rows carry those classes changes.
    const inServicesRange = T >= SERVICES_START && T <= SERVICES_END;
    const serviceBandWidth = (SERVICES_END - SERVICES_START) / serviceRows.length;
    const serviceBandIndex = Math.min(
      serviceRows.length - 1,
      Math.max(0, Math.floor((T - SERVICES_START) / serviceBandWidth))
    );
    const isMobile = state.layout === 'stack';
    const windowMin = isMobile ? serviceBandIndex : serviceBandIndex - 1;
    const windowMax = serviceBandIndex + 1;
    serviceRows.forEach((entry, i) => {
      const revealed = inServicesRange && (reducedMotion ? true : T >= SERVICES_START + i * serviceBandWidth);
      const inWindow = i >= windowMin && i <= windowMax;
      const visible = revealed && inWindow;
      // v1.2 #B: row titles/blurbs decode in once per activation, same
      // rising-edge rule as the section headers above — never re-triggered
      // while a row just sits in its already-revealed window.
      if (visible && !entry.wasVisible) {
        decodeHeading(entry.h3, entry.service.title);
        decodeBody(entry.p);
      }
      entry.wasVisible = visible;
      entry.row.classList.toggle('visible', visible);
      entry.row.classList.toggle('active', visible && i === serviceBandIndex);
    });

    // v1.1-B #4: the widened L/R scrim (content.css, body.scrim-on) must
    // only paint while a content-block is actually on screen — gating it
    // on data-side alone would also darken pure camera-motion transition
    // beats that share the same focus label but show no content.
    const anyBlockVisible =
      hero.style.display === 'block' ||
      teardownBlock.style.display === 'block' ||
      projectBlock.style.display === 'block' ||
      inspectionBlock.style.display === 'block' ||
      landingBlock.style.display === 'block';
    document.body.classList.toggle('scrim-on', anyBlockVisible);
  }

  return { update, calloutStack, projectStack };
}
