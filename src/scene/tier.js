// Minimal performance-tier detection (MISSION_PLAN.md §3's HIGH/MED/LOW
// table). Only the LOW split matters so far — Amendment C's post-processing
// composer is the only thing gated on it right now. MED's simplified-
// terrain/particle-budget behaviour is unbuilt scope; this file doesn't
// pretend to implement it.
export function detectTier(renderer) {
  const gl = renderer.getContext();
  if (!gl) return 'LOW';

  const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = dbgInfo ? String(gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL)) : '';
  if (/swiftshader|software|llvmpipe|microsoft basic render/i.test(rendererName)) return 'LOW';

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return isMobile ? 'MED' : 'HIGH';
}
