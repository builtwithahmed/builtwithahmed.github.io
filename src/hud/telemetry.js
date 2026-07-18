// Persistent HUD, driven entirely by director state (MISSION_PLAN.md §5).
// Never computes its own values — director.js is the single source of truth.
import '../styles/hud.css';

const WRITE_INTERVAL = 1 / 12; // throttle DOM writes to ~12fps

export function createTelemetry() {
  const root = document.createElement('div');
  root.id = 'hud';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <span class="hud-corner tl"></span><span class="hud-corner tr"></span>
    <span class="hud-corner bl"></span><span class="hud-corner br"></span>
    <div class="hud-rec"><i></i>LIVE TELEMETRY</div>
    <div class="hud-tele">
      <div><b>ALT</b><span data-f="alt">0.0</span> m</div>
      <div><b>SPD</b><span data-f="spd">0.0</span> m/s</div>
      <div><b>BAT</b><span data-f="bat">100</span> %</div>
      <div><b>SAT</b><span data-f="sat">14</span> · 3D FIX</div>
    </div>
    <div class="hud-mode">
      <div class="mode" data-f="mode">STANDBY</div>
      <div class="wpt" data-f="wpt">WPT 0/6 · HOME</div>
    </div>
  `;
  document.body.appendChild(root);

  const els = {
    alt: root.querySelector('[data-f="alt"]'),
    spd: root.querySelector('[data-f="spd"]'),
    bat: root.querySelector('[data-f="bat"]'),
    sat: root.querySelector('[data-f="sat"]'),
    mode: root.querySelector('[data-f="mode"]'),
    wpt: root.querySelector('[data-f="wpt"]'),
  };

  let lastWrite = -Infinity;

  function update(state, time) {
    if (time - lastWrite < WRITE_INTERVAL) return;
    lastWrite = time;
    els.alt.textContent = state.altitude.toFixed(1);
    els.spd.textContent = Math.min(state.speed * 3.2, 18).toFixed(1);
    els.bat.textContent = Math.round(state.battery);
    els.sat.textContent = state.satellites;
    els.mode.textContent = state.mode;
    els.wpt.textContent = state.waypoint;
  }

  return { update };
}
