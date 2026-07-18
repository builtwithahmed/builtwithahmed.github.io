import {
  WebGLRenderer,
  Scene,
  Color,
  Fog,
  PerspectiveCamera,
  HemisphereLight,
  DirectionalLight,
} from 'three';

export function createWorld(canvas) {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new Scene();
  scene.background = new Color(0x05080a);
  scene.fog = new Fog(0x05080a, 14, 85);

  const camera = new PerspectiveCamera(
    58,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(0, 1.8, 7);
  camera.lookAt(0, 0.8, 0);

  const hemi = new HemisphereLight(0x1b4a52, 0x05080a, 0.7);
  scene.add(hemi);
  const key = new DirectionalLight(0x9adfe8, 0.8);
  key.position.set(6, 12, 6);
  scene.add(key);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera };
}
