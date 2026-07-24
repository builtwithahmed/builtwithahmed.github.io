// Amendment D/E (P2.5): scene dressing the hero/takeoff beats need to read
// as a real place — a helipad at the origin (ported from the v1 prototype's
// makePad(), reference/v1-prototype.html:467-478) and distant industrial
// silhouettes for a horizon (reference/v1-prototype.html:541-555), pulled
// forward from P3/§6.1 because without them the takeoff beat has no sense
// of scale or altitude. Plus the takeoff dust ring, which is new (§ Amendment E).
import {
  Group,
  Mesh,
  CircleGeometry,
  RingGeometry,
  BoxGeometry,
  SphereGeometry,
  TorusGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  ShaderMaterial,
  UniformsUtils,
  UniformsLib,
  Color,
  BackSide,
  DoubleSide,
} from 'three';

// v1.1-B #2: live feedback — Pad-B (the landing pad) reads as a faint
// ellipse at T~0.97. `brightPad` defaults on, but main.js's hero pad (at
// the world origin, right behind the hero headline at t=0) passes `false`.
// Tried two narrower fixes first, both re-tested against the exact P2.7
// Stage 1 regression check (behind-headline vs. side-region luminance,
// composer on) and a direct screenshot, since the luminance ratio alone
// turned out not to be conclusive on its own (see below): (1) emissive on
// the ring only — reintroduced the ~2x-magnitude stain ratio outright; (2)
// emissive off, base color brightened only — luminance ratio and a
// composer-on/off comparison both looked clean (bloom contributed exactly
// 0 to the ratio), but the actual screenshot still showed a visible soft
// teal oval behind the headline. The ring is a literal ring shape; a
// brighter non-emissive ring reads as a glow at this distance/angle
// regardless of bloom being involved at all. Root cause is the ring
// geometry itself this close to the hero camera, not emissive/bloom — so
// the hero pad keeps its exact original (pre-v1.1-B) material for both
// marks and ring, and only Pad-B gets brighter.
export function createHelipad(x = 0, z = 0, { brightPad = true } = {}) {
  const group = new Group();

  const base = new Mesh(
    new CircleGeometry(1.7, 40),
    new MeshStandardMaterial({ color: 0x101819, roughness: 0.9 })
  );
  base.rotation.x = -Math.PI / 2;
  group.add(base);

  // P2.5 made this emissive so it'd "read against the void" — P2.6 live
  // review: that emissive is exactly what bloom turns into the "large
  // soft teal oval" stain behind the hero headline. It's a painted
  // marking, not a light source; it should read via the key/rim lights
  // like the rest of the pad, not glow on its own. No `emissive` at all,
  // so it can never catch bloom regardless of tuning elsewhere.
  const markMat = new MeshStandardMaterial(
    brightPad ? { color: 0x2e6672, roughness: 0.35, metalness: 0.5 } : { color: 0x1c4650, roughness: 0.35, metalness: 0.5 }
  );
  const ringMat = new MeshStandardMaterial(
    brightPad
      ? { color: 0x2e6672, roughness: 0.35, metalness: 0.5, emissive: 0x1c4650, emissiveIntensity: 0.18 }
      : { color: 0x1c4650, roughness: 0.35, metalness: 0.5 }
  );

  const ring = new Mesh(new RingGeometry(1.48, 1.64, 40), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  group.add(ring);

  const h1 = new Mesh(new BoxGeometry(0.12, 0.012, 0.96), markMat);
  h1.position.set(-0.31, 0.014, 0);
  group.add(h1);
  const h2 = h1.clone();
  h2.position.x = 0.31;
  group.add(h2);
  const h3 = new Mesh(new BoxGeometry(0.53, 0.012, 0.12), markMat);
  h3.position.y = 0.014;
  group.add(h3);

  group.position.set(x, 0.02, z);
  return group;
}

// P2.7: horizon silhouettes were pure MeshStandardMaterial with no light
// hitting them from a useful angle at most keyframes — "pure black on
// near-black," per the live review, even though they carry the scene's
// entire sense of scale. A real fresnel rim (brighter at grazing angles,
// independent of whether a directional light happens to graze that face)
// gives every building a readable edge against the void regardless of
// camera angle, without needing per-keyframe light tuning.
const fresnelVertex = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  void main() {
    vNormalV = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const fresnelFragment = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  uniform vec3 uBaseColor;
  uniform vec3 uRimColor;
  uniform float uRimPower;
  void main() {
    float fresnel = pow(1.0 - max(dot(normalize(vNormalV), normalize(vViewDir)), 0.0), uRimPower);
    vec3 color = uBaseColor + uRimColor * fresnel;
    gl_FragColor = vec4(color, 1.0);
    #include <fog_fragment>
  }
`;

function createFresnelMaterial() {
  return new ShaderMaterial({
    vertexShader: fresnelVertex,
    fragmentShader: fresnelFragment,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uBaseColor: { value: new Color(0x050a0c) },
        // desaturated cyan-grey, low intensity per instruction — this is
        // an edge cue, not another emissive glow source for bloom to grab.
        // v1.1-B #3: rim intensity +30% (0x3d5a5f * 1.3) as part of the
        // global "raise the world one stop" pass.
        uRimColor: { value: new Color(0x4f757c) },
        uRimPower: { value: 2.2 },
      },
    ]),
    fog: true,
  });
}

// v1.2.1 Step 3a: Math.random() can't be seeded, which is why this skyline
// (unlike every other object in the scene, all built from fixed constants)
// regenerated a completely different layout on every page load -- see
// NOTES.md's reproducibility diagnosis. mulberry32 is a small deterministic
// PRNG; seeding it with a constant reproduces the same scattered layout
// every load while keeping the hand-off "random placement" look.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// v1.2.1 Step 3b: Ahmed's pick from the seed1/seed2/seed3 candidate renders.
// Provisional pending the Step 6 full capture set -- re-pick if any frame
// composes badly with this skyline, not treated as immutable.
const HORIZON_SEED = 2;

// 10-14 dark industrial silhouettes at |x| 14-34 with amber/red rooftop
// beacons (§6.1), spread along the flight corridor so the takeoff/teardown
// beats have a horizon instead of reading as a void.
export function createHorizon() {
  const group = new Group();
  const rand = mulberry32(HORIZON_SEED);
  const bodyMat = createFresnelMaterial();
  const amberMat = new MeshStandardMaterial({ color: 0xffb03a, emissive: 0xffb03a, emissiveIntensity: 1.8 });
  const redMat = new MeshStandardMaterial({ color: 0xff5449, emissive: 0xff5449, emissiveIntensity: 1.8 });

  const count = 14;
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (14 + rand() * 20);
    const z = 5 - rand() * 65;
    const h = 3 + rand() * 9;
    const w = 1.5 + rand() * 2.5;
    const d = 1.5 + rand() * 2.5;

    const sil = new Mesh(new BoxGeometry(w, h, d), bodyMat);
    sil.position.set(x, h / 2, z);
    group.add(sil);

    if (rand() > 0.4) {
      const beacon = new Mesh(new SphereGeometry(0.09, 6, 6), rand() > 0.5 ? amberMat : redMat);
      beacon.position.set(x, h + 0.2, z);
      group.add(beacon);
    }
  }
  return group;
}

// P2.7: "the whole scene is ~15% brightness... the void should read as
// air, not absence." A large inverted sphere with a vertical gradient
// (dark teal-black at the horizon, fading to near-black at the zenith),
// repositioned onto the camera every frame (main.js) so it always reads
// as an infinite backdrop rather than a bounded object. depthTest false
// + renderOrder -1 guarantees it paints behind literal everything else
// without needing to be perfectly outside the far clip / fog range.
const skyVertex = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const skyFragment = /* glsl */ `
  varying vec3 vPos;
  uniform vec3 uHorizonColor;
  uniform vec3 uZenithColor;
  void main() {
    float h = clamp(normalize(vPos).y * 0.5 + 0.5, 0.0, 1.0);
    vec3 color = mix(uHorizonColor, uZenithColor, h);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createSky() {
  const geometry = new SphereGeometry(140, 24, 16);
  const material = new ShaderMaterial({
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    uniforms: {
      uHorizonColor: { value: new Color(0x0a2229) },
      uZenithColor: { value: new Color(0x030509) },
    },
    side: BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = -1;
  return mesh;
}

// Amendment E: the takeoff beat (T 0.08-0.16) had zero visual content of
// its own. An expanding, fading downwash ring at the pad the moment the
// drone leaves it gives that beat an event instead of a gap.
const RING_START_T = 0.08;
const RING_END_T = 0.24;

export function createDustRing(x = 0, z = 0) {
  const material = new MeshBasicMaterial({
    color: 0x9adfe8,
    transparent: true,
    opacity: 0,
    side: DoubleSide,
  });
  const mesh = new Mesh(new TorusGeometry(0.7, 0.06, 8, 40), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, 0.05, z);
  mesh.visible = false;

  function update(T, reducedMotion) {
    if (reducedMotion || T < RING_START_T || T > RING_END_T) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const progress = (T - RING_START_T) / (RING_END_T - RING_START_T);
    // First pass (base radius 1, scale up to 8x, opacity 0.55, full-
    // brightness cyan) bloomed into a giant white disc over the hero copy
    // — see P2.5 gate screenshots. Smaller base, gentler max scale/opacity.
    const scale = 1 + progress * 3.5;
    mesh.scale.set(scale, scale, 1);
    material.opacity = (1 - progress) * 0.3;
  }

  return { mesh, update };
}
