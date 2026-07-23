import { PlaneGeometry, ShaderMaterial, UniformsUtils, UniformsLib, Color, Mesh } from 'three';

// P2.5 Amendment D: the flat wireframe grid at a uniform 0.85 alpha over a
// near-black background doesn't register as ground — it needs a reason to
// be brighter somewhere.
//
// P2.7: two wrong reasons tried and rejected before this one, both for the
// same underlying mistake — a RADIAL falloff around a world-space point
// (first the drone's position, then the camera's) puts a circular bright
// patch on the ground that, seen through an angled perspective camera,
// projects as an ellipse. At the hero framing that ellipse sat directly
// behind the headline ("soft teal oval... reads as a stain") no matter
// whose position it was centred on — confirmed by disabling the composer
// and hiding every other candidate mesh, and by measuring: with the
// camera-relative version, the region behind the hero headline measured
// ~2x the luminance of an equal-sized region to the side, composer OFF.
//
// Fixed by dropping the radial falloff entirely in favour of camera-space
// depth: how far a point is along the camera's *forward* axis, not its
// straight-line distance from the camera. This brightens a BAND across
// the width of the frame at a given distance (following the grid's own
// perspective lines), not a spotlight centred on any single point — it
// can't produce an ellipse because it has no centre to project.
const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec2 vUv;
  varying float vViewDepth;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  varying vec2 vUv;
  varying float vViewDepth;
  uniform vec3 uGridColor;
  uniform float uCells;
  uniform float uNearDepth;
  uniform float uFarDepth;

  float gridLine(vec2 uv, float cells) {
    vec2 coord = uv * cells;
    vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
    float line = min(grid.x, grid.y);
    return 1.0 - min(line, 1.0);
  }

  void main() {
    float line = gridLine(vUv, uCells);
    // 1 right in front of the camera, fading to 0 by uFarDepth — a
    // depth band, not a radius, so it can't project as an ellipse.
    float proximity = 1.0 - smoothstep(uNearDepth, uFarDepth, vViewDepth);
    // v1.1-B #3: grid line brightness +30% near/mid field, part of the
    // global "raise the world one stop" pass (1.8*1.3, 1.6*1.3).
    vec3 color = uGridColor * (2.34 + proximity * 2.08);
    float alpha = line * (0.62 + proximity * 0.3);
    gl_FragColor = vec4(color, alpha);
    #include <fog_fragment>
  }
`;

export function createTerrain() {
  // P2.6: a 1x1-segment plane is exactly two triangles meeting on one
  // corner-to-corner diagonal. fwidth()-based derivatives in gridLine()
  // are computed per-triangle, and at grazing viewing angles the 2x2-pixel
  // derivative sample straddling that single seam produced a spurious
  // bright line along it — invisible in the raw render but amplified by
  // UnrealBloomPass into the "dark red diagonal line" from the P2.6 live
  // review (ACES tone mapping shifts blown highlights warm/red). Enough
  // segments spreads any such seam artifact across many small, imperceptible
  // edges instead of one long diagonal one.
  const geometry = new PlaneGeometry(240, 240, 48, 48);
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        // design token --grid (§2) — terrain wireframe / hairlines
        uGridColor: { value: new Color(0x0f2b31) },
        uCells: { value: 90 },
        uNearDepth: { value: 6 },
        uFarDepth: { value: 40 },
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
