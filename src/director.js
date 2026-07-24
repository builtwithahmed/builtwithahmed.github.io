// The single source of scroll truth (MISSION_PLAN.md §5). Everything else —
// camera, drone target, HUD, and (in P2+) content placement via
// document.body.dataset.side — reads from the state this module produces.
//
// Keyframe cam/look/drone coordinates are ported verbatim from the v1
// prototype's KF array (reference/v1-prototype.html:571-582) — already
// tuned for this world scale, per instruction. `focus` is new: each
// keyframe is tagged with the §5 act it falls in, so the side flips at
// keyframe boundaries rather than interpolating (L/R/C is categorical).
import { CatmullRomCurve3, Vector3 } from 'three';

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
  // v1.1-B gate: relabeled C->L (numerics untouched, same precedent as the
  // P2.6 fix documented below) — content.js's TEARDOWN_START (0.13) is
  // *before* this segment's own midpoint (0.15, see below), so for T
  // 0.13-0.15 the teardown block was laid out under the C rule's 32vh
  // budget instead of the L/R dock's much larger one, overflowing it by
  // ~50px (caught by the new permanent scripts/gate.mjs, which checks
  // desktop too — the same category of bug the P2.6 fix below was
  // guarding against, just for content HEIGHT budget rather than drone
  // overlap). Labeling this keyframe 'L' from the start removes the flip
  // from this segment entirely rather than just moving it earlier, and is
  // strictly safer for the overlap concern the P2.6 fix cared about too —
  // no content shows before T=0.13 regardless, and explode k is still ~0.1
  // at T=0.14 (barely separated).
  { t: 0.10, cam: [4.5, 2.4, 4.5], look: [0, 1.9, -3], drone: [0.3, 2.2, -3], focus: 'L' }, // TAKEOFF
  // Holds a neutral (unshifted) look-at right up to the L transition — same
  // fix as the t=0.70 keyframe below, mirrored: without it, interpolation
  // toward idx @0.22's L offset drifts the drone off-center while still
  // labeled C (caught on the narrow mobile viewport at t=0.20). Drone
  // position matches the point already on the idx@0.10->idx@0.22 curve.
  // Focus label relaxed C->L for P2.6 (only the label — cam/look/drone
  // numerics are untouched, so this doesn't touch the camera-smoothness
  // fix above): teardown content now starts at T=0.13 (was 0.16), but
  // this keyframe's C label held the CSS layout centered/full-width
  // until T~0.21 (the C->L flip is at this segment's own midpoint), so
  // for T 0.16-0.20 exploding components (battery in particular, which
  // moves straight down) had a real — if small, <600px² — window to dip
  // into centered content that a docked-right layout wouldn't have been
  // near. Relabeling moves the CSS flip to T=0.15, well before the
  // exploding parts have spread far. The camera itself doesn't visually
  // commit to an L offset until later regardless, which only makes this
  // safer, not riskier — content is farther from a still-centered drone.
  { t: 0.20, cam: [5.7, 2.96, -3.37], look: [0, 2.36, -11.33], drone: [-1.37, 2.39, -9.48], focus: 'L' },
  // v1.3 Step 2.2: mobileLook y (in addition to the pre-existing x) lifts
  // the exploded drone into its 55vh mobile allocation — see NOTES.md's
  // Step 1 diagnosis. Desktop's own look.y is untouched; only the mobile
  // override is added. Values bisected empirically against __debugNDC at
  // 390x844, same method as every other mobileLook entry.
  { t: 0.22, cam: [5.8, 3.0, -4], look: [2.2, 2.4, -12], drone: [-1.5, 2.4, -10], focus: 'L', mobileLook: { x: -0.6, y: 1.05 } }, // TEARDOWN (left)
  // Holds a strong L offset right up to the R transition — the origin-only
  // NDC check missed this, but the silhouette (full bounding-box) check
  // caught it: by t=0.30 the look-at had already interpolated to within
  // ~0.08 of neutral on its way toward idx @0.36's R offset, so the box's
  // right edge crossed into positive NDC while still labeled L. Drone
  // position matches the point already on the idx@0.22->idx@0.36 curve.
  { t: 0.30, cam: [-1.23, 3.36, -7.64], look: [3.5, 2.64, -14.43], drone: [0.14, 2.7, -13.03], focus: 'L', mobileLook: { x: 1.9, y: 1.1 } },
  { t: 0.36, cam: [-5.8, 3.6, -10], look: [-1.5, 2.8, -16], drone: [1.2, 2.9, -15], focus: 'R', mobileLook: { x: -0.285, y: 1.35 } }, // TEARDOWN (flipped)
  // Amendment B gate (fully-on-screen): the raw interpolation between the
  // close-up teardown camera and the wide top-down mission-map camera
  // swings through a mid-transition pose that overshoots the R bound —
  // both endpoints are fine on their own, the swing between them isn't.
  // Drone position matches the point already on the idx@0.36->idx@0.46
  // curve; only cam/look retuned to close the gap during the swing.
  { t: 0.4, cam: [-3.76, 5.68, -11.41], look: [-1.0, 2.45, -19.17], drone: [0.78, 2.79, -16.76], focus: 'R', mobileLook: { x: 0.15 } },
  { t: 0.46, cam: [0, 9.5, -14], look: [-6, 1.8, -25], drone: [0, 2.6, -20], focus: 'R', mobileLook: { x: -3.0 } }, // MISSION MAP
  { t: 0.60, cam: [0.5, 11.5, -21], look: [-11, 1.8, -30], drone: [-3.0, 3.8, -27], focus: 'R', mobileLook: { x: -9.0 } }, // MISSION MAP
  // Holds the R offset right up to the C transition — without this, the
  // interpolation toward idx @0.72's neutral look-at drifts the drone back
  // toward center before the focus label itself flips (caught by the P1
  // NDC gate at t=0.70). Drone position here matches the point already on
  // the idx@0.60->idx@0.72 curve at t=0.70 — only cam/look were retuned.
  { t: 0.70, cam: [6.06, 5.48, -29.33], look: [-9, 2.45, -37.4], drone: [-0.22, 2.87, -35.33], focus: 'R', mobileLook: { x: -6.3 } },
  // P2.7 Stage 2: relabeled 'C' -> 'L' (numerics untouched — same precedent
  // as the t=0.20 relabel above). This keyframe and t=0.84 were both
  // already 'L'-adjacent, but the short 'C' label here forced content to
  // the bottom-third layout for one segment right in the middle of the
  // inspection act's dock window, which the services terminal (content.js)
  // needs to occupy continuously from ~0.71 to ~0.87. Since both flanking
  // beats are "empty transition"/orbit shots with no drone-side framing
  // requirement of their own, committing this one to 'L' merges the two
  // segments into one stable dock window instead of flickering through
  // bottom-third and back.
  { t: 0.72, cam: [6.5, 5.0, -30], look: [0, 2.5, -38], drone: [0, 2.8, -36], focus: 'L', mobileLook: { x: 0 } }, // descend to structure
  { t: 0.84, cam: [4.8, 5.2, -40], look: [2.0, 4.5, -44], drone: [-1.2, 4.6, -42.5], focus: 'L', mobileLook: { x: -1.15 } }, // INSPECTION
  // Amendment B gate: raw interpolation between the INSPECTION orbit and
  // the RTL descent swings well left of center despite both endpoints'
  // look-at being fairly neutral — same "swing between distinct camera
  // setups overshoots mid-transition" issue as t=0.40 above. Drone
  // position matches the existing idx@0.84->idx@0.93 curve.
  // P2.7 back-half fix: relabeled 'C' -> 'R' across all three landing
  // keyframes (numerics retuned to match, see below) so the landing
  // content can dock LEFT *legitimately* per this codebase's own L/R
  // convention (content.css: data-side='R' -> 3D on the right, content
  // docks column 1/left — same convention the mission-map and inspection
  // acts already use), instead of console.css silently forcing a
  // left-dock under a 'C' label. That silent override capped at the
  // generic C-rule's 32vh, which is why the contact platform grid was
  // clipping two of its four links — a real 'R' label gets the same
  // vertical room the skills/mission/inspection blocks already get.
  // Pad-B moved off-axis to (3.0, 0, -55) (main.js) so the drone has
  // somewhere to actually be at NDC x > 0 when it lands, rather than
  // faking the offset with camera angle alone while the pad stays at
  // world x=0 — the same pattern the inspection tower already uses
  // (off-axis at x=-4.2, not centered).
  // v1.3 Step 2.2: mobileLook.x retuned across all three landing keyframes
  // (was -2.0/-1.5/-1.5, i.e. flat/matching desktop's own look.x at two of
  // the three points) — NOTES.md's Step 1 diagnosis found the mobile gap
  // (drone.x - mobileLook.x) held steady-to-desktop or even widened across
  // the approach while drone.x climbed toward off-axis Pad-B (3.0), which
  // is backwards: mobile's narrower effective horizontal FOV needs a
  // SMALLER gap than desktop throughout, not an equal one. Bisected against
  // __debugNDC (390x844) until the drone's own bbox sits on-screen at
  // t=0.93/0.95/0.97/1.00, not just its origin point.
  // y added after the first x-only pass measurably overlapped the mobile
  // landing-block's content rect (Table E/G-style point check, per NOTES.md
  // precedent): pulling the drone on-screen horizontally, at the same
  // vertical framing, dropped it low enough to sit over the content column
  // — mobile stack layout has no L/R split to dodge into, content claims
  // the full width, so the only dodge is vertical. Same "look below the
  // subject to push it up in frame" technique as t=0.00's hero keyframe.
  { t: 0.9, cam: [2.6, 4.6, -44], look: [-2.0, 2.3, -50], drone: [1.2, 3.0, -47], focus: 'R', mobileLook: { x: -0.8, y: 0.3 } },
  { t: 0.93, cam: [2.2, 4.3, -47], look: [-2.2, 1.7, -53], drone: [2.4, 2.6, -52], focus: 'R', mobileLook: { x: 0.2, y: -0.3 } }, // RTL
  // P2.7 Stage 2: drone.y tightened 0.3 -> 0.22 — the skids/legs (drone.js,
  // local y -0.2/-0.21) were still hovering ~0.16 above Pad-B's surface
  // (y=0.02) at the old value, not "settled." 0.22 puts the leg bottoms
  // right at the pad, a real touchdown rather than a close hover.
  { t: 1.00, cam: [1.0, 5.0, -49], look: [-1.5, 0.6, -55], drone: [3.0, 0.22, -55], focus: 'R', mobileLook: { x: 0.8, y: -1.4 } }, // LANDING, on Pad-B

];

