// P2.6 live review: beats with camera motion but no section content read
// as dead air ("the drone-only stretches read as dead air" — Ahmed). A
// single small diegetic line of flight-phase text — an instrument
// reporting, not a heading — fills exactly those beats and nowhere else.
// No marketing copy: this is telemetry-flavoured status text only.
import '../styles/phase.css';

const BEATS = [
  { from: 0.08, to: 0.13, text: 'ASCENDING · 40 M' }, // shortened takeoff beat
  { from: 0.38, to: 0.44, text: 'ENROUTE TO WAYPOINT ONE' }, // reassemble + climb transition
  { from: 0.7, to: 0.76, text: 'APPROACHING STRUCTURE' }, // descend-to-structure transition
];
const FADE = 0.015; // T-fraction fade in/out at each beat's edges

export function createPhaseReadout() {
  const el = document.createElement('div');
  el.id = 'phase-readout';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);

  let lastText = '';

  function update(state) {
    const { T, reducedMotion } = state;
    const beat = BEATS.find((b) => T >= b.from && T <= b.to);
    if (!beat) {
      el.style.opacity = '0';
      return;
    }
    if (beat.text !== lastText) {
      el.textContent = beat.text;
      lastText = beat.text;
    }
    if (reducedMotion) {
      el.style.opacity = '1';
      return;
    }
    const fadeIn = (T - beat.from) / FADE;
    const fadeOut = (beat.to - T) / FADE;
    el.style.opacity = String(Math.max(0, Math.min(1, fadeIn, fadeOut)));
  }

  return { update };
}
