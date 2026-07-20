import {
  WebGLRenderer,
  Scene,
  Color,
  Fog,
  PerspectiveCamera,
  HemisphereLight,
  DirectionalLight,
  ACESFilmicToneMapping,
} from 'three';

// The director's keyframes (§5) were tuned by eye against a landscape
// aspect. A plain fixed vertical FOV shrinks horizontal FOV on narrow
// portrait viewports (horizontalFOV depends on aspect), which pushes the
// same world-space L/R offset toward — or past — the screen edge. Widen
// the vertical FOV on portrait to keep horizontal framing closer to the
// landscape reference, clamped so it doesn't fisheye.
const BASE_FOV = 58;
const REFERENCE_ASPECT = 1440 / 900;
const MAX_FOV = 85;

function fovForAspect(aspect) {
  if (aspect >= 1) return BASE_FOV;
  const baseHorizontalTan = Math.tan((BASE_FOV * Math.PI) / 360) * REFERENCE_ASPECT;
  const targetVerticalRad = 2 * Math.atan(baseHorizontalTan / aspect);
  return Math.min((targetVerticalRad * 180) / Math.PI, MAX_FOV);
}

export function createWorld(canvas) {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    // Needed for the gate's luminance readback (main.js's __debugLuminance,
    // gl.readPixels against the default framebuffer) — without this the
    // browser is free to clear the drawing buffer right after compositing,
    // which reads back as all-zero (a false "void frame") even when the
    // actually-displayed frame wasn't.
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  // UnrealBloomPass (post.js) requires tone mapping enabled to look right —
  // untonemapped bloom clips to flat white instead of a soft glow.
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  scene.background = new Color(0x05080a);
  scene.fog = new Fog(0x05080a, 14, 85);

  const aspect = window.innerWidth / window.innerHeight;
  const camera = new PerspectiveCamera(fovForAspect(aspect), aspect, 0.1, 200);
  camera.position.set(0, 1.8, 7);
  camera.lookAt(0, 0.8, 0);

  const hemi = new HemisphereLight(0x1b4a52, 0x05080a, 0.7);
  scene.add(hemi);
  const key = new DirectionalLight(0x9adfe8, 0.8);
  key.position.set(6, 12, 6);
  scene.add(key);
  // Amendment D: a dim cyan rim light from behind-camera-left so the
  // drone's silhouette edges catch light against the void instead of
  // reading as a flat smudge — the hemi+key alone left the drone underlit
  // from the camera's vantage.
  const rim = new DirectionalLight(0x4fccd8, 0.45);
  rim.position.set(-8, 4, 10);
  scene.add(rim);

  window.addEventListener('resize', () => {
    const nextAspect = window.innerWidth / window.innerHeight;
    camera.aspect = nextAspect;
    camera.fov = fovForAspect(nextAspect);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera };
}
