// P2.6 live review: beats with camera motion but no section content read
// as dead air ("the drone-only stretches read as dead air" — Ahmed). A
// single small diegetic line of flight-phase text — an instrument
// reporting, not a heading — fills exactly those beats and nowhere else.
// No marketing copy: this is telemetry-flavoured status text only.
import '../styles/phase.css';

const FADE = 0.015; // T-fraction fade in/out at each beat's edges

// P2.7 back-half fix: the services terminal ends at T=0.87 (content.js
// SERVICES_END) and the landing block doesn't appear until T~0.90
// (LANDING_START) — a wordless, contentless stretch that the 51-step
// verification gate confirmed was a literal dark empty frame at t=0.90.
// `from`/`to` here are deliberately 0.015 (FADE) wider on each side than
// the 0.875-0.90 span that must read as fully opaque, so the plateau
// (both fadeIn and fadeOut clamp to 1) covers exactly 0.875-0.90 — the
// fades themselves happen entirely outside that span, before/after it,
// not inside it. The extra pad past 0.90 (to 0.915, vs. LANDING_START's
// nominal 0.90) also absorbs the same damped-T-never-quite-reaches-target
// convergence slack documented elsewhere in this file and in NOTES.md —
// without it, a frame sampled at "t=0.90" that actually converged to
// T=0.8991 would fall in the gap between this beat ending and the
// landing block's display toggle flipping on.
// P2.7 back-half fix, round 2: the new permanent anti-emptiness gate (see
// above) caught two more sub-0.9-opacity dips at t=0.12 and t=0.44 that
// predate this phase entirely — both are the identical root cause as the
// 0.875-0.90 gap above (a beat's fade-out tail landing exactly on the
// next content-block's display threshold, with damped T's asymptotic
// undershoot never quite reaching that threshold on time), just smaller
// and previously below what any prior gate checked for. Padded `to` by
// FADE (0.015) past TEARDOWN_START (0.13) and PROJECTS_START (0.44)
// respectively, same technique as the RTL beat: the beat's own to.value
// is not the boundary being protected, `to - FADE` is.
const BEATS = [
  { from: 0.08, to: 0.145, text: 'ASCENDING · 40 M' }, // shortened takeoff beat; padded past TEARDOWN_START (0.13)
  { from: 0.38, to: 0.455, text: 'ENROUTE TO WAYPOINT ONE' }, // reassemble + climb transition; padded past PROJECTS_START (0.44)
  { from: 0.7, to: 0.76, text: 'APPROACHING STRUCTURE' }, // descend-to-structure transition
  { from: 0.86, to: 0.915, text: 'RTL · PAD-B' }, // bridges the services-end / landing-start gap
];

export function createPhaseReadout() {
  const el = document.createElement('div');
  el.id = 'phase-readout';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);

  let lastText = '';

  // v1.1-A #7: on mobile stack layout, a content-block docks in the same
  // bottom band this readout sits in (content.css's 41vh/33vh budgets
  // reach well past this element's `bottom: 14vh`). A phase beat's from/to
  // window can straddle a content-block's own T-range (e.g. the
  // descend-to-structure beat vs. the inspection block), so instead of
  // hand-tuning each beat's window against every block's range, suppress
  // the readout outright whenever a content-block is actually on screen
  // and opaque on data-layout=stack — the two must never share vertical
  // space there. `.style.display`/`.style.opacity` are read directly
  // (content.js sets both inline, never via a CSS class) so this needs no
  // getComputedStyle/layout read.
  function contentBandOccupied() {
    if (document.body.dataset.layout !== 'stack') return false;
    const blocks = document.querySelectorAll('.content-block');
    for (const block of blocks) {
      if (block.style.display !== 'block') continue;
      const opacity = block.style.opacity === '' ? 1 : Number(block.style.opacity);
      if (opacity >= 0.9) return true;
    }
    return false;
  }

  function update(state) {
    const { T, reducedMotion } = state;
    const beat = BEATS.find((b) => T >= b.from && T <= b.to);
    if (!beat || contentBandOccupied()) {
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
