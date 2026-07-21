// §6.3 mission map — projects act (T 0.44-0.70). Path/waypoint coordinates
// are the v1 prototype's own wptPts (reference/v1-prototype.html:500-504),
// already tuned to sit inside the flight corridor the director's t=0.46-0.72
// keyframes fly through (z -20..-36) — reused verbatim rather than re-derived.
import {
  Group,
  Vector3,
  CatmullRomCurve3,
  BufferGeometry,
  Line,
  LineBasicMaterial,
  OctahedronGeometry,
  MeshStandardMaterial,
  GridHelper,
  RingGeometry,
  MeshBasicMaterial,
  Mesh,
} from 'three';

const WAYPOINTS = [
  [0, 2.6, -20],
  [3.2, 3.2, -24],
  [-3.0, 3.8, -27],
  [2.4, 2.8, -30],
  [-2.4, 3.4, -33],
  [0, 2.8, -36],
];

const PATH_N = 240;
// Matches the director's own act boundaries (director.js MODES / §5 table)
// rather than inventing a separate range — the path scrub, waypoint
// reach-state, and secondary grid fade must all agree with the camera act
// the viewer is actually in.
const ACT_START = 0.44;
const ACT_END = 0.7;

function smoothstep(u) {
  u = Math.min(1, Math.max(0, u));
  return u * u * (3 - 2 * u);
}

export function createMap() {
  const group = new Group();
  const points = WAYPOINTS.map((p) => new Vector3(...p));
  const curve = new CatmullRomCurve3(points);
  const pathPts = curve.getPoints(PATH_N);

  const pathGeo = new BufferGeometry().setFromPoints(pathPts);
  const pathLine = new Line(pathGeo, new LineBasicMaterial({ color: 0x4fccd8, transparent: true, opacity: 0.85 }));
  pathLine.geometry.setDrawRange(0, 0);
  group.add(pathLine);

  const groundPts = pathPts.map((p) => new Vector3(p.x, 0.02, p.z));
  const groundGeo = new BufferGeometry().setFromPoints(groundPts);
  const groundTrace = new Line(groundGeo, new LineBasicMaterial({ color: 0x1b4a52, transparent: true, opacity: 0.5 }));
  groundTrace.geometry.setDrawRange(0, 0);
  group.add(groundTrace);

  // Waypoints: octahedrons, amber (--warn) until the flight reaches them,
  // then green (--armed). Materials are per-instance (not shared) since
  // each one's color flips independently as T advances.
  const ambient = new MeshStandardMaterial({ color: 0xffb03a, emissive: 0xffb03a, emissiveIntensity: 0.9 });
  const waypoints = WAYPOINTS.map((p, i) => {
    const mat = ambient.clone();
    const mesh = new Mesh(new OctahedronGeometry(0.22), mat);
    mesh.position.set(...p);
    const reachT = ACT_START + (i / (WAYPOINTS.length - 1)) * (ACT_END - ACT_START);
    group.add(mesh);
    return { mesh, mat, reachT, baseScale: 1 };
  });

  // Secondary finer grid + concentric range rings, "tactical map" dressing
  // that only reads as such during the map act — centered on the path's
  // first waypoint (ground-projected), per §6.3.
  const secondaryGrid = new GridHelper(30, 30, 0x1b4a52, 0x122a2f);
  secondaryGrid.position.set(WAYPOINTS[0][0], 0.03, WAYPOINTS[0][2]);
  secondaryGrid.material.transparent = true;
  secondaryGrid.material.opacity = 0;
  group.add(secondaryGrid);

  const rings = [4, 7, 10].map((radius) => {
    const mesh = new Mesh(
      new RingGeometry(radius - 0.03, radius, 48),
      new MeshBasicMaterial({ color: 0x4fccd8, transparent: true, opacity: 0 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(WAYPOINTS[0][0], 0.025, WAYPOINTS[0][2]);
    group.add(mesh);
    return mesh;
  });

  function update(T, time, reducedMotion) {
    const progress = smoothstep((T - ACT_START) / (ACT_END - ACT_START));
    const drawCount = Math.round(progress * PATH_N);
    pathLine.geometry.setDrawRange(0, drawCount);
    groundTrace.geometry.setDrawRange(0, drawCount);

    // Fade the tactical dressing in/out around the act boundary rather than
    // a hard cut — 0.03 of T either side, matching the callout crossfade
    // scale used elsewhere (content.css) so this reads as one system.
    const dressing =
      smoothstep((T - (ACT_START - 0.03)) / 0.03) * (1 - smoothstep((T - (ACT_END - 0.03)) / 0.06));
    secondaryGrid.material.opacity = dressing * 0.15;
    rings.forEach((ring) => {
      ring.material.opacity = dressing * 0.15;
    });

    waypoints.forEach((wp, i) => {
      const reached = T >= wp.reachT;
      wp.mat.color.set(reached ? 0x3ddc84 : 0xffb03a);
      wp.mat.emissive.set(reached ? 0x3ddc84 : 0xffb03a);
      const isActive = !reached && (i === 0 || T >= waypoints[i - 1].reachT);
      const pulse = !reducedMotion && isActive ? 1 + Math.sin(time * 4) * 0.15 : 1;
      wp.mesh.scale.setScalar(pulse);
      wp.mat.emissiveIntensity = !reducedMotion && isActive ? 1.1 + Math.sin(time * 4) * 0.4 : 0.9;
    });
  }

  return { group, update };
}
