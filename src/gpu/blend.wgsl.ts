/** WGSL blend helpers and compose shaders for layer compositing. */
import { BLEND_MODES } from '../core/types.js';

export const BLEND_MODE_INDEX: Readonly<Record<(typeof BLEND_MODES)[number], number>> = Object.freeze(
  BLEND_MODES.reduce<Record<(typeof BLEND_MODES)[number], number>>((acc, mode, index) => {
    acc[mode] = index;
    return acc;
  }, {} as Record<(typeof BLEND_MODES)[number], number>),
);

export const BLEND_WGSL = `
fn blendNormal(base: vec3f, src: vec3f) -> vec3f {
  return src;
}

fn blendAdd(base: vec3f, src: vec3f) -> vec3f {
  return min(base + src, vec3f(1.0));
}

fn blendMultiply(base: vec3f, src: vec3f) -> vec3f {
  return base * src;
}

fn blendScreen(base: vec3f, src: vec3f) -> vec3f {
  return 1.0 - (1.0 - base) * (1.0 - src);
}

fn blendDifference(base: vec3f, src: vec3f) -> vec3f {
  return abs(base - src);
}

fn overlayChannel(base: f32, src: f32) -> f32 {
  if (base < 0.5) {
    return 2.0 * base * src;
  }
  return 1.0 - 2.0 * (1.0 - base) * (1.0 - src);
}

fn blendOverlay(base: vec3f, src: vec3f) -> vec3f {
  return vec3f(
    overlayChannel(base.r, src.r),
    overlayChannel(base.g, src.g),
    overlayChannel(base.b, src.b)
  );
}

fn softLightChannel(base: f32, src: f32) -> f32 {
  if (src < 0.5) {
    return base - (1.0 - 2.0 * src) * base * (1.0 - base);
  }
  let d = select(sqrt(base), ((16.0 * base - 12.0) * base + 4.0) * base, base <= 0.25);
  return base + (2.0 * src - 1.0) * (d - base);
}

fn blendSoftLight(base: vec3f, src: vec3f) -> vec3f {
  return vec3f(
    softLightChannel(base.r, src.r),
    softLightChannel(base.g, src.g),
    softLightChannel(base.b, src.b)
  );
}

fn hardLightChannel(base: f32, src: f32) -> f32 {
  if (src < 0.5) {
    return 2.0 * base * src;
  }
  return 1.0 - 2.0 * (1.0 - base) * (1.0 - src);
}

fn blendHardLight(base: vec3f, src: vec3f) -> vec3f {
  return vec3f(
    hardLightChannel(base.r, src.r),
    hardLightChannel(base.g, src.g),
    hardLightChannel(base.b, src.b)
  );
}

fn colorDodgeChannel(base: f32, src: f32) -> f32 {
  if (src >= 1.0) {
    return 1.0;
  }
  return min(base / max(1.0 - src, 0.00001), 1.0);
}

fn blendColorDodge(base: vec3f, src: vec3f) -> vec3f {
  return vec3f(
    colorDodgeChannel(base.r, src.r),
    colorDodgeChannel(base.g, src.g),
    colorDodgeChannel(base.b, src.b)
  );
}

fn colorBurnChannel(base: f32, src: f32) -> f32 {
  if (src <= 0.0) {
    return 0.0;
  }
  return 1.0 - min((1.0 - base) / max(src, 0.00001), 1.0);
}

fn blendColorBurn(base: vec3f, src: vec3f) -> vec3f {
  return vec3f(
    colorBurnChannel(base.r, src.r),
    colorBurnChannel(base.g, src.g),
    colorBurnChannel(base.b, src.b)
  );
}

fn blend(base: vec3f, src: vec3f, mode: u32) -> vec3f {
  if (mode == 1u) {
    return blendAdd(base, src);
  }
  if (mode == 2u) {
    return blendMultiply(base, src);
  }
  if (mode == 3u) {
    return blendScreen(base, src);
  }
  if (mode == 4u) {
    return blendDifference(base, src);
  }
  if (mode == 5u) {
    return blendOverlay(base, src);
  }
  if (mode == 6u) {
    return blendSoftLight(base, src);
  }
  if (mode == 7u) {
    return blendHardLight(base, src);
  }
  if (mode == 8u) {
    return blendColorDodge(base, src);
  }
  if (mode == 9u) {
    return blendColorBurn(base, src);
  }
  return blendNormal(base, src);
}`;

const FULLSCREEN_VERTEX_WGSL = `
struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );
  let position = positions[vertexIndex];
  var out: VertexOut;
  out.position = vec4f(position, 0.0, 1.0);
  out.uv = position * 0.5 + vec2f(0.5);
  return out;
}`;

export const COMPOSE_SHADER_WGSL = `${FULLSCREEN_VERTEX_WGSL}
${BLEND_WGSL}

struct ComposeUniforms {
  opacity: f32,
  mode: u32,
  _pad: vec2f,
};

@group(0) @binding(0) var u_sampler: sampler;
@group(0) @binding(1) var u_base: texture_2d<f32>;
@group(0) @binding(2) var u_src: texture_2d<f32>;
@group(0) @binding(3) var<uniform> u_compose: ComposeUniforms;

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let base = textureSample(u_base, u_sampler, in.uv);
  let src = textureSample(u_src, u_sampler, in.uv);
  let blended = blend(base.rgb, src.rgb, u_compose.mode);
  let alpha = clamp(u_compose.opacity * src.a, 0.0, 1.0);
  return vec4f(mix(base.rgb, blended, alpha), max(base.a, alpha));
}`;

export const BLIT_SHADER_WGSL = `${FULLSCREEN_VERTEX_WGSL}

@group(0) @binding(0) var u_sampler: sampler;
@group(0) @binding(1) var u_src: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  return textureSample(u_src, u_sampler, in.uv);
}`;

export const MIX_SHADER_WGSL = `${FULLSCREEN_VERTEX_WGSL}

struct MixUniforms {
  mixValue: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(0) var u_sampler: sampler;
@group(0) @binding(1) var u_a: texture_2d<f32>;
@group(0) @binding(2) var u_b: texture_2d<f32>;
@group(0) @binding(3) var<uniform> u_mix: MixUniforms;

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let a = textureSample(u_a, u_sampler, in.uv);
  let b = textureSample(u_b, u_sampler, in.uv);
  return mix(a, b, clamp(u_mix.mixValue, 0.0, 1.0));
}`;

export const BLACKOUT_SHADER_WGSL = `${FULLSCREEN_VERTEX_WGSL}

@fragment
fn fs_main() -> @location(0) vec4f {
  return vec4f(0.0, 0.0, 0.0, 1.0);
}`;
