import type { ShaderModuleDef } from '../core/types';

const wgsl = `
fn cyberDystopiaMap(p: vec3f) -> f32 {
  let q = vec3f(
    modf(p.x, 2.0) - 1.0,
    p.y,
    modf(p.z + G.time * 5.0, 4.0) - 2.0
  );
  let id = floor(vec2f(p.x / 2.0, (p.z + G.time * 5.0) / 4.0));
  var h = sin(id.x * 12.3 + id.y * 4.5) * P.height;
  if (h > 0.0) {
    h = h + G.bass * 2.0;
  }
  return sdBox3(q - vec3f(0.0, h - 2.0, 0.0), vec3f(0.5, h, 0.5));
}

fn shade(uv: vec2f, frag: vec2f) -> vec4f {
  // GLSL: (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y.
  // Builder frag is already clip/NDC space (-1..1), so only aspect-scale it.
  let pUv = frag * G.resolution.xy / G.resolution.y;
  let ro = vec3f(0.0, 3.0, 0.0);
  let rd = normalize(vec3f(pUv.x, pUv.y - 0.3, 1.0));
  var t = 0.0;
  var col = vec3f(0.0);

  for (var i = 0; i < 60; i = i + 1) {
    let p = ro + rd * t;
    let d = cyberDystopiaMap(p);
    if (d < 0.01) {
      col = vec3f(0.1);
      if (modf(p.y + G.time, 1.0) < 0.1) {
        col = col + vec3f(0.0, 1.0, 1.0) * 2.0;
      }
      if (modf(p.y, 0.5) < 0.05) {
        col = col + vec3f(1.0, 0.0, 1.0) * G.treble;
      }
      break;
    }
    t = t + d * 0.8;
    if (t > 50.0) {
      break;
    }
  }

  col = mix(col, vec3f(0.05, 0.0, 0.1), 1.0 - exp(-P.fog * t));
  return vec4f(col, 1.0);
}
`;

export default {
  key: 'cyber-dystopia',
  name: 'Cyber Dystopia [City]',
  category: 'CITY',
  kind: 'generator',
  wgsl,
  params: {
    density: { type: 'f32', default: 3.0, min: 1.0, max: 5.0 },
    height: { type: 'f32', default: 2.0, min: 0.5, max: 4.0 },
    fog: { type: 'f32', default: 0.1, min: 0.01, max: 0.2 },
  },
} satisfies ShaderModuleDef;
