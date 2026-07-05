import type { ShaderModuleDef } from '../core/types';

const wgsl = `
fn shade(uv: vec2f, frag: vec2f) -> vec4f {
  // GLSL: (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y.
  // Builder frag is already clip/NDC space (-1..1), so only aspect-scale it.
  let pUv = frag * G.resolution.xy / G.resolution.y;
  let r = length(pUv);
  let a = atan2(pUv.y, pUv.x);
  let movement = G.time * P.speed + G.bass * 2.0;
  let distortion = sin(a * 5.0 + movement) * G.treble * 0.2;
  let p = vec2f(1.0 / (r + distortion * 0.1) + movement, a / PI);
  let grid = sin(p.x * 20.0) * sin(p.y * 10.0 * P.warp);
  let glow = 0.01 / abs(grid);

  let paletteShift = p.x * 0.2 + P.color_shift + G.bass;
  var col = vec3f(
    sin(paletteShift) * 0.5 + 0.5,
    sin(paletteShift + 2.0) * 0.5 + 0.5,
    sin(paletteShift + 4.0) * 0.5 + 0.5
  );
  col = col * glow * (1.5 + G.treble * 3.0);
  col = col * smoothstep(0.0, 0.8, r);
  return vec4f(col, 1.0);
}
`;

export default {
  key: 'wormhole-x',
  name: 'Wormhole X [High Speed]',
  category: 'TUNNEL',
  kind: 'generator',
  wgsl,
  params: {
    speed: { type: 'f32', default: 1.5, min: 0.1, max: 4.0 },
    warp: { type: 'f32', default: 2.0, min: 0.5, max: 5.0 },
    color_shift: { type: 'f32', default: 0.0, min: 0.0, max: 1.0 },
  },
} satisfies ShaderModuleDef;
