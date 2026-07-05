import type { ShaderModuleDef } from '../core/types';

const wgsl = `
fn crystalMap(p0: vec3f) -> f32 {
  var p = p0;
  var d = 1000.0;
  var s = 1.0;
  p = vec3f(rotate2d(p.xy, G.time * 0.1), p.z);
  let beat = G.bass * 0.2;
  for (var i = 0; i < 4; i = i + 1) {
    p = abs(p) - vec3f(P.fold + beat, P.fold * 0.5, 0.5);
    p = vec3f(rotate2d(p.xy, 1.0 + beat), p.z);
    let yz = rotate2d(p.yz, 0.5);
    p = vec3f(p.x, yz.x, yz.y);
    let sc = P.scale;
    p = p * sc;
    s = s * sc;
    d = min(d, length(p) / s);
  }
  return d;
}

fn shade(uv: vec2f, frag: vec2f) -> vec4f {
  // GLSL: (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y.
  // Builder frag is already clip/NDC space (-1..1), so only aspect-scale it.
  let pUv = frag * G.resolution.xy / G.resolution.y;
  let ro = vec3f(0.0, 0.0, -4.0);
  let rd = normalize(vec3f(pUv, 1.0));
  var t = 0.0;
  var acc = 0.0;
  for (var i = 0; i < 48; i = i + 1) {
    let p = ro + rd * t;
    let d = crystalMap(p);
    acc = acc + 0.02 / (0.01 + abs(d));
    if (d < 0.001 || t > 10.0) {
      break;
    }
    t = t + d;
  }
  var col = vec3f(acc * 0.05);
  col = col * vec3f(0.2 + P.color, 0.5, 0.8 - P.color * 0.5);
  col = col + G.treble * acc * 0.02 * vec3f(1.0, 0.8, 0.5);
  return vec4f(col, 1.0);
}
`;

export default {
  key: 'crystal-kifs',
  name: 'Crystal KIFS [Fractal]',
  category: 'FRACTAL',
  kind: 'generator',
  wgsl,
  params: {
    fold: { type: 'f32', default: 1.5, min: 0.5, max: 3.0 },
    scale: { type: 'f32', default: 2.0, min: 1.0, max: 4.0 },
    color: { type: 'f32', default: 0.5, min: 0.0, max: 1.0 },
  },
} satisfies ShaderModuleDef;