const MODES = [
  [0.05, 'STANDBY', 'WPT 0/6 · HOME'],
  [0.13, 'TAKEOFF', 'WPT 0/6 · CLIMB'], // P2.6: takeoff beat shortened 0.16->0.13
  [0.38, 'SYSTEMS CHECK', 'SECTOR · SKILLS'],
  [0.70, 'AUTO · MISSION', 'WPT 0/6 · PROJECTS'],
  [0.90, 'INSPECT', 'STRUCTURE · SERVICES'],
  [1.01, 'LAND', 'WPT 6/6 · PAD-B'],
];

// v1.2 #A: per-segment smoothstep-lerp made velocity hit exactly zero at
// every keyframe (smoothstep's derivative is 0 at both ends of its [0,1]
// domain, and that domain WAS one segment) — the literal cause of HUD SPD
// reading 0.0 in every capture. Replaced with one continuous
// CatmullRomCurve3 per channel (cam/look/drone), built from every
// keyframe's position in order. 'centripetal' (three.js's own default,
// passed explicitly here) avoids the loop/cusp overshoot a uniform
// Catmull-Rom can produce when consecutive segments have very different
// lengths — several of this rig's segments do (t=0.20->0.22 is 0.02 wide,
// t=0.46->0.60 is 0.14 wide).
//
// The curve's own `getPoint(u)` parameterizes `u` UNIFORMLY by control-
// point index (three.js: `p = (points.length-1)*u`), not by each
// keyframe's real `t` — sampling it with raw T directly would silently
// discard this rig's entire hand-tuned pacing (teardown lingering,
// mission-map cruising, etc. all encoded in KEYFRAMES' uneven t-gaps) in
// favour of uniform per-keyframe timing. sampleKeyframes below still does
// its own t-bracket search and remaps into the curve's index-uniform u
// space (`uCurve`) from the REAL uRaw fraction, so real timing is
// preserved and the curve only supplies SHAPE — a spline that happens to
// pass through the exact same points at the exact same T values the old
// lerp did, just continuously instead of stopping at each one.
const camCurve = new CatmullRomCurve3(KEYFRAMES.map((k) => new Vector3(...k.cam)), false, 'centripetal');
const lookCurve = new CatmullRomCurve3(KEYFRAMES.map((k) => new Vector3(...k.look)), false, 'centripetal');
const droneCurve = new CatmullRomCurve3(KEYFRAMES.map((k) => new Vector3(...k.drone)), false, 'centripetal');
const camPoint = new Vector3();
const lookPoint = new Vector3();
const dronePoint = new Vector3();

