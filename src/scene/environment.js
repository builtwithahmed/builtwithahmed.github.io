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
  DoubleSide,
} from 'three';

export function createHelipad(x = 0, z = 0) {
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
  const markMat = new MeshStandardMaterial({
    color: 0x1c4650,
    roughness: 0.35,
    metalness: 0.5,
  });

  const ring = new Mesh(new RingGeometry(1.48, 1.64, 40), markMat);
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

// 10-14 dark industrial silhouettes at |x| 14-34 with amber/red rooftop
// beacons (§6.1), spread along the flight corridor so the takeoff/teardown
// beats have a horizon instead of reading as a void.
export function createHorizon() {
  const group = new Group();
  const bodyMat = new MeshStandardMaterial({ color: 0x0d1416, roughness: 0.9 });
  const amberMat = new MeshStandardMaterial({ color: 0xffb03a, emissive: 0xffb03a, emissiveIntensity: 1.8 });
  const redMat = new MeshStandardMaterial({ color: 0xff5449, emissive: 0xff5449, emissiveIntensity: 1.8 });

  const count = 14;
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (14 + Math.random() * 20);
    const z = 5 - Math.random() * 65;
    const h = 3 + Math.random() * 9;
    const w = 1.5 + Math.random() * 2.5;
    const d = 1.5 + Math.random() * 2.5;

    const sil = new Mesh(new BoxGeometry(w, h, d), bodyMat);
    sil.position.set(x, h / 2, z);
    group.add(sil);

    if (Math.random() > 0.4) {
      const beacon = new Mesh(new SphereGeometry(0.09, 6, 6), Math.random() > 0.5 ? amberMat : redMat);
      beacon.position.set(x, h + 0.2, z);
      group.add(beacon);
    }
  }
  return group;
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
