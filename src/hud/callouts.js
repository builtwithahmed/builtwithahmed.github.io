// The signature callout system (MISSION_PLAN.md §1, §3). A fixed SVG overlay
// draws elbow leader lines from each drone component to a real DOM label
// docked in the empty region (content.js's teardown .callout-stack, which
// content.css already positions per document.body[data-layout][data-side]).
// Exactly one callout is "active" (amber) at a time, driven by six equal T
// sub-bands across the explode ramp; the rest are revealed-but-dim, not
// hidden, once their band has been reached.
import { Vector3 } from 'three';
import '../styles/callouts.css';
import { skills } from '../content/data.js';
import { decodeHeading, decodeBody } from './decode.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BAND_START = 0.13; // P2.6: takeoff beat shortened 0.16->0.13
const BAND_END = 0.34;
const BAND_WIDTH = (BAND_END - BAND_START) / skills.length;
const SHOW_FROM = 0.13;
const SHOW_UNTIL = 0.4;

export function createCallouts({ camera, drone, mountEl }) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('id', 'callouts-svg');
  svg.setAttribute('aria-hidden', 'true');
  document.body.appendChild(svg);

  const items = skills.map((skill, index) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.classList.add('callout-line');
    svg.appendChild(path);

    // Amendment F: a leader line must never terminate in empty space — an
    // anchor dot is drawn at the component's own projected position for
    // every visible callout, independent of the label end of the line.
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.classList.add('callout-dot');
    // v1.1-B #1: "the part-to-label connection is unmissable" — 3px read as
    // too fine against the brighter exploded components.
    dot.setAttribute('r', '4');
    svg.appendChild(dot);

    const label = document.createElement('div');
    label.className = 'callout-label';
    // v1.3 Step 3: id link so the gate's leader-line check can tell "this
    // line's own destination rect" (legitimately allowed to be entered)
    // apart from every other content rect (not allowed to be crossed).
    label.id = `callout-label-teardown-${index}`;
    path.dataset.targetLabel = label.id;
    label.innerHTML = `
      <h3>${skill.title}</h3>
      <p>${skill.blurb}</p>
      <div class="tags">${skill.tags.map((tag) => `<span class="tag">${tag}</span>`).join('')}</div>
    `;
    mountEl.appendChild(label);

    return { skill, path, dot, label, h3: label.querySelector('h3'), p: label.querySelector('p'), wasVisible: false };
  });

  const worldPos = new Vector3();
  const projected = new Vector3();

  function hide(item) {
    item.label.classList.remove('visible', 'active');
    item.path.style.opacity = '0';
    item.dot.style.opacity = '0';
    // v1.2 #B: label's own opacity/transform/max-height transition
    // (callouts.css) already provides the "opacity out, no scramble"
    // deactivation for the text inside it — just reset the activation
    // edge so a later re-reveal decodes in again instead of staying inert.
    item.wasVisible = false;
  }

  function update(state) {
    const { T, reducedMotion } = state;
    const inRange = T >= SHOW_FROM && T <= SHOW_UNTIL;
    const bandIndex = Math.min(items.length - 1, Math.max(0, Math.floor((T - BAND_START) / BAND_WIDTH)));
    const dockRight = state.focus === 'L'; // content docks opposite the drone's side

    // Amendment F: callouts sequence rather than list — at most a few are
    // ever visible at once, a window around the active band, so the mobile
    // stack never has to hold (and clip/scroll) all six simultaneously.
    // Desktop: previous, active, next (<=3). Mobile: active, next (<=2) —
    // the previous entry has already been read and mobile's 41vh budget
    // can't afford it.
    const isMobile = state.layout === 'stack';
    const windowMin = isMobile ? bandIndex : bandIndex - 1;
    const windowMax = bandIndex + 1;

    items.forEach((item, i) => {
      const revealed = inRange && (reducedMotion ? true : T >= BAND_START + i * BAND_WIDTH);
      const inWindow = i >= windowMin && i <= windowMax;
      if (!revealed || !inWindow) return hide(item);

      const component = drone.components[item.skill.componentKey];
      component.object.getWorldPosition(worldPos);
      projected.copy(worldPos).project(camera);

      const offscreen = projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
      if (offscreen) return hide(item);

      const active = i === bandIndex;
      // v1.2 #B: decode in once per activation (the false->true edge),
      // never re-triggered while the item just sits in its visible window.
      if (!item.wasVisible) {
        decodeHeading(item.h3, item.skill.title);
        decodeBody(item.p);
      }
      item.wasVisible = true;
      item.label.classList.add('visible');
      item.label.classList.toggle('active', active);

      const sx = (projected.x * 0.5 + 0.5) * window.innerWidth;
      const sy = ((1 - projected.y) * 0.5) * window.innerHeight;

      item.dot.setAttribute('cx', String(sx));
      item.dot.setAttribute('cy', String(sy));
      item.dot.classList.toggle('active', active);
      item.dot.style.opacity = '1';

      const labelRect = item.label.getBoundingClientRect();
      if (labelRect.width === 0) return; // not laid out yet (display:none this frame)
      const anchorX = dockRight ? labelRect.left : labelRect.right;
      const anchorY = Math.min(Math.max(sy, labelRect.top), labelRect.bottom);
      // v1.3 Step 3: route the vertical run OUTSIDE the docked content
      // BLOCK's own horizontal span (not just this label's, which sits
      // narrower/inset within it) — a vertical segment anywhere inside the
      // block eventually crosses SOMETHING there (a heading, another row)
      // purely from Y-alignment, regardless of which X inside the block it
      // picks. Confirmed live: mobile t≈0.30 crossed the teardown heading
      // this way (NOTES.md). Staying outside the whole block (the seam
      // between the 3D half and the content half, per MISSION_PLAN §3)
      // sidesteps the entire class of "line crosses unrelated content,"
      // not just this one reported instance — margining off the label's
      // own (narrower) edge measurably wasn't enough on its own.
      const blockRect = item.label.closest('.content-block')?.getBoundingClientRect() ?? labelRect;
      const blockEdge = dockRight ? blockRect.left : blockRect.right;
      const ELBOW_MARGIN = 10;
      const elbowX = dockRight ? Math.min(sx, blockEdge - ELBOW_MARGIN) : Math.max(sx, blockEdge + ELBOW_MARGIN);

      item.path.setAttribute('d', `M ${sx} ${sy} L ${elbowX} ${sy} L ${elbowX} ${anchorY} L ${anchorX} ${anchorY}`);
      item.path.classList.toggle('active', active);
      // v1.1-B #1: doubled from 0.45 — teardown must read as a schematic,
      // not have its dim (non-active) leader lines nearly invisible.
      item.path.style.opacity = active ? '1' : '0.9';
    });
  }

  return { update };
}
