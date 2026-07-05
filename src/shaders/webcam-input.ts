import type { ShaderModuleDef } from '../core/types';

const wgsl = `
fn shade(uv: vec2f, frag: vec2f) -> vec4f {
  return textureSample(inputTex, samp, uv);
}
`;

export default {
  key: 'webcam-input',
  name: 'WebCam Source',
  category: 'EXTERNAL',
  kind: 'external',
  wgsl,
  params: {},
} satisfies ShaderModuleDef;
