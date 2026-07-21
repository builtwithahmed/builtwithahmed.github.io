import { Timer, Vector3, Box3 } from 'three';
import './styles/tokens.css';
import './styles/layout.css';
import { createWorld } from './scene/world.js';
import { createTerrain } from './scene/terrain.js';
import { createHelipad, createHorizon, createDustRing, createSky } from './scene/environment.js';
import { createDrone } from './scene/drone.js';
import { detectTier } from './scene/tier.js';
import { createPostPipeline } from './scene/post.js';
import { createDirector } from './director.js';
import { createTelemetry } from './hud/telemetry.js';
import { createContent } from './hud/content.js';
import { createCallouts } from './hud/callouts.js';
import { createPhaseReadout } from './hud/phase.js';
import { skills } from './content/data.js';

const canvas = document.getElementById('scene');
const { renderer, scene, camera } = createWorld(canvas);

const sky = createSky();
scene.add(sky);
const terrain = createTerrain();
scene.add(terrain);
const helipad = createHelipad(0, 0);
scene.add(helipad);
const horizon = createHorizon();
scene.add(horizon);
const dustRing = createDustRing(0, 0);
scene.add(dustRing.mesh);

const director = createDirector();

const drone = createDrone();
// Seed the drone at its real T=0 position rather than three's default
// (0,0,0) — otherwise it lerps up into place over the first several real
// frames after load, and while mid-transit picks up a spurious velocity/
// rotation that inflates its projected bbox (same root cause as the
// camPos staleness fix below: partial convergence read as real framing).
drone.group.position.set(...director.state.dronePos);
scene.add(drone.group);

// Gate tooling needs to exercise the full pipeline against a headless
// browser's software (SwiftShader) WebGL context, which legitimately
// blacklists as TIER_LOW under real-device detection rules — so `?debug`
// gate runs may force a tier via `&tier=HIGH` to test as a real device would.
const forcedTier = new URLSearchParams(location.search).get('tier');
const tier = forcedTier || detectTier(renderer);
const post = createPostPipeline(renderer, scene, camera, tier);
window.addEventListener('resize', () => post.resize());

const telemetry = createTelemetry();
const content = createContent();
const callouts = createCallouts({ camera, drone, mountEl: content.calloutStack });
const phase = createPhaseReadout();

const timer = new Timer();
const camPos = new Vector3(...director.state.cam);
const camLook = new Vector3(...director.state.look);
const camTarget = new Vector3();
const lookTarget = new Vector3();

function tick() {
  requestAnimationFrame(tick);
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  const time = timer.getElapsed();

  const state = director.update(dt);
  const flying = state.T < 0.985;

  drone.explode(state.explode, state.explodeScale);
  drone.update(dt, state.dronePos, { time, reducedMotion: state.reducedMotion, flying });
  dustRing.update(state.T, state.reducedMotion);

  const damp = state.reducedMotion ? 1 : 1 - Math.exp(-4.2 * dt);
  camTarget.set(...state.cam);
  lookTarget.set(...state.look);
  camPos.lerp(camTarget, state.reducedMotion ? 1 : damp);
  camLook.lerp(lookTarget, state.reducedMotion ? 1 : damp);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  sky.position.copy(camera.position);

  // Matrices must be fresh THIS frame before projecting for callouts/debug
  // (three.js otherwise defers world-matrix updates to renderer.render()).
  camera.updateMatrixWorld();
  drone.group.updateWorldMatrix(true, true);

  telemetry.update(state, time);
  content.update(state);
  callouts.update(state);
  phase.update(state);

  post.render();
}
tick();

