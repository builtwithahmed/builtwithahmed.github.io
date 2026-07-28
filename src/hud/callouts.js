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
import { decodeHeading, decodeBody, decodeEyebrow } from './decode.js';

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
    // v1.4 Step 1b: same purpose as targetLabel above, but for this line's
    // own nameplate (gate.mjs's leader-line check needs to exclude a
    // line's own component's tag, not just its destination label).
    path.dataset.sourceComponent = skill.componentKey;
    label.innerHTML = `
      <h3>${skill.title}</h3>
      <p>${skill.blurb}</p>
      <div class="tags">${skill.tags.map((tag) => `<span class="tag">${tag}</span>`).join('')}</div>
    `;
    mountEl.appendChild(label);

    // v1.4 Step 1b: diegetic hardware tag, appended to <body> directly
    // (not `mountEl`, which lives inside .teardown-block) so it stays
    // structurally outside .content-block — 3D-half furniture, invisible
    // to the anti-emptiness check by construction, not by special-casing.
    const nameplate = document.createElement('div');
    nameplate.className = 'nameplate';
    nameplate.dataset.component = skill.componentKey;
    document.body.appendChild(nameplate);

    return {
      skill,
      path,
      dot,
      label,
      nameplate,
      h3: label.querySelector('h3'),
      p: label.querySelector('p'),
      wasVisible: false,
      nameplateText: '',
    };
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
    item.nameplate.classList.remove('visible', 'active');
    // Reset (not just hide) so a later re-reveal (e.g. scrolling back past
    // this component's band) retypes instead of staying inert.
    item.nameplateText = '';
  }

  // v1.4 Step 1b: fixed screen-space offset per component, not one shared
  // constant. A uniform (+14, 0) offset for all six, first tried, was a
  // real collision the gate's new nameplate checks caught immediately —
  // but the actual root cause turned out to be simultaneity, not offset
  // direction (see the note on `revealed`/`inWindow` below): with up to 6
  // nameplates visible at once, no small constant offset separates that
  // many dense text tags, and a hexagon-spread per-component offset,
  // tried next, still failed empirically (58 failures, worse than the
  // first 18 — geometry reasoning about explode directions doesn't
  // reliably predict 2D screen clustering across a moving camera). Kept
  // here as a modest spread now that simultaneity is actually bounded to
  // 2-3 (below) — small distinct offsets still help within that smaller
  // window, verified empirically after the real fix, not assumed.
  // v1.4 post-review (3): X-COLUMN AUDIT. The Y-only tuning below (Step 3)
  // fixed the ONE reported graze but a systematic re-check — every nameplate
  // against every leader line's geometry, sampled every 0.005 T (not just
  // the gate's own 0.02 grid) across the whole teardown range, both
  // viewports — found this was one instance of a repeating pattern, not a
  // one-off: a leader line's ELBOW routing (see the `elbowX` comment further
  // down in `update()`) keeps its VERTICAL run at a fixed X — either the
  // dock-column seam, or (when a component's dot already sits past that
  // seam) the component's own screen X — and any OTHER component's
  // nameplate sitting in that same X column gets crossed regardless of Y.
  // A Y-only offset can dodge a line's horizontal run (which sits at a
  // roughly fixed content-column Y) but can never dodge a vertical run,
  // which spans a huge Y range by design. Found and fixed four instances
  // this pass, all via nudges verified against the same fine-grained sweep
  // (a scratch script, not committed) before re-confirming against the real
  // gate: escArms sat in antenna's vertical column (the originally reported
  // case) AND gimbal's nameplate sat low enough to graze escArms's own
  // horizontal run into its label AND rotors' vertical column crossed
  // antenna's nameplate AND (mobile only, reassembly window T~0.37) a
  // moving antenna simply passed through battery's nameplate's own box as
  // the drone reassembles. Every fix below is a magnitude increase on an
  // axis that component's offset already used, not a new direction.
  const NAMEPLATE_OFFSETS = {
    // y:-20 added this pass: at y:0, gimbal's nameplate's bottom edge sat
    // close enough to escArms's own leader line's horizontal run (a fixed
    // content-column Y, same category as the escArms/antenna graze below)
    // to graze it once dilated, T~0.215-0.235 desktop.
    gimbal: { x: 24, y: -20 },
    // v1.4 Step 1b: antenna was the common factor in every failure that
    // survived the windowing + explode-threshold fixes. Pushing it further
    // down (0,36) didn't help — battery explodes screen-downward too, so
    // a larger downward antenna offset moved further INTO battery's own
    // path rather than away from it. Moved to a direction none of the
    // other five offsets use (up-left) instead of just scaling the same
    // (wrong) direction further — this cleared every mobile failure and
    // left one remaining case (below).
    // v1.4 post-review (3): x -32 -> -45 — antenna's own nameplate sat far
    // enough right that rotors' leader line's vertical column (pinned at
    // rotors' own screen X once it's past the dock seam) crossed it,
    // T~0.30-0.305 desktop. Same X-column pattern as escArms below, mirror
    // fix (push further along the axis already in use).
    antenna: { x: -45, y: -20 },
    flightController: { x: -17, y: 17 },
    // v1.4 Step 3 (post-review fix): the one surviving graze was antenna's
    // OWN leader line's horizontal run (docked at its label's anchorY,
    // ~y=474, effectively pinned there by CSS layout rather than by live
    // drone position — confirmed stable across sessions/drift phases)
    // passing directly through escArms's nameplate, whose un-offset Y
    // (escArms's own dot sy) sits within ~1px of that same height at
    // T~0.24 — the two components are adjacent in the reveal sequence and
    // land close together on screen at this point in the ramp. Measured
    // exactly (scripts, not committed): escArms rect was
    // top=458.6/bottom=474.6 against the graze line at y=473.97, a 0.66px
    // overlap. Shifted -18px in y (min shift for ~15px clearance under the
    // gate's frozen reference pose, per the freeze added below — live-
    // motion margin beyond that is the rect dilation in gate.mjs, a
    // separate, deliberately independent safety net rather than folding
    // both concerns into one offset).
    // v1.4 post-review (3): that -18px in y turned out to only clear the
    // UNDILATED rect (as documented) — dilated by the gate's own +10px, the
    // margin was consumed again at nearby sub-T's (T~0.245-0.255), still
    // the exact same graze, not a new one. Also found: escArms's nameplate
    // (X unchanged at the time) sat squarely in antenna's leader line's
    // OWN vertical column (X pinned at antenna's screen X once past the
    // dock seam) — a second, independent way the same two tags conflict,
    // invisible to any Y-only fix. -24 -> -60 in x (clears the column with
    // margin) and -18 -> -34 in y (clears the dilated horizontal-run graze
    // with margin) — both confirmed via the fine-grained sweep across the
    // full teardown range, not just the original single reported T.
    escArms: { x: -60, y: -34 },
    rotors: { x: 0, y: -22 },
    // v1.4 post-review (3): y -17 -> -10. Mobile only, T~0.37-0.375 (the
    // reassembly window, near battery's own EXPLODE_VISIBLE_THRESHOLD
    // cutoff): antenna's dot descends directly through the box the -17
    // offset put battery's nameplate in. Mobile's tight explode-radius
    // cluster (EXPLODE_SCALE_MOBILE=0.45) meant sliding along X instead
    // (battery's own axis of separation from the rest of the cluster,
    // tried first) only pushed the nameplate INTO escArms/gimbal's own
    // positions instead of away from antenna's — Y, back toward battery's
    // own dot (a smaller upward shift than before), was the axis that
    // actually cleared antenna's transient path without re-entering
    // anyone else's.
    battery: { x: 17, y: -10 },
  };

  function updateNameplate(item, sx, sy, active, isMobile) {
    const skill = item.skill;
    const desired = isMobile && skill.nameplateShort ? skill.nameplateShort : skill.nameplate;
    const offset = NAMEPLATE_OFFSETS[skill.componentKey] || { x: 14, y: 0 };
    item.nameplate.style.left = `${sx + offset.x}px`;
    item.nameplate.style.top = `${sy + offset.y}px`;
    item.nameplate.classList.add('visible');
    item.nameplate.classList.toggle('active', active);
    if (desired !== item.nameplateText) {
      decodeEyebrow(item.nameplate, desired);
      item.nameplateText = desired;
    }
  }

  function update(state) {
    const { T, reducedMotion } = state;
    const inRange = T >= SHOW_FROM && T <= SHOW_UNTIL;
    // v1.4 Step 1b: windowing (below) bounded simultaneity but didn't
    // clear every collision — the remaining ones clustered exactly where
    // `state.explode` (director.js's sampleExplode, one shared k for all
    // six components) is still low: right after BAND_START (k ramping up
    // from 0) and right before reassembly finishes (k ramping back down
    // toward SHOW_UNTIL). At low k every component sits close to the
    // drone's assembled core regardless of its own explode direction, so
    // no per-component offset can separate tags anchored that close
    // together — verified by checking sampleExplode's own curve against
    // the failing T values, not guessed. A part's tag shouldn't render
    // until the part has actually separated enough to have room for one.
    const EXPLODE_VISIBLE_THRESHOLD = 0.35;
    const explodeEnough = state.explode >= EXPLODE_VISIBLE_THRESHOLD;
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
      // v1.4 Step 1b: nameplate visibility is gated by the SAME
      // prev/active/next window as the dot/line/label, not "visible for
      // the whole explode ramp" as first built — that version let up to 6
      // nameplates render at once late in the ramp, and the gate's own
      // nameplate checks caught real, dense collisions no reasonable
      // per-component offset could resolve (a hexagon spread still failed
      // empirically, worse than the original single offset). Bounding
      // simultaneity to the same <=3 desktop / <=2 mobile window the
      // label stack already uses is the actual fix — fewer tags on screen
      // at once, not a smarter place to put more of them.
      if (!revealed || !inWindow) return hide(item);

      const component = drone.components[item.skill.componentKey];
      component.object.getWorldPosition(worldPos);
      projected.copy(worldPos).project(camera);

      const offscreen = projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
      if (offscreen) return hide(item);

      const active = i === bandIndex;
      const sx = (projected.x * 0.5 + 0.5) * window.innerWidth;
      const sy = ((1 - projected.y) * 0.5) * window.innerHeight;

      // Label/dot/line don't have the low-k clustering problem (the label
      // docks in the content column, not on the drone; the dot/line just
      // track wherever the component actually is) — only the nameplate's
      // own visibility is additionally gated on explodeEnough.
      if (explodeEnough) {
        updateNameplate(item, sx, sy, active, isMobile);
      } else {
        item.nameplate.classList.remove('visible', 'active');
        item.nameplateText = '';
      }

      // v1.2 #B: decode in once per activation (the false->true edge),
      // never re-triggered while the item just sits in its visible window.
      if (!item.wasVisible) {
        decodeHeading(item.h3, item.skill.title);
        decodeBody(item.p);
      }
      item.wasVisible = true;
      item.label.classList.add('visible');
      item.label.classList.toggle('active', active);

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
