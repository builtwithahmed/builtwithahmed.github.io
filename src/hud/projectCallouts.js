// Project waypoint callouts for the mission-map act. This mirrors the
// skills teardown callout system, but anchors to the mission map's own
// waypoint meshes so there is a single 3D object per project, not a second
// representation invented just for labels.
import { Vector3 } from 'three';
import '../styles/callouts.css';
import { projects } from '../content/data.js';
import { decodeHeading, decodeBody } from './decode.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BAND_START = 0.44;
const BAND_END = 0.7;
const BAND_WIDTH = (BAND_END - BAND_START) / projects.length;
const SHOW_FROM = 0.44;
const SHOW_UNTIL = 0.7;

export function createProjectCallouts({ camera, waypoints, mountEl }) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('id', 'project-callouts-svg');
  svg.setAttribute('aria-hidden', 'true');
  document.body.appendChild(svg);

  const items = projects.map((project, index) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.classList.add('callout-line');
    svg.appendChild(path);

    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.classList.add('callout-dot');
    dot.setAttribute('r', '3');
    svg.appendChild(dot);

    const label = document.createElement('div');
    label.className = 'callout-label';
    label.innerHTML = `
      <h3>${project.wpt} · ${project.title}</h3>
      <p>${project.blurb}</p>
      <div class="tags">
        ${project.tags.map((tag) => `<span class="tag">${tag}</span>`).join('')}
      </div>
    `;
    mountEl.appendChild(label);

    return {
      project,
      waypoint: waypoints[index],
      path,
      dot,
      label,
      h3: label.querySelector('h3'),
      p: label.querySelector('p'),
      wasVisible: false,
    };
  });

  const worldPos = new Vector3();
  const projected = new Vector3();

  function hide(item) {
    item.label.classList.remove('visible', 'active');
    item.path.style.opacity = '0';
    item.dot.style.opacity = '0';
    item.wasVisible = false;
  }

  function update(state) {
    const { T, reducedMotion } = state;
    const inRange = T >= SHOW_FROM && T <= SHOW_UNTIL;
    const bandIndex = Math.min(items.length - 1, Math.max(0, Math.floor((T - BAND_START) / BAND_WIDTH)));
    const dockRight = state.focus === 'L';

    const isMobile = state.layout === 'stack';
    const windowMin = isMobile ? bandIndex : bandIndex - 1;
    const windowMax = bandIndex + 1;

    items.forEach((item, i) => {
      const revealed = inRange && (reducedMotion ? true : T >= BAND_START + i * BAND_WIDTH);
      const inWindow = i >= windowMin && i <= windowMax;
      if (!revealed || !inWindow) return hide(item);

      item.waypoint.mesh.getWorldPosition(worldPos);
      projected.copy(worldPos).project(camera);

      const offscreen = projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
      if (offscreen) return hide(item);

      const active = i === bandIndex;
      // v1.2 #B: decode in once per activation, same rule as callouts.js.
      if (!item.wasVisible) {
        decodeHeading(item.h3, `${item.project.wpt} · ${item.project.title}`);
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
      if (labelRect.width === 0) return;
      const anchorX = dockRight ? labelRect.left : labelRect.right;
      const anchorY = Math.min(Math.max(sy, labelRect.top), labelRect.bottom);
      const elbowX = sx + (anchorX - sx) * 0.45;

      item.path.setAttribute('d', `M ${sx} ${sy} L ${elbowX} ${sy} L ${elbowX} ${anchorY} L ${anchorX} ${anchorY}`);
      item.path.classList.toggle('active', active);
      item.path.style.opacity = active ? '1' : '0.45';
    });
  }

  return { update };
}