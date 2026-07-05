/** WGSL assembly for user shader bodies and generated GPU bindings. */
import type { ShaderModuleDef, ShaderParamDef, ShaderParamType } from '../core/types.js';
import { createParamLayout, type PackedParamLayout } from './param-packer.js';
import { WGSL_LIB } from '../shaders/lib.js';

export interface BuiltShaderModule {
  wgsl: string;
  preambleLineCount: number;
  paramLayout: PackedParamLayout;
}

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function countLines(source: string): number {
  return source.length === 0 ? 0 : source.split('\n').length;
}

function assertWgslIdentifier(name: string): void {
  if (!IDENTIFIER_RE.test(name)) {
    throw new SyntaxError(`Shader param name "${name}" is not a valid WGSL identifier.`);
  }
}

function wgslParamType(type: ShaderParamType): string {
  switch (type) {
    case 'f32':
      return 'f32';
    case 'vec2':
      return 'vec2f';
    case 'vec3':
    case 'color':
      return 'vec3f';
  }
}

function buildParamStruct(params: Record<string, ShaderParamDef>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) {
    return 'struct LayerParams {\n  _reserved: vec4f,\n};';
  }

  const fields = entries.map(([name, def]) => {
    assertWgslIdentifier(name);
    const type = wgslParamType(def.type);
    const sizePrefix = def.type === 'vec3' || def.type === 'color' ? '@size(16) ' : '';
    return `  ${sizePrefix}${name}: ${type},`;
  });

  return `struct LayerParams {\n${fields.join('\n')}\n};`;
}

function buildPreamble(params: Record<string, ShaderParamDef>): string {
  return `struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) frag: vec2f,
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
  out.frag = position;
  return out;
}

struct GlobalUniforms {
  time: f32,
  frame: f32,
  bass: f32,
  mid: f32,
  treble: f32,
  bpm: f32,
  beat: f32,
  phase: f32,
  resolution: vec2f,
  bands: array<vec4f, 2>,
};

@group(0) @binding(0) var<uniform> G: GlobalUniforms;

${buildParamStruct(params)}

@group(1) @binding(0) var<uniform> P: LayerParams;
@group(1) @binding(1) var samp: sampler;
@group(1) @binding(2) var inputTex: texture_2d<f32>;
@group(1) @binding(3) var feedbackTex: texture_2d<f32>;

fn sampleInput(uv: vec2f) -> vec4f {
  return textureSample(inputTex, samp, uv);
}

fn sampleFeedback(uv: vec2f) -> vec4f {
  return textureSample(feedbackTex, samp, uv);
}

${WGSL_LIB}`;
}

const FRAGMENT_MAIN = `
@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4f {
  return shade(in.uv, in.frag);
}`;

export function buildShaderModule(def: ShaderModuleDef): BuiltShaderModule {
  const paramLayout = createParamLayout(def.params);
  const preamble = buildPreamble(def.params);
  const body = def.wgsl.trimEnd();
  const preambleLineCount = countLines(preamble);
  const wgsl = `${preamble}\n${body}\n${FRAGMENT_MAIN}`;

  return { wgsl, preambleLineCount, paramLayout };
}

export function buildShaderBodyForValidation(wgslBody: string, params: Record<string, ShaderParamDef> = {}): BuiltShaderModule {
  return buildShaderModule({
    key: '__validation__',
    name: 'Validation Shader',
    category: 'VALIDATION',
    kind: 'generator',
    wgsl: wgslBody,
    params,
  });
}
