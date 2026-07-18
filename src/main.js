import { Timer, Vector3 } from 'three';
import './styles/tokens.css';
import './styles/layout.css';
import { createWorld } from './scene/world.js';
import { createTerrain } from './scene/terrain.js';
import { createDrone } from './scene/drone.js';
import { createDirector } from './director.js';
import { createTelemetry } from './hud/telemetry.js';

const canvas = document.getElementById('scene');
const { renderer, scene, camera } = createWorld(canvas);

scene.add(createTerrain());

const drone = createDrone();
scene.add(drone.group);

const director = createDirector();
const telemetry = createTelemetry();

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

  drone.explode(state.explode);
  drone.update(dt, state.dronePos, { time, reducedMotion: state.reducedMotion, flying });

  const damp = state.reducedMotion ? 1 : 1 - Math.exp(-4.2 * dt);
  camTarget.set(...state.cam);
  lookTarget.set(...state.look);
  camPos.lerp(camTarget, state.reducedMotion ? 1 : damp);
  camLook.lerp(lookTarget, state.reducedMotion ? 1 : damp);
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  telemetry.update(state, time);

  renderer.render(scene, camera);
}
tick();

// Dev instrumentation for the §4 Rule-of-the-Empty-Half gate check
// (scripts/shots.mjs / manual NDC measurement) — reads the drone's
// projected screen position without eyeballing pixels off a screenshot.
window.__debugNDC = () => {
  const pos = drone.group.position.clone();
  pos.project(camera);
  return { ndcX: pos.x, ndcY: pos.y, focus: director.state.focus, T: director.state.T };
};
