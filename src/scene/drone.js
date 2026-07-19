// Geometry and primitive coordinates lifted from the v1 prototype
// (reference/v1-prototype.html:417-457) and rebuilt as an ES module with a
// component map + explode(k) API per MISSION_PLAN.md §6.2. Flight-orientation
// maths (yaw/bank/pitch/bob/rotor spin) is ported from v1's tick()
// (reference/v1-prototype.html:640-660), not the file structure.
import {
  Group,
  Mesh,
  Vector3,
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  CircleGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  DoubleSide,
} from 'three';

function createMaterials() {
  return {
    body: new MeshStandardMaterial({ color: 0x1c2426, roughness: 0.45, metalness: 0.7 }),
    dark: new MeshStandardMaterial({ color: 0x11181a, roughness: 0.6, metalness: 0.5 }),
    cyan: new MeshStandardMaterial({ color: 0x4fccd8, emissive: 0x4fccd8, emissiveIntensity: 0.9, roughness: 0.3 }),
    green: new MeshStandardMaterial({ color: 0x38d67a, emissive: 0x38d67a, emissiveIntensity: 1 }),
    red: new MeshStandardMaterial({ color: 0xff5449, emissive: 0xff5449, emissiveIntensity: 1 }),
    rotor: new MeshBasicMaterial({ color: 0x9adfe8, transparent: true, opacity: 0.28, side: DoubleSide }),
  };
}

