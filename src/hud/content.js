// Hero + mission console content blocks. All live in one fixed grid
// (#content-stage) positioned by document.body[data-layout][data-side]
// (content.css) — this module only decides WHICH block is visible for the
// current T and writes the per-beat fades, never positioning (that's CSS's job).
import '../styles/content.css';
import '../styles/console.css';
import { identity, teardown, missionLog, inspection, services, landing, contact } from '../content/data.js';

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
  hero.innerHTML = `
    <div class="eyebrow"><i></i>${identity.availability}</div>
    <h1>${identity.heroHeadlineLines[0]}<br /><span class="accent">${identity.heroHeadlineLines[1]}</span></h1>
    <p class="sub">${identity.heroSub}</p>
    <div class="ctas">
      <a class="btn-primary" href="${identity.ctaPrimary.href}">${identity.ctaPrimary.label}</a>
      <a class="btn-ghost" href="${identity.ctaSecondary.href}">${identity.ctaSecondary.label}</a>
    </div>
  `;
  stage.appendChild(hero);

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
    return row;
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

  function setVisible(block, visible) {
    block.style.display = visible ? 'block' : 'none';
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

    setVisible(teardownBlock, T >= TEARDOWN_START && T <= TEARDOWN_END);
    setVisible(projectBlock, T >= PROJECTS_START && T <= PROJECTS_END);
    setVisible(inspectionBlock, T >= SERVICES_START && T <= SERVICES_END);
    setVisible(landingBlock, T >= LANDING_START && T <= LANDING_END);

    const serviceBandWidth = (SERVICES_END - SERVICES_START) / serviceRows.length;
    const serviceBandIndex = Math.min(
      serviceRows.length - 1,
      Math.max(0, Math.floor((T - SERVICES_START) / serviceBandWidth))
    );
    serviceRows.forEach((row, i) => {
      const visible = T >= SERVICES_START && T <= SERVICES_END && (reducedMotion ? true : T >= SERVICES_START + i * serviceBandWidth);
      row.classList.toggle('visible', visible);
      row.classList.toggle('active', visible && i === serviceBandIndex);
    });
  }

  return { update, calloutStack, projectStack };
}