// Instrumentation for the §4 Rule-of-the-Empty-Half gate check — reads the
// drone's projected screen position/silhouette without eyeballing pixels
// off a screenshot. Debug globals should not ship: this only attaches when
// the page is loaded with ?debug, so `npm run verify`/plain preview loads
// get none of it, while `npm run shots`/gate scripts (which must run
// against the production `preview` build, not `dev`) can still opt in by
// requesting `?debug` — an `import.meta.env.DEV` guard would've made this
// unreachable against `preview` entirely.
if (new URLSearchParams(location.search).has('debug')) {
  // P2.6 diagnostics: toggle individual scene layers on/off from a gate
  // script to isolate a visual artifact (which object is actually
  // producing it) without a rebuild per guess.
  window.__debugLayers = { terrain, helipad, horizon, dustRing: dustRing.mesh, drone: drone.group, sky };
  window.__debugProjectWorld = (x, y, z) => {
    const p = new Vector3(x, y, z).project(camera);
    return { x: p.x, y: p.y, z: p.z };
  };
  window.__debugSetComposer = (enabled) => {
    post.setEnabled?.(enabled);
  };

  // Cheap enough to poll at high frequency — gate scripts use this to wait
  // for actual convergence after an instant scroll jump instead of a fixed
  // wall-clock delay. Fixed delays are unreliable here: headless Chromium
  // can throttle requestAnimationFrame on a backgrounded page, so wall-
  // clock time doesn't reliably map to accumulated animation dt (T was
  // observed reaching only 0.065 of a 0.10 target after a 2000ms wait).
  window.__debugT = () => director.state.T;

  window.__debugNDC = () => {
    const origin = drone.group.position.clone().project(camera);

    // Silhouette test: origin alone is insufficient (a rotor tip can sit
    // well off the group's local origin once exploded/oriented), so
    // project the drone's full world-space bounding box and take the
    // NDC extremes across all 8 corners.
    const box = new Box3().setFromObject(drone.group);
    const corner = new Vector3();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z
      );
      corner.project(camera);
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y);
      maxY = Math.max(maxY, corner.y);
    }

    // Per-component projected centers, for the teardown-range gate check
    // (each exploded part anchors a callout and must stay on screen).
    const componentNDC = {};
    const cv = new Vector3();
    for (const { componentKey } of skills) {
      drone.components[componentKey].object.getWorldPosition(cv);
      const p = cv.clone().project(camera);
      componentNDC[componentKey] = { x: p.x, y: p.y, z: p.z };
    }

    return {
      ndcX: origin.x,
      ndcY: origin.y,
      minX,
      maxX,
      minY,
      maxY,
      // P2.5 gate (e): drone bbox width as % of frame width, NDC spans
      // [-1,1] i.e. a width of 2, so (maxX-minX)/2 is the fraction.
      bboxWidthPct: ((maxX - minX) / 2) * 100,
      focus: director.state.focus,
      layout: director.state.layout,
      T: director.state.T,
      explode: director.state.explode,
      fov: camera.fov,
      tier,
      components: componentNDC,
      // P2.5 gate (f): distinct visual elements on screen besides the
      // drone/HUD — counted, not eyeballed, so the check is reproducible.
      dustRingVisible: dustRing.mesh.visible,
      horizonSilhouettesOnScreen: horizon.children.filter((child) => {
        const p = child.getWorldPosition(cv).clone().project(camera);
        return p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
      }).length,
    };
  };

  // P2.5 gate (g), the REAL Empty Half test per NOTES.md: whether the
  // drone's actual rendered silhouette (not the world-axis-aligned Box3,
  // which NOTES.md already found overstates on-screen extent as the drone
  // banks) falls under a given DOM rect. Reads the WebGL canvas directly
  // — the DOM content layer is a separate stacking context on top of it,
  // so this samples the 3D-only render underneath whatever's overlaid.
  window.__debugSilhouetteOverlap = (rects) => {
    const gl = renderer.getContext();
    const dpr = renderer.getPixelRatio();
    const cw = canvas.width;
    const ch = canvas.height;
    return rects.map((r) => {
      const x0 = Math.max(0, Math.floor(r.left * dpr));
      const x1 = Math.min(cw, Math.ceil(r.right * dpr));
      const y0 = Math.max(0, Math.floor(r.top * dpr));
      const y1 = Math.min(ch, Math.ceil(r.bottom * dpr));
      const w = x1 - x0;
      const h = y1 - y0;
      if (w <= 0 || h <= 0) return { maxLuminance: 0 };
      // readPixels is bottom-left origin; DOM rects are top-left origin.
      const glY = ch - y1;
      const pixels = new Uint8Array(w * h * 4);
      gl.readPixels(x0, glY, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      // Mean, not max — a single bloomed horizon beacon or grid hairline
      // passing through the corner of a rect shouldn't read as "the drone
      // is under the content." A real silhouette (or its bloom halo)
      // covers enough of the rect to move the mean, not just the peak.
      let sum = 0;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        sum += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
        count++;
      }
      return { meanLuminance: count ? sum / count : 0 };
    });
  };

  // P2.6 gate (c): same real-pixel methodology as __debugSilhouetteOverlap,
  // but returns a literal intersecting-pixel COUNT per rect (not just a
  // mean) so the gate can report "every intersection with its t value and
  // pixel count" as asked, at 0.02-increment resolution across the whole
  // scroll — not just the 11 sampled screenshot steps.
  window.__debugOverlap = (rects) => {
    const gl = renderer.getContext();
    const dpr = renderer.getPixelRatio();
    const cw = canvas.width;
    const ch = canvas.height;

    const framePixels = new Uint8Array(cw * ch * 4);
    gl.readPixels(0, 0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, framePixels);
    let fsum = 0;
    let fcount = 0;
    for (let i = 0; i < framePixels.length; i += 4 * 16) {
      fsum += 0.2126 * framePixels[i] + 0.7152 * framePixels[i + 1] + 0.0722 * framePixels[i + 2];
      fcount++;
    }
    const frameMean = fcount ? fsum / fcount : 0;
    const threshold = frameMean + 15;

    return rects.map((r) => {
      const x0 = Math.max(0, Math.floor(r.left * dpr));
      const x1 = Math.min(cw, Math.ceil(r.right * dpr));
      const y0 = Math.max(0, Math.floor(r.top * dpr));
      const y1 = Math.min(ch, Math.ceil(r.bottom * dpr));
      const w = x1 - x0;
      const h = y1 - y0;
      if (w <= 0 || h <= 0) return { pixelsChecked: 0, brightPixels: 0, frameMean };
      const glY = ch - y1;
      const pixels = new Uint8Array(w * h * 4);
      gl.readPixels(x0, glY, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let bright = 0;
      let checked = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const lum = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
        if (lum > threshold) bright++;
        checked++;
      }
      return { pixelsChecked: checked, brightPixels: bright, frameMean };
    });
  };

  // P2.5 gate (g): mean luminance of the actually-composited frame (post
  // pipeline included), read straight off the canvas rather than estimated
  // from scene contents — this is what a screenshot would measure.
  window.__debugLuminance = () => {
    const gl = renderer.getContext();
    const w = canvas.width;
    const h = canvas.height;
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let sum = 0;
    let count = 0;
    const stride = 4 * 4; // sample every 4th pixel for speed
    for (let i = 0; i < pixels.length; i += stride) {
      sum += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      count++;
    }
    return { meanLuminance: sum / count };
  };
}
