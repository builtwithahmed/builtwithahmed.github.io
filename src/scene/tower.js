// §6.4 inspection structure — stacked-box chimney silhouette (dimensions
// ported from the v1 prototype, reference/v1-prototype.html:526-538) plus
// three amber defect markers that light up as the scan ring passes them,
// which is new: v1 had no defect concept, this is what the P3 services
// "scan findings" callouts will conceptually point at.
import {
  Group,
  Mesh,
  BoxGeometry,
  SphereGeometry,
  TorusGeometry,
  MeshStandardMaterial,
} from 'three';

const SEGMENTS = 6;
const SEGMENT_HEIGHT = 1.35;
const BEACON_Y = SEGMENT_HEIGHT * SEGMENTS + 0.5;
const SCAN_MIN_Y = 1;
const SCAN_MAX_Y = BEACON_Y - 0.2;
const SCAN_PERIOD = 7.4;
const SCAN_SPEED = (SCAN_MAX_Y - SCAN_MIN_Y) / SCAN_PERIOD;

// Fixed heights (not random) so the scan-pass lighting logic in update()
// can be pre-computed against known targets instead of reading geometry
// back out at runtime.
const DEFECT_HEIGHTS = [2.4, 4.9, 7.1];

export function createTower(x = -4.2, z = -44) {
  const group = new Group();

  for (let i = 0; i < SEGMENTS; i++) {
    const w = 1.7 - i * 0.16;
    const seg = new Mesh(
      new BoxGeometry(w, SEGMENT_HEIGHT, w),
      new MeshStandardMaterial({ color: i % 2 ? 0x131c1e : 0x0f1719, roughness: 0.7, metalness: 0.4 })
    );
    seg.position.y = SEGMENT_HEIGHT / 2 + i * SEGMENT_HEIGHT;
    group.add(seg);
  }

  const beaconMat = new MeshStandardMaterial({ color: 0xff5449, emissive: 0xff5449, emissiveIntensity: 1.2 });
  const beacon = new Mesh(new SphereGeometry(0.14, 10, 10), beaconMat);
  beacon.position.y = BEACON_Y;
  group.add(beacon);

  const scanMat = new MeshStandardMaterial({
    color: 0x4fccd8,
    emissive: 0x4fccd8,
    emissiveIntensity: 1.4,
    transparent: true,
    opacity: 0.85,
  });
  const scanRing = new Mesh(new TorusGeometry(1.4, 0.025, 8, 40), scanMat);
  scanRing.rotation.x = Math.PI / 2;
  scanRing.position.y = SCAN_MIN_Y;
  group.add(scanRing);

  const defectMat = new MeshStandardMaterial({ color: 0xffb03a, emissive: 0xffb03a, emissiveIntensity: 0.3 });
  const defects = DEFECT_HEIGHTS.map((y, i) => {
    const mat = defectMat.clone();
    const mesh = new Mesh(new SphereGeometry(0.08, 8, 8), mat);
    // Alternate sides so all three read as distinct marks on the column,
    // not stacked on one face.
    const side = i % 2 ? 1 : -1;
    const w = 1.7 - Math.round(y / SEGMENT_HEIGHT) * 0.16;
    mesh.position.set(side * (w / 2 + 0.05), y, 0);
    group.add(mesh);
    return { mesh, mat, y };
  });

  group.position.set(x, 0, z);

  function update(time, reducedMotion) {
    if (reducedMotion) {
      // §Motion tokens: no ambient animation under reduced motion. Scan
      // ring and beacon hold a static mid-column reading position instead
      // of looping; defects hold their lit state rather than blinking.
      scanRing.position.y = (SCAN_MIN_Y + SCAN_MAX_Y) / 2;
      beaconMat.emissiveIntensity = 1.0;
      defects.forEach((d) => {
        d.mat.emissiveIntensity = 1.1;
      });
      return;
    }

    const scanY = SCAN_MIN_Y + ((time * SCAN_SPEED) % (SCAN_MAX_Y - SCAN_MIN_Y));
    scanRing.position.y = scanY;
    scanMat.opacity = 0.85 - ((time * SCAN_SPEED) % (SCAN_MAX_Y - SCAN_MIN_Y)) / (SCAN_MAX_Y - SCAN_MIN_Y) / 1.2;

    beaconMat.emissiveIntensity = 0.4 + Math.abs(Math.sin(time * 2.4)) * 1.2;

    defects.forEach((d) => {
      const distance = Math.abs(scanY - d.y);
      const proximity = Math.max(0, 1 - distance / 0.6);
      d.mat.emissiveIntensity = 0.3 + proximity * 2.2;
    });
  }

  return { group, update };
}
