import * as THREE from 'three';

// P0: flat wireframe-grid plane only. Vertex noise hills and the scan-sweep
// band (MISSION_PLAN.md §6.1) are P1+ work — deferred, see plan deviations.
// Fog is wired via three's built-in fog chunks (material.fog = true) rather
// than a hand-rolled distance fade, so it stays in sync with scene.fog (world.js).
const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  varying vec2 vUv;
  uniform vec3 uGridColor;
  uniform float uCells;

  float gridLine(vec2 uv, float cells) {
    vec2 coord = uv * cells;
    vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
    float line = min(grid.x, grid.y);
    return 1.0 - min(line, 1.0);
  }

  void main() {
    float line = gridLine(vUv, uCells);
    gl_FragColor = vec4(uGridColor, line * 0.85);
    #include <fog_fragment>
  }
`;

export function createTerrain() {
  const geometry = new THREE.PlaneGeometry(240, 240, 1, 1);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        // design token --grid (§2) — terrain wireframe / hairlines
        uGridColor: { value: new THREE.Color(0x0f2b31) },
        uCells: { value: 90 },
      },
    ]),
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0, -25);
  return mesh;
}
