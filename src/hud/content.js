// Hero + teardown-header content blocks. Both live in one fixed grid
// (#content-stage) positioned by document.body[data-layout][data-side]
// (content.css) — this module only decides WHICH block is visible for the
// current T and writes the hero fade, never positioning (that's CSS's job).
import '../styles/content.css';
import { identity, teardown } from '../content/data.js';

const HERO_FADE_START = 0.08;
const HERO_FADE_END = 0.1; // "fades and translates down out of frame by T 0.10"
const TEARDOWN_START = 0.13; // P2.6: takeoff beat shortened 0.16->0.13
const TEARDOWN_END = 0.4; // matches the explode/reassemble window

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

    teardownBlock.style.display = T >= TEARDOWN_START && T <= TEARDOWN_END ? 'block' : 'none';
  }

  return { update, calloutStack };
}
