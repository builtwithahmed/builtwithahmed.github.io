import { Timer, Vector3, Box3 } from 'three';
import './styles/tokens.css';
import './styles/layout.css';
import { createWorld } from './scene/world.js';
import { createTerrain } from './scene/terrain.js';
import { createDrone } from './scene/drone.js';
import { createDirector } from './director.js';
import { createTelemetry } from './hud/telemetry.js';
import { createContent } from './hud/content.js';
import { createCallouts } from './hud/callouts.js';
import { skills } from './content/data.js';

const canvas = document.getElementById('scene');
const { renderer, scene, camera } = createWorld(canvas);

scene.add(createTerrain());

const drone = createDrone();
scene.add(drone.group);

const director = createDirector();
const telemetry = createTelemetry();
const content = createContent();
const callouts = createCallouts({ camera, drone, mountEl: content.calloutStack });

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

  const damp = state.reducedMotion ? 1 : 1 - Math.exp(-4.2 * dt);
  camTarget.set(...state.cam);
  lookTarget.set(...state.look);
  camPos.lerp(camTarget, state.reducedMotion ? 1 : damp);
  camLook.lerp(lookTarget, state.reducedMotion ? 1 : damp);
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  // Matrices must be fresh THIS frame before projecting for callouts/debug
  // (three.js otherwise defers world-matrix updates to renderer.render()).
  camera.updateMatrixWorld();
  drone.group.updateWorldMatrix(true, true);

  telemetry.update(state, time);
  content.update(state);
  callouts.update(state);

  renderer.render(scene, camera);
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
      focus: director.state.focus,
      layout: director.state.layout,
      T: director.state.T,
      explode: director.state.explode,
      fov: camera.fov,
      components: componentNDC,
    };
  };
}