function smoothstep(u) {
  return u * u * (3 - 2 * u);
}

// v1.3 Step 2.2: shared by both axes of the mobileLook vector. null when
// NEITHER keyframe specifies this axis (caller falls back to the existing
// gap-scale formula, x-only, or to the plain desktop value, y); when only
// one side specifies it, the other falls back to ITS OWN desktop value for
// that axis so the blend still lands exactly on the authored override at
// uRaw=0/1 rather than interpolating from some unrelated neighbor value.
function blendMobileAxis(aOverride, bOverride, aDefault, bDefault, u) {
  if (aOverride === undefined && bOverride === undefined) return null;
  const from = aOverride ?? aDefault;
  const to = bOverride ?? bDefault;
  return from + (to - from) * u;
}

function sampleKeyframes(t) {
  let i = 0;
  while (i < KEYFRAMES.length - 2 && KEYFRAMES[i + 1].t < t) i++;
  const a = KEYFRAMES[i];
  const b = KEYFRAMES[i + 1];
  const uRaw = (t - a.t) / (b.t - a.t);
  // Position sampling below uses uRaw directly (not smoothstepped) — see
  // the comment above the curves. u (smoothstepped) is kept only for the
  // scalar mobileGap/mobileLook blends, which weren't part of the
  // stop-start bug and aren't part of this change (still per-segment
  // linear-ish blends between two scalars, not points on a spline).
  const u = smoothstep(uRaw);
  const gapA = a.mobileGap ?? LATERAL_SCALE_MOBILE;
  const gapB = b.mobileGap ?? LATERAL_SCALE_MOBILE;
  // Some segments don't respond usably to proportional gap scaling at all
  // (see director.js history) — mobileLook is an absolute look override for
  // stack layout, used instead of the scaled-gap formula when present.
  //
  // v1.3 Step 2.2: generalized from an x-only scalar to a per-axis {x, y}
  // vector (one mechanism, not a second x-only field plus a new y-only
  // field) — landing needed x (tracking the drone toward off-axis Pad-B)
  // and teardown needed y (lifting the exploded drone into its mobile
  // budget) on different keyframes, so both axes independently fall back
  // to the desktop-sampled value when a keyframe doesn't specify that axis.
  // blendAxis reduces to exactly the old formula when only .x is ever set,
  // so every pre-existing x-only keyframe is unaffected.
  const mobileLookX = blendMobileAxis(a.mobileLook?.x, b.mobileLook?.x, a.look[0], b.look[0], u);
  const mobileLookY = blendMobileAxis(a.mobileLook?.y, b.mobileLook?.y, a.look[1], b.look[1], u);
  // Remap [segment index i, local fraction uRaw] into the curve's own
  // uniform-per-point parameter space — matches CatmullRomCurve3.getPoint's
  // internal `p = (points.length-1)*u` exactly, so uCurve = i+uRaw here
  // lands on precisely the same p. At uRaw = 0 or 1 this returns exactly
  // control point i or i+1 (the keyframe's own literal values), same as
  // the old lerp did at its segment boundaries.
  const uCurve = (i + uRaw) / (KEYFRAMES.length - 1);
  return {
    cam: camCurve.getPoint(uCurve, camPoint).toArray(),
    look: lookCurve.getPoint(uCurve, lookPoint).toArray(),
    drone: droneCurve.getPoint(uCurve, dronePoint).toArray(),
    mobileGap: gapA + (gapB - gapA) * u,
    mobileLookX,
    mobileLookY,
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

// §5 TEARDOWN: explode 0->1 across T 0.13-0.34 (P2.6: was 0.16, takeoff
// beat shortened so teardown gets more runway, not so the whole timeline
// shifts), hold, reassemble 1->0 across 0.34-0.40.
function sampleExplode(t) {
  if (t <= 0.13) return 0;
  if (t <= 0.34) return smoothstep((t - 0.13) / (0.34 - 0.13));
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
      state.layout === 'stack' && sample.mobileLookX !== null
        ? sample.mobileLookX
        : sample.drone[0] + (sample.look[0] - sample.drone[0]) * gapScale;
    // v1.3 Step 2.2: same override pattern as X, for the teardown Y-lift —
    // no gap-scale equivalent for Y (there never was one), so absent an
    // override this is byte-identical to pre-2.2 behavior (plain desktop
    // look.y, every keyframe, both layouts).
    const lookY =
      state.layout === 'stack' && sample.mobileLookY !== null ? sample.mobileLookY : sample.look[1];
    state.look = [lookX, lookY, sample.look[2]];
    prevDronePos = state.dronePos;
    state.dronePos = sample.drone;
    state.focus = sample.focus;
    // §6(6): reduced motion skips the explode animation — component parts
    // are simply exploded (k=1) for the whole teardown range, not ramped.
    state.explode = reducedMotion ? (state.T >= 0.13 && state.T <= 0.4 ? 1 : 0) : sampleExplode(state.T);

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
