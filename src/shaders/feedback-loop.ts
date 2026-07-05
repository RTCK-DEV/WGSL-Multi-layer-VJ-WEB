import type { ShaderModuleDef } from '../core/types';

const wgsl = `
fn shade(uv: vec2f, frag: vec2f) -> vec4f {
  var p = uv - vec2f(0.5);

  let a = P.rot + G.bass * 0.05;
  p = rotate2d(p, a);

  let z = P.zoom - G.bass * 0.02;
  let nextUV = p * z + vec2f(0.5);

  var prev = textureSample(feedbackTex, samp, nextUV);
  let curr = textureSample(inputTex, samp, uv);

  prev = prev * 0.95;
  let col = max(prev.rgb, curr.rgb);

  return vec4f(col, 1.0);
}
`;

export default {
  key: 'feedback-loop',
  name: 'Infinity Loop [Filter]',
  category: 'FEEDBACK',
  kind: 'feedback',
  wgsl,
  params: {
    zoom: { type: 'f32', default: 0.98, min: 0.9, max: 1.01 },
    rot: { type: 'f32', default: 0.0, min: -0.1, max: 0.1 },
  },
} satisfies ShaderModuleDef;
