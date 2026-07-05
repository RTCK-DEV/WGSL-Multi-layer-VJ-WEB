import type { ShaderModuleDef } from '../core/types';

const wgsl = `
fn alienBioMap(p: vec3f) -> f32 {
  let pulse = G.bass * 0.5;
  var d = length(p) - 1.0 - pulse;
  for (var i = 0; i < 4; i = i + 1) {
    let fi = f32(i);
    let pos = vec3f(
      sin(G.time * 0.5 + fi) * P.spread,
      cos(G.time * 0.3 + fi * 2.0) * P.spread * 0.5,
      sin(G.time * 0.7 + fi * 1.5) * P.spread
    );
    let d2 = length(p - pos) - 0.5 - (G.mid * 0.3);
    d = smin(d, d2, P.morph);
  }
  return d;
}

fn alienBioNormal(p: vec3f) -> vec3f {
  let d = alienBioMap(p);
  let e = vec2f(0.01, 0.0);
  return normalize(vec3f(
    d - alienBioMap(p - vec3f(e.x, e.y, e.y)),
    d - alienBioMap(p - vec3f(e.y, e.x, e.y)),
    d - alienBioMap(p - vec3f(e.y, e.y, e.x))
  ));
}

fn shade(uv: vec2f, frag: vec2f) -> vec4f {
  // GLSL: (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y.
  // Builder frag is already clip/NDC space (-1..1), so only aspect-scale it.
  let pUv = frag * G.resolution.xy / G.resolution.y;
  let ro = vec3f(0.0, 0.0, 6.0);
  let rd = normalize(vec3f(pUv, -1.0));
  var t = 0.0;

  for (var i = 0; i < 48; i = i + 1) {
    let d = alienBioMap(ro + rd * t);
    if (d < 0.01) {
      let p = ro + rd * t;
      let n = alienBioNormal(p);
      let l = normalize(vec3f(1.0, 1.0, 1.0));
      let diff = max(dot(n, l), 0.0);
      let spec = pow(max(dot(reflect(-l, n), -rd), 0.0), 32.0);
      var col = 0.5 + 0.5 * cos(vec3f(G.time) + p.xyx + vec3f(0.0, 2.0, 4.0));
      col = col * diff + vec3f(P.shine) * spec;
      return vec4f(col, 1.0);
    }
    t = t + d;
    if (t > 20.0) {
      break;
    }
  }
  return vec4f(0.0, 0.0, 0.0, 1.0);
}
`;

export default {
  key: 'alien-bio',
  name: 'Alien Bio [Organic]',
  category: 'ORGANIC',
  kind: 'generator',
  wgsl,
  params: {
    morph: { type: 'f32', default: 1.0, min: 0.0, max: 2.0 },
    spread: { type: 'f32', default: 2.0, min: 1.0, max: 4.0 },
    shine: { type: 'f32', default: 1.0, min: 0.5, max: 2.0 },
  },
} satisfies ShaderModuleDef;
