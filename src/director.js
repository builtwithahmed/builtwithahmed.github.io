// The single source of scroll truth (MISSION_PLAN.md §5). Everything else —
// camera, drone target, HUD, and (in P2+) content placement via
// document.body.dataset.side — reads from the state this module produces.
//
// Keyframe cam/look/drone coordinates are ported verbatim from the v1
// prototype's KF array (reference/v1-prototype.html:571-582) — already
// tuned for this world scale, per instruction. `focus` is new: each
// keyframe is tagged with the §5 act it falls in, so the side flips at
// keyframe boundaries rather than interpolating (L/R/C is categorical).
const KEYFRAMES = [
  // Amendment D-a: cam pulled in from z=8.5 to ~30-35% frame width (was
  // ~11-14%) — moved the camera closer rather than scaling the model, per
  // instruction. Tuned empirically against __debugNDC().bboxWidthPct. The
  // look-at is deliberately below the drone's own y (1.6) rather than
  // matching it — looking straight at the drone put its bbox dead center,
  // which at this larger on-screen size collided with the hero content's
  // bottom-third band (Table G); tilting the look down pushes the drone
  // higher in frame without touching horizontal framing/width%.
  { t: 0.00, cam: [0, 1.85, 4.3], look: [0, 0.85, 0], drone: [0, 1.6, 0], focus: 'C' }, // PREFLIGHT
  { t: 0.10, cam: [4.5, 2.4, 4.5], look: [0, 1.9, -3], drone: [0.3, 2.2, -3], focus: 'C' }, // TAKEOFF
  // Holds a neutral (unshifted) look-at right up to the L transition — same
  // fix as the t=0.70 keyframe below, mirrored: without it, interpolation
  // toward idx @0.22's L offset drifts the drone off-center while still
  // labeled C (caught on the narrow mobile viewport at t=0.20). Drone
  // position matches the point already on the idx@0.10->idx@0.22 curve.
  { t: 0.20, cam: [5.7, 2.96, -3.37], look: [0, 2.36, -11.33], drone: [-1.37, 2.39, -9.48], focus: 'C' },
  { t: 0.22, cam: [5.8, 3.0, -4], look: [2.2, 2.4, -12], drone: [-1.5, 2.4, -10], focus: 'L', mobileLook: -0.6 }, // TEARDOWN (left)
  // Holds a strong L offset right up to the R transition — the origin-only
  // NDC check missed this, but the silhouette (full bounding-box) check
  // caught it: by t=0.30 the look-at had already interpolated to within
  // ~0.08 of neutral on its way toward idx @0.36's R offset, so the box's
  // right edge crossed into positive NDC while still labeled L. Drone
  // position matches the point already on the idx@0.22->idx@0.36 curve.
  { t: 0.30, cam: [-1.23, 3.36, -7.64], look: [3.5, 2.64, -14.43], drone: [0.14, 2.7, -13.03], focus: 'L', mobileLook: 1.9 },
  { t: 0.36, cam: [-5.8, 3.6, -10], look: [-1.5, 2.8, -16], drone: [1.2, 2.9, -15], focus: 'R', mobileLook: -0.285 }, // TEARDOWN (flipped)
  // Amendment B gate (fully-on-screen): the raw interpolation between the
  // close-up teardown camera and the wide top-down mission-map camera
  // swings through a mid-transition pose that overshoots the R bound —
  // both endpoints are fine on their own, the swing between them isn't.
  // Drone position matches the point already on the idx@0.36->idx@0.46
  // curve; only cam/look retuned to close the gap during the swing.
  { t: 0.4, cam: [-3.76, 5.68, -11.41], look: [-1.0, 2.45, -19.17], drone: [0.78, 2.79, -16.76], focus: 'R', mobileLook: 0.15 },
  { t: 0.46, cam: [0, 9.5, -14], look: [-6, 1.8, -25], drone: [0, 2.6, -20], focus: 'R', mobileLook: -3.0 }, // MISSION MAP
  { t: 0.60, cam: [0.5, 11.5, -21], look: [-11, 1.8, -30], drone: [-3.0, 3.8, -27], focus: 'R', mobileLook: -9.0 }, // MISSION MAP
  // Holds the R offset right up to the C transition — without this, the
  // interpolation toward idx @0.72's neutral look-at drifts the drone back
  // toward center before the focus label itself flips (caught by the P1
  // NDC gate at t=0.70). Drone position here matches the point already on
  // the idx@0.60->idx@0.72 curve at t=0.70 — only cam/look were retuned.
  { t: 0.70, cam: [6.06, 5.48, -29.33], look: [-9, 2.45, -37.4], drone: [-0.22, 2.87, -35.33], focus: 'R', mobileLook: -6.3 },
  { t: 0.72, cam: [6.5, 5.0, -30], look: [0, 2.5, -38], drone: [0, 2.8, -36], focus: 'C', mobileLook: 0 }, // descend to structure
  { t: 0.84, cam: [4.8, 5.2, -40], look: [2.0, 4.5, -44], drone: [-1.2, 4.6, -42.5], focus: 'L', mobileLook: -1.15 }, // INSPECTION
  // Amendment B gate: raw interpolation between the INSPECTION orbit and
  // the RTL descent swings well left of center despite both endpoints'
  // look-at being fairly neutral — same "swing between distinct camera
  // setups overshoots mid-transition" issue as t=0.40 above. Drone
  // position matches the existing idx@0.84->idx@0.93 curve.
  { t: 0.9, cam: [3.84, 4.31, -45.19], look: [-4.0, 2.28, -51.41], drone: [0.06, 3.12, -48.06], focus: 'C', mobileLook: -4.0 },
  { t: 0.93, cam: [3.5, 4.0, -47], look: [0, 1.5, -54], drone: [0.5, 2.6, -50], focus: 'C' }, // RTL
  { t: 1.00, cam: [0, 5.2, -48.5], look: [0, 0.5, -55], drone: [0, 0.3, -55], focus: 'C' }, // LANDING
];

