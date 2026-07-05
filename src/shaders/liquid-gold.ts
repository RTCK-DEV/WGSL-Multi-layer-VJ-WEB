import type { ShaderModuleDef } from '../core/types';

const wgsl = `
fn shade(uv: vec2f, frag: vec2f) -> vec4f {
  // Builder frag is already clip/NDC space (-1..1), so only aspect-scale it.
  let st = frag * G.resolution.xy / G.resolution.y;
  let q = vec2f(
    fbm2(st * P.zoom + 0.00 * G.time * P.flow),
    fbm2(st * P.zoom + vec2f(1.0))
  );

  let r = vec2f(
    fbm2(st + q + vec2f(1.7, 9.2) + 0.15 * G.time * P.flow),
    fbm2(st + q + vec2f(8.3, 2.8) + 0.126 * G.time * P.flow)
  );

  let f = fbm2(st + r + vec2f(G.mid));
  var color = mix(
    vec3f(0.101961, 0.619608, 0.666667),
    vec3f(0.666667, 0.666667, 0.498039),
    clamp((f * f) * 4.0, 0.0, 1.0)
  );
  color = mix(color, vec3f(0.0, 0.0, 0.164706), clamp(length(q), 0.0, 1.0));
  color = mix(color, vec3f(0.666667, 1.0, 1.0), clamp(abs(r.x), 0.0, 1.0));

  let shine = pow(f, 4.0) * P.metallic * (1.0 + G.treble * 2.0);
  color = color + vec3f(1.0, 0.8, 0.4) * shine;
  return vec4f(color, 1.0);
}
`;

export default {
  key: 'liquid-gold',
  name: 'Liquid Gold [FBM]',
  category: 'FLUID',
  kind: 'generator',
  wgsl,
  params: {
    flow: { type: 'f32', default: 1.0, min: 0.1, max: 3.0 },
    metallic: { type: 'f32', default: 0.8, min: 0.0, max: 1.0 },
    zoom: { type: 'f32', default: 3.0, min: 1.0, max: 8.0 },
  },
} satisfies ShaderModuleDef;