export function createDrone() {
  const mats = createMaterials();
  const drone = new Group();
  const components = {};

  function registerComponent(name, object3D, assembledPos, explodeDir, explodeDist, explodeRot = [0, 0, 0]) {
    object3D.position.set(...assembledPos);
    drone.add(object3D);
    components[name] = {
      object: object3D,
      assembled: assembledPos,
      exploded: [
        assembledPos[0] + explodeDir[0] * explodeDist,
        assembledPos[1] + explodeDir[1] * explodeDist,
        assembledPos[2] + explodeDir[2] * explodeDist,
      ],
      rot: explodeRot,
    };
  }

  // body — the core, does not explode
  const body = new Mesh(new BoxGeometry(0.62, 0.2, 0.86), mats.body);
  drone.add(body);

  // flight controller (canopy box + stripe) -> "Drone Systems & ArduPilot"
  const flightController = new Group();
  const canopyBox = new Mesh(new BoxGeometry(0.4, 0.14, 0.44), mats.dark);
  const stripe = new Mesh(new BoxGeometry(0.64, 0.03, 0.2), mats.cyan);
  stripe.position.set(0, -0.02, -0.06);
  flightController.add(canopyBox, stripe);
  registerComponent('flightController', flightController, [0, 0.16, 0], [0, 1, 0], 0.9, [0, 0.6, 0]);

  // gimbal + camera lens -> "Data & Log Analysis"
  const gimbal = new Group();
  const nose = new Mesh(new BoxGeometry(0.16, 0.1, 0.14), mats.dark);
  const lens = new Mesh(new CylinderGeometry(0.045, 0.045, 0.05, 12), mats.cyan);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, -0.01, 0.08);
  gimbal.add(nose, lens);
  registerComponent('gimbal', gimbal, [0, -0.04, 0.5], [0, -0.4, 1], 1.1, [0.3, 0, 0]);

  // ESC / arms cluster -> "Python Automation"
  const escArms = new Group();
  // rotor set (hubs + blur discs, separate from the arms/motors) -> "Full-Stack Web Dev"
  const rotors = new Group();
  const rotorHubs = [];
  const armPositions = [
    [0.55, 0.55],
    [-0.55, 0.55],
    [0.55, -0.55],
    [-0.55, -0.55],
  ];
  armPositions.forEach(([px, pz], i) => {
    const arm = new Mesh(new CylinderGeometry(0.035, 0.035, 0.85, 8), mats.dark);
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = Math.atan2(pz, px);
    arm.position.set(px * 0.42, 0.02, pz * 0.42);
    escArms.add(arm);

    const motor = new Mesh(new CylinderGeometry(0.075, 0.09, 0.12, 12), mats.body);
    motor.position.set(px * 0.78, 0.06, pz * 0.78);
    escArms.add(motor);

    const led = new Mesh(new SphereGeometry(0.035, 8, 8), pz > 0 ? mats.green : mats.red);
    led.position.set(px * 0.78, -0.02, pz * 0.78);
    escArms.add(led);

    const hub = new Group();
    hub.position.set(px * 0.78, 0.14, pz * 0.78);
    const blade1 = new Mesh(new BoxGeometry(0.72, 0.008, 0.055), mats.rotor);
    const blade2 = blade1.clone();
    blade2.rotation.y = Math.PI / 2;
    const disc = new Mesh(new CircleGeometry(0.36, 24), mats.rotor.clone());
    disc.material.opacity = 0.1;
    disc.rotation.x = -Math.PI / 2;
    hub.add(blade1, blade2, disc);
    rotors.add(hub);
    rotorHubs.push(hub);
  });
  registerComponent('escArms', escArms, [0, 0, 0], [0, -0.5, 0], 0.7, [0, 0.4, 0]);
  registerComponent('rotors', rotors, [0, 0, 0], [0, 0.9, 0], 1.2, [0, -0.4, 0]);

  // antenna mast — NEW per §6.2, rear of body -> "APIs & Cloud"
  const antenna = new Group();
  const mast = new Mesh(new CylinderGeometry(0.012, 0.012, 0.34, 8), mats.dark);
  mast.position.y = 0.17;
  const tip = new Mesh(new SphereGeometry(0.03, 8, 8), mats.cyan);
  tip.position.y = 0.34;
  antenna.add(mast, tip);
  registerComponent('antenna', antenna, [0, 0.1, -0.4], [0, 0.4, -1], 1.0, [0.4, 0, 0]);

  // battery slab — NEW per §6.2, under the body -> "Deployment & CI/CD"
  const battery = new Mesh(new BoxGeometry(0.5, 0.1, 0.3), mats.dark);
  registerComponent('battery', battery, [0, -0.16, 0], [0, -1, 0], 0.8, [0, 0, 0.3]);

  // skids + legs — cosmetic, not a callout target
  const undercarriage = new Group();
  [0.28, -0.28].forEach((sx) => {
    const skid = new Mesh(new BoxGeometry(0.05, 0.05, 0.8), mats.dark);
    skid.position.set(sx, -0.2, 0);
    undercarriage.add(skid);
  });
  [
    [0.28, 0.25],
    [-0.28, 0.25],
    [0.28, -0.25],
    [-0.28, -0.25],
  ].forEach(([lx, lz]) => {
    const leg = new Mesh(new BoxGeometry(0.04, 0.14, 0.04), mats.dark);
    leg.position.set(lx, -0.14, lz);
    undercarriage.add(leg);
  });
  drone.add(undercarriage);

  // radialScale (Amendment B) shrinks how far components fly out on narrow
  // viewports — applied to the offset only, k still drives the 0..1 ramp.
  function explode(k, radialScale = 1) {
    k = Math.min(1, Math.max(0, k));
    for (const name in components) {
      const c = components[name];
      c.object.position.set(
        c.assembled[0] + (c.exploded[0] - c.assembled[0]) * k * radialScale,
        c.assembled[1] + (c.exploded[1] - c.assembled[1]) * k * radialScale,
        c.assembled[2] + (c.exploded[2] - c.assembled[2]) * k * radialScale
      );
      c.object.rotation.set(c.rot[0] * k, c.rot[1] * k, c.rot[2] * k);
    }
  }
  explode(0);

  const prevPos = new Vector3().copy(drone.position);
  const targetVec = new Vector3();

  // Flight behaviour driven by the director's sampled target position.
  // `flying` is false once T is in the final landing settle (T >= 0.985),
  // matching v1's landed-state spin/bob cutoff.
  function update(dt, targetPos, { time, reducedMotion, flying }) {
    const damp = reducedMotion ? 1 : 1 - Math.exp(-4.2 * dt);

    prevPos.copy(drone.position);
    targetVec.set(targetPos[0], targetPos[1], targetPos[2]);
    drone.position.lerp(targetVec, reducedMotion ? 1 : damp * 1.6);

    const vx = drone.position.x - prevPos.x;
    const vz = drone.position.z - prevPos.z;
    const speed = Math.sqrt(vx * vx + vz * vz) / Math.max(dt, 1e-4);

    if (speed > 0.15) {
      const yaw = Math.atan2(vx, vz);
      let dy = yaw - drone.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      drone.rotation.y += dy * damp * 2;
    }
    drone.rotation.z += (-vx * 0.6 - drone.rotation.z) * damp * 2;
    drone.rotation.x += (Math.min(speed * 0.05, 0.28) * (vz < 0 ? 1 : -1) - drone.rotation.x) * damp * 2;

    if (!reducedMotion && speed < 0.6 && flying) {
      drone.position.y += Math.sin(time * 2.1) * 0.05 * (1 - Math.min(speed, 1));
    }

    const spin = reducedMotion ? 2 : flying ? 16 + speed * 4 : 3;
    rotorHubs.forEach((hub, i) => {
      hub.rotation.y += dt * spin * (i % 2 ? 1 : -1);
    });

    return speed;
  }

  return { group: drone, explode, update, components };
}