const MODES = [
  [0.05, 'STANDBY', 'WPT 0/6 · HOME'],
  [0.16, 'TAKEOFF', 'WPT 0/6 · CLIMB'],
  [0.38, 'SYSTEMS CHECK', 'SECTOR · SKILLS'],
  [0.70, 'AUTO · MISSION', 'WPT 0/6 · PROJECTS'],
  [0.90, 'INSPECT', 'STRUCTURE · SERVICES'],
  [1.01, 'LAND', 'WPT 6/6 · PAD-B'],
];

function smoothstep(u) {
  return u * u * (3 - 2 * u);
}

function lerp3(a, b, u) {
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

function sampleKeyframes(t) {
  let i = 0;
  while (i < KEYFRAMES.length - 2 && KEYFRAMES[i + 1].t < t) i++;
  const a = KEYFRAMES[i];
  const b = KEYFRAMES[i + 1];
  const uRaw = (t - a.t) / (b.t - a.t);
  const u = smoothstep(uRaw);
  const gapA = a.mobileGap ?? LATERAL_SCALE_MOBILE;
  const gapB = b.mobileGap ?? LATERAL_SCALE_MOBILE;
  // Some segments don't respond usably to proportional gap scaling at all
  // (see director.js history) — mobileLook is an absolute look.x override
  // for stack layout, used instead of the scaled-gap formula when present.
  const mobileLookA = a.mobileLook ?? null;
  const mobileLookB = b.mobileLook ?? null;
  const mobileLook =
    mobileLookA !== null || mobileLookB !== null
      ? (mobileLookA ?? a.look[0]) + ((mobileLookB ?? b.look[0]) - (mobileLookA ?? a.look[0])) * u
      : null;
  return {
    cam: lerp3(a.cam, b.cam, u),
    look: lerp3(a.look, b.look, u),
    drone: lerp3(a.drone, b.drone, u),
    mobileGap: gapA + (gapB - gapA) * u,
    mobileLook,
    // T approaches any target asymptotically from below and never exactly
    // reaches it, so sampling right at a keyframe's own t always lands with
    // uRaw -> 1 (interpolated values basically AT the next keyframe) while
    // the old bracket-lower-only `a.focus` would still report the PREVIOUS
    // focus — camera clearly at the new framing, label still says the old
    // side. Flip focus at the interpolation midpoint instead, matching
    // where the visual blend is actually balanced.
    focus: uRaw < 0.5 ? a.focus : b.focus,
  };
}

// Amendment A (mobile layout) + Amendment B (tier-aware scene scale).
// Below 760px, L/R both collapse to a vertical "stack" split (3D top,
// content bottom) — see content.css. Amendment B: mobile silhouettes were
// leaving the frame even after FOV compensation, so scale the drone's
// lateral (x) excursion from center and its explode radius down on
// portrait, rather than widening FOV further (which produces edge
// stretching — a real artifact, unlike line-bowing).
const MOBILE_QUERY = window.matchMedia('(max-width: 759px)');
const LATERAL_SCALE_MOBILE = 0.15;
const EXPLODE_SCALE_MOBILE = 0.45;

function sampleMode(t) {
  for (const [threshold, mode, waypoint] of MODES) {
    if (t < threshold) return { mode, waypoint };
  }
  const last = MODES[MODES.length - 1];
  return { mode: last[1], waypoint: last[2] };
}

// §5 TEARDOWN: explode 0->1 across T 0.16-0.34, hold, reassemble 1->0 across 0.34-0.40.
function sampleExplode(t) {
  if (t <= 0.16) return 0;
  if (t <= 0.34) return smoothstep((t - 0.16) / (0.34 - 0.16));
  if (t <= 0.4) return 1 - smoothstep((t - 0.34) / (0.4 - 0.34));
  return 0;
}

export function createDirector() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    T: 0,
    focus: 'C',
    layout: MOBILE_QUERY.matches ? 'stack' : 'split',
    explodeScale: MOBILE_QUERY.matches ? EXPLODE_SCALE_MOBILE : 1,
    // Read from KEYFRAMES[0] rather than duplicated by hand — a hand-
    // copied value here silently went stale when Amendment D-a moved the
    // t=0 camera closer, leaving main.js's camPos/camLook to lerp in from
    // the old position on every page load instead of starting there. That
    // lerp needs real (rAF-throttle-prone) frame time to catch up, which
    // made t=0 gate measurements nondeterministic even though T itself
    // never needed to move. One source of truth removes the drift risk.
    cam: [...KEYFRAMES[0].cam],
    look: [...KEYFRAMES[0].look],
    dronePos: [...KEYFRAMES[0].drone],
    explode: 0,
    altitude: 0,
    speed: 0,
    battery: 100,
    satellites: 14,
    mode: 'STANDBY',
    waypoint: 'WPT 0/6 · HOME',
    reducedMotion,
  };

  function applyLayout() {
    state.layout = MOBILE_QUERY.matches ? 'stack' : 'split';
    state.explodeScale = MOBILE_QUERY.matches ? EXPLODE_SCALE_MOBILE : 1;
    document.body.dataset.layout = state.layout;
  }
  applyLayout();
  MOBILE_QUERY.addEventListener('change', applyLayout);

  let prevDronePos = state.dronePos;

  function rawT() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  }

  function update(dt) {
    const damp = reducedMotion ? 1 : 1 - Math.exp(-4.2 * dt);
    state.T += (rawT() - state.T) * damp;

    const sample = sampleKeyframes(state.T);
    // The P1 framing technique pushes the drone off-center by opening a gap
    // between the drone's x and the camera's look-at x. Scaling drone.x
    // itself (moving the actual flight path) was tried first and didn't
    // behave predictably — some segments got worse, not better, and it
    // conflates "how far off-center the framing is" with "where the drone
    // actually flies," which shouldn't depend on the viewer's device.
    // Scaling cam.x too was also tried and made things worse (camera
    // geometry varies too much segment-to-segment for a uniform rig-wide
    // scale). What actually drives the on-screen offset is the *gap*
    // between drone.x and look.x — so leave the drone's real flight path
    // alone and only shrink that gap.
    const gapScale = state.layout === 'stack' ? sample.mobileGap : 1;
    state.cam = sample.cam;
    const lookX =
      state.layout === 'stack' && sample.mobileLook !== null
        ? sample.mobileLook
        : sample.drone[0] + (sample.look[0] - sample.drone[0]) * gapScale;
    state.look = [lookX, sample.look[1], sample.look[2]];
    prevDronePos = state.dronePos;
    state.dronePos = sample.drone;
    state.focus = sample.focus;
    // §6(6): reduced motion skips the explode animation — component parts
    // are simply exploded (k=1) for the whole teardown range, not ramped.
    state.explode = reducedMotion ? (state.T >= 0.16 && state.T <= 0.4 ? 1 : 0) : sampleExplode(state.T);

    const vx = state.dronePos[0] - prevDronePos[0];
    const vy = state.dronePos[1] - prevDronePos[1];
    const vz = state.dronePos[2] - prevDronePos[2];
    state.speed = Math.sqrt(vx * vx + vy * vy + vz * vz) / Math.max(dt, 1e-4);
    state.altitude = Math.max(0, state.dronePos[1]);
    state.battery = Math.max(0, 100 - state.T * 68);

    const modeInfo = sampleMode(state.T);
    state.mode = modeInfo.mode;
    state.waypoint = modeInfo.waypoint;

    document.body.dataset.side = state.focus;

    return state;
  }

  return { state, update };
}
