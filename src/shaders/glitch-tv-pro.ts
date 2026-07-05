import type { ShaderModuleDef } from '../core/types';

const wgsl = `
fn shade(uv: vec2f, frag: vec2f) -> vec4f {
  var sampleUv = uv;
  let time = G.time * P.speed;
  let glitchAmount = P.amount * (1.0 + G.bass * 2.0);
  let glitch = hash21(vec2f(time, 0.0)) * glitchAmount;

  if (hash21(vec2f(floor(sampleUv.y * 20.0), time)) > 0.95) {
    sampleUv = vec2f(sampleUv.x + glitch, sampleUv.y);
  }

  let roll = hash21(vec2f(time * 0.2, 1.0)) - 0.5;
  if (G.bass > 0.5) {
    sampleUv = vec2f(sampleUv.x, fract(sampleUv.y + roll * 0.1));
  }

  var color = textureSample(inputTex, samp, sampleUv).rgb;
  let lineNoise = (hash21(vec2f(sampleUv.y, time)) - 0.5) * 0.1 * P.amount;
  color = color + vec3f(lineNoise);

  if (G.bass > 0.4) {
    let red = textureSample(inputTex, samp, sampleUv + vec2f(0.01 * G.bass, 0.0)).r;
    let blue = textureSample(inputTex, samp, sampleUv - vec2f(0.01 * G.bass, 0.0)).b;
    color = vec3f(red, color.g, blue);
  }

  return vec4f(color, 1.0);
}
`;

export default {
  key: 'glitch-tv-pro',
  name: 'Glitch TV [Filter]',
  category: 'FILTER',
  kind: 'filter',
  wgsl,
  params: {
    amount: { type: 'f32', default: 0.5, min: 0.0, max: 1.0 },
    speed: { type: 'f32', default: 0.5, min: 0.0, max: 2.0 },
  },
} satisfies ShaderModuleDef;
