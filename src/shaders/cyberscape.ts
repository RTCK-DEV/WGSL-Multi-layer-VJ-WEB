import type { ShaderModuleDef } from '../core/types';

const wgsl = `
fn shade(uv: vec2f, frag: vec2f) -> vec4f {
  // GLSL: (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y.
  // Builder frag is already clip/NDC space (-1..1), so only aspect-scale it.
  let pUv = frag * G.resolution.xy / G.resolution.y;
  let ro = vec3f(0.0, P.height, G.time * P.velocity);
  let rd = normalize(vec3f(pUv.x, pUv.y - 0.2, 1.0));
  let t = -ro.y / rd.y;
  var col = vec3f(0.0);
  col = col + vec3f(0.05, 0.0, 0.1) * (1.0 - pUv.y);

  if (t > 0.0) {
    let gridScale = P.density / 40.0;
    let pos = ro + rd * t;
    let gridUV = fract(pos.xz * gridScale) - vec2f(0.5);
    let id = floor(pos.xz * gridScale);
    let grid = smoothstep(0.45, 0.48, max(abs(gridUV.x), abs(gridUV.y)));
    var gridCol = vec3f(0.8, 0.0, 1.0);
    gridCol = gridCol + vec3f(0.0, 1.0, 1.0) * sin(pos.z * 0.1 + G.time);
    col = mix(col, gridCol, grid);

    let n = hash21(id);
    if (n > 0.8) {
      let blink = step(0.1, hash21(id + vec2f(0.0, G.time)));
      col = col + vec3f(0.1, 0.5, 1.0) * 2.0 * blink;
    }
    col = col * exp(-0.05 * t);
  }

  let sun = length(pUv - vec2f(0.0, 0.2));
  if (sun < 0.3) {
    let stripes = sin(pUv.y * 100.0 + G.time);
    if (stripes > 0.0 || pUv.y > 0.2) {
      col = col + vec3f(1.0, 0.2, 0.4) * 2.0;
    }
  }

  return vec4f(col, 1.0);
}
`;

export default {
  key: 'cyberscape',
  name: 'Cyberscape [Neon]',
  category: 'GRID',
  kind: 'generator',
  wgsl,
  params: {
    velocity: { type: 'f32', default: 1.0, min: 0.1, max: 3.0 },
    density: { type: 'f32', default: 20.0, min: 5.0, max: 50.0 },
    height: { type: 'f32', default: 1.0, min: 0.1, max: 2.0 },
  },
} satisfies ShaderModuleDef;
