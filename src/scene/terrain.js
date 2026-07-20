import {
  PlaneGeometry,
  ShaderMaterial,
  UniformsUtils,
  UniformsLib,
  Color,
  Vector3,
  Mesh,
} from 'three';

// P2.5 Amendment D: the flat wireframe grid at a uniform 0.85 alpha over a
// near-black background doesn't register as ground — it needs a reason to
// be brighter somewhere. Rather than raising --grid itself (a design
// token, not a per-scene knob), the fragment shader boosts line brightness
// as a function of distance to the drone's current world position, fed in
// per frame from main.js via uDronePos. Falls back to the still-slightly-
// brighter base rate everywhere else so the corridor doesn't look like a
// spotlight cutout.
const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  varying vec2 vUv;
  varying vec3 vWorldPos;
  uniform vec3 uGridColor;
  uniform float uCells;
  uniform vec3 uDronePos;
  uniform float uBoostRadius;

  float gridLine(vec2 uv, float cells) {
    vec2 coord = uv * cells;
    vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
    float line = min(grid.x, grid.y);
    return 1.0 - min(line, 1.0);
  }

  void main() {
    float line = gridLine(vUv, uCells);
    float dist = length(vWorldPos.xz - uDronePos.xz);
    float proximity = 1.0 - smoothstep(0.0, uBoostRadius, dist);
    vec3 color = uGridColor * (1.6 + proximity * 2.2);
    float alpha = line * (0.55 + proximity * 0.4);
    gl_FragColor = vec4(color, alpha);
    #include <fog_fragment>
  }
`;

export function createTerrain() {
  const geometry = new PlaneGeometry(240, 240, 1, 1);
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        // design token --grid (§2) — terrain wireframe / hairlines
        uGridColor: { value: new Color(0x0f2b31) },
        uCells: { value: 90 },
        uDronePos: { value: new Vector3(0, 0, 0) },
        uBoostRadius: { value: 15 },
      },
    ]),
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0, -25);
  return mesh;
}
