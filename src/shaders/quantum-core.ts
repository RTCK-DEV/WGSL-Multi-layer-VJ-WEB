import type { ShaderModuleDef } from '../core/types';

const wgsl = `
fn quantumCoreMap(p0: vec3f) -> f32 {
  var p = p0;
  let xz = rotate2d(p.xz, G.time * P.speed * 0.5);
  p = vec3f(xz.x, p.y, xz.y);
  p = vec3f(rotate2d(p.xy, G.time * P.speed * 0.3), p.z);

  let distortion =
    sin(p.x * 5.0 + G.time * 2.0) *
    sin(p.y * 5.0 + G.time) *
    sin(p.z * 5.0) *
    G.bass * 0.5;

  var q = p;
  var d = sdBox3(q, vec3f(1.0));
  let s = 1.2;
  let iterations = i32(clamp(P.detail * 2.0, 1.0, 6.0));
  for (var i = 0; i < iterations; i = i + 1) {
    q = abs(q) / s;
    q = q - vec3f(0.5);
    let scale = pow(s, f32(i));
    d = max(d, -sdBox3(q, vec3f(0.4)) / scale);
  }
  return d + distortion * 0.2;
}

fn shade(uv: vec2f, frag: vec2f) -> vec4f {
  // GLSL: (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y.
  // Builder frag is already clip/NDC space (-1..1), so only aspect-scale it.
  let pUv = frag * G.resolution.xy / G.resolution.y;
  let ro = vec3f(0.0, 0.0, 3.5 - G.bass);
  let rd = normalize(vec3f(pUv, -1.5));
  var t = 0.0;
  var steps = 0;

  for (var i = 0; i < 48; i = i + 1) {
    let p = ro + rd * t;
    let d = quantumCoreMap(p);
    if (d < 0.001 || t > 20.0) {
      break;
    }
    t = t + d;
    steps = i;
  }

  var col = vec3f(0.0);
  if (t < 20.0) {
    let glow = f32(steps) / 48.0;
    var baseCol = vec3f(G.bass * 2.0, G.mid * 1.5, G.treble * 3.0);
    baseCol = baseCol + vec3f(0.1, 0.2, 0.5);
    col = baseCol * glow * P.glow;
    col = mix(col, vec3f(0.0), 1.0 - exp(-0.1 * t));
  }
  col = pow(col, vec3f(0.4545));
  return vec4f(col, 1.0);
}
`;

export default {
  key: 'quantum-core',
  name: 'Quantum Core [Heavy]',
  category: 'CORE',
  kind: 'generator',
  wgsl,
  params: {
    speed: { type: 'f32', default: 0.5, min: 0.0, max: 2.0 },
    detail: { type: 'f32', default: 1.5, min: 0.5, max: 3.0 },
    glow: { type: 'f32', default: 2.0, min: 1.0, max: 5.0 },
  },
} satisfies ShaderModuleDef;
