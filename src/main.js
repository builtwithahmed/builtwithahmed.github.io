import './styles/tokens.css';
import { createWorld } from './scene/world.js';
import { createTerrain } from './scene/terrain.js';

const canvas = document.getElementById('scene');
const { renderer, scene, camera } = createWorld(canvas);

scene.add(createTerrain());

function tick() {
  requestAnimationFrame(tick);
  renderer.render(scene, camera);
}
tick();
