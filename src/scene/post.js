// Amendment C (P2.5): post-processing pulled forward from P5. §3's original
// spec (strength <=0.55, threshold >=0.75) was tuned for a scene that
// already had emissive sources worth glowing; the P2 scene didn't (near-
// black void, near-invisible grid), so this starts stronger and is meant
// to be retuned once Amendment D's lighting/emissive work lands, not
// treated as final. Disabled entirely on TIER_LOW (scene/tier.js).
import { Vector2 } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';

export function createPostPipeline(renderer, scene, camera, tier) {
  if (tier === 'LOW') {
    return {
      render: () => renderer.render(scene, camera),
      resize() {},
    };
  }

  const size = new Vector2(window.innerWidth, window.innerHeight);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // P2.5 first pass (0.8/0.4/0.7) blew every emissive into a soft-white
  // blob. P2.6 live review: even the corrected 0.4/0.35/0.82 still read as
  // "glowing blobs, invisible airframe" — the drone must be legible from
  // its own lit geometry, with bloom only as a small accent on genuinely
  // bright points (nav LEDs, lens, pad ring), never as the thing that
  // makes the body visible at all.
  const bloom = new UnrealBloomPass(size, 0.25, 0.35, 0.9);
  composer.addPass(bloom);

  const vignette = new ShaderPass(VignetteShader);
  vignette.uniforms.offset.value = 1.1;
  vignette.uniforms.darkness.value = 1.15;
  composer.addPass(vignette);

  const grain = new FilmPass(0.03, false);
  composer.addPass(grain);

  // Composer passes render in linear space; OutputPass converts back to
  // the renderer's configured output color space/tone mapping and must be
  // last, or every earlier pass's sRGB assumptions (e.g. ShaderPass) break.
  composer.addPass(new OutputPass());

  function resize() {
    composer.setSize(window.innerWidth, window.innerHeight);
  }

  let enabled = true;
  // P2.6 gate (f): render with the composer fully bypassed, so the drone's
  // legibility can be verified against its own lit geometry alone, with
  // no bloom/vignette/grain contribution at all.
  function setEnabled(next) {
    enabled = next;
  }

  return {
    render: () => (enabled ? composer.render() : renderer.render(scene, camera)),
    resize,
    setEnabled,
    bloom,
  };
}
