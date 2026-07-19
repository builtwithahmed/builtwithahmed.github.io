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
  { t: 0.00, cam: [0, 2.0, 8.5], look: [0, 1.6, 0], drone: [0, 1.6, 0], focus: 'C' }, // PREFLIGHT
  { t: 0.10, cam: [4.5, 2.4, 4.5], look: [0, 1.9, -3], drone: [0.3, 2.2, -3], focus: 'C' }, // TAKEOFF
  // Holds a neutral (unshifted) look-at right up to the L transition — same
  // fix as the t=0.70 keyframe below, mirrored: without it, interpolation
  // toward idx @0.22's L offset drifts the drone off-center while still
  // labeled C (caught on the narrow mobile viewport at t=0.20). Drone
  // position matches the point already on the idx@0.10->idx@0.22 curve.
  { t: 0.20, cam: [5.7, 2.96, -3.37], look: [0, 2.36, -11.33], drone: [-1.37, 2.39, -9.48], focus: 'C' },
  { t: 0.22, cam: [5.8, 3.0, -4], look: [2.5, 2.4, -12], drone: [-1.5, 2.4, -10], focus: 'L' }, // TEARDOWN (left)
  // Holds a strong L offset right up to the R transition — the origin-only
  // NDC check missed this, but the silhouette (full bounding-box) check
  // caught it: by t=0.30 the look-at had already interpolated to within
  // ~0.08 of neutral on its way toward idx @0.36's R offset, so the box's
  // right edge crossed into positive NDC while still labeled L. Drone
  // position matches the point already on the idx@0.22->idx@0.36 curve.
  { t: 0.30, cam: [-1.23, 3.36, -7.64], look: [3.5, 2.64, -14.43], drone: [0.14, 2.7, -13.03], focus: 'L' },
  { t: 0.36, cam: [-5.8, 3.6, -10], look: [-1.5, 2.8, -16], drone: [1.2, 2.9, -15], focus: 'R' }, // TEARDOWN (flipped)
  { t: 0.46, cam: [0, 9.5, -14], look: [-6, 1.8, -25], drone: [0, 2.6, -20], focus: 'R' }, // MISSION MAP
  { t: 0.60, cam: [0.5, 11.5, -21], look: [-11, 1.8, -30], drone: [-3.0, 3.8, -27], focus: 'R' }, // MISSION MAP
  // Holds the R offset right up to the C transition — without this, the
  // interpolation toward idx @0.72's neutral look-at drifts the drone back
  // toward center before the focus label itself flips (caught by the P1
  // NDC gate at t=0.70). Drone position here matches the point already on
  // the idx@0.60->idx@0.72 curve at t=0.70 — only cam/look were retuned.
  { t: 0.70, cam: [6.06, 5.48, -29.33], look: [-9, 2.45, -37.4], drone: [-0.22, 2.87, -35.33], focus: 'R' },
  { t: 0.72, cam: [6.5, 5.0, -30], look: [0, 2.5, -38], drone: [0, 2.8, -36], focus: 'C' }, // descend to structure
  { t: 0.84, cam: [4.8, 5.2, -40], look: [2.0, 4.5, -44], drone: [-1.2, 4.6, -42.5], focus: 'L' }, // INSPECTION
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
  const u = smoothstep((t - a.t) / (b.t - a.t));
  return {
    cam: lerp3(a.cam, b.cam, u),
    look: lerp3(a.look, b.look, u),
    drone: lerp3(a.drone, b.drone, u),
    focus: a.focus,
  };
}

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
    cam: [0, 2.0, 8.5],
    look: [0, 1.6, 0],
    dronePos: [0, 1.6, 0],
    explode: 0,
    altitude: 0,
    speed: 0,
    battery: 100,
    satellites: 14,
    mode: 'STANDBY',
    waypoint: 'WPT 0/6 · HOME',
    reducedMotion,
  };

  let prevDronePos = state.dronePos;

  function rawT() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  }

  function update(dt) {
    const damp = reducedMotion ? 1 : 1 - Math.exp(-4.2 * dt);
    state.T += (rawT() - state.T) * damp;

    const sample = sampleKeyframes(state.T);
    state.cam = sample.cam;
    state.look = sample.look;
    prevDronePos = state.dronePos;
    state.dronePos = sample.drone;
    state.focus = sample.focus;
    state.explode = sampleExplode(state.T);

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
