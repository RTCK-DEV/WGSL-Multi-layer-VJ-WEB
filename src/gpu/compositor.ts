/** WebGPU render compositor for layers, scenes, crossfade, and final blit. */
import type {
  BlendMode,
  FrameContext,
  Layer,
  LayerTiming,
  LiveModulatorRegistry,
  ModulatorContext,
  Scene,
  ShaderModuleDef,
} from '../core/types.js';
import { BLEND_MODE_INDEX, BLACKOUT_SHADER_WGSL, BLIT_SHADER_WGSL, COMPOSE_SHADER_WGSL, MIX_SHADER_WGSL } from './blend.wgsl.js';
import { ParamPacker } from './param-packer.js';
import { buildShaderModule } from './shader-builder.js';
import type { LayerTextureSet, TextureHandle, TexturePool } from './textures.js';

interface RenderLayer {
  layer: Layer;
  shader: ShaderModuleDef;
}

export interface RenderSceneInput {
  scene: Scene;
  layers: RenderLayer[];
}

export interface CompositorRenderInput {
  frame: FrameContext;
  width: number;
  height: number;
  sceneA: RenderSceneInput;
  sceneB?: RenderSceneInput;
  crossfadeMix?: number;
  blackout: boolean;
  webcamTexture?: GPUTexture | null;
}

export interface CompositorFrameResult {
  finalScene: TextureHandle;
  layerTimings: LayerTiming[];
}

export interface LayerGpuState {
  layerId: string;
  shaderKey: string;
  paramsSignature: string;
  packer: ParamPacker;
  paramBuffer: GPUBuffer;
}

interface PipelineCacheEntry {
  signature: string;
  activeShader: ShaderModuleDef | null;
  pipeline: GPURenderPipeline | null;
  compiling: Promise<void> | null;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  shader: ShaderModuleDef;
}

export interface CompositorOptions {
  presentationFormat: GPUTextureFormat;
  texturePool: TexturePool;
  modulators: LiveModulatorRegistry;
  onPipelineError?: (shaderKey: string, error: unknown) => void;
}

const OPACITY_MODULATOR_KEY = '__opacity__';

function toScalar(value: number | number[]): number {
  return Array.isArray(value) ? (value[0] ?? 0) : value;
}

const GLOBAL_UNIFORM_BYTES = 80;
const COMPOSE_UNIFORM_BYTES = 16;
const MIX_UNIFORM_BYTES = 16;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function layerParamSignature(shader: ShaderModuleDef): string {
  return JSON.stringify(Object.entries(shader.params).map(([name, def]) => [name, def.type]));
}

function shaderSignature(shader: ShaderModuleDef): string {
  return `${shader.key}\n${shader.kind}\n${layerParamSignature(shader)}\n${shader.wgsl}`;
}

function visibleLayers(layers: RenderLayer[]): RenderLayer[] {
  const soloActive = layers.some(entry => entry.layer.solo);
  return layers.filter(entry => {
    if (entry.layer.muted) {
      return false;
    }
    return soloActive ? entry.layer.solo : true;
  });
}

export class Compositor {
  readonly layerStates = new Map<string, LayerGpuState>();

  private readonly pipelineCache = new Map<string, PipelineCacheEntry>();
  private readonly sampler: GPUSampler;
  private readonly globalBuffer: GPUBuffer;
  private readonly composeUniformBuffer: GPUBuffer;
  private readonly mixUniformBuffer: GPUBuffer;
  private readonly globalBindGroupLayout: GPUBindGroupLayout;
  private readonly layerBindGroupLayout: GPUBindGroupLayout;
  private readonly composeBindGroupLayout: GPUBindGroupLayout;
  private readonly blitBindGroupLayout: GPUBindGroupLayout;
  private readonly mixBindGroupLayout: GPUBindGroupLayout;
  private readonly composePipeline: GPURenderPipeline;
  private readonly blitPipeline: GPURenderPipeline;
  private readonly thumbnailPipeline: GPURenderPipeline;
  private readonly mixPipeline: GPURenderPipeline;
  private readonly blackoutPipeline: GPURenderPipeline;
  private readonly globalBindGroup: GPUBindGroup;
  private readonly fallbackExternalTexture: GPUTexture;
  private readonly fallbackExternalTextureView: GPUTextureView;

  constructor(private readonly device: GPUDevice, private readonly options: CompositorOptions) {
    this.sampler = device.createSampler({
      label: 'vj-linear-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    this.globalBuffer = device.createBuffer({
      label: 'vj-global-uniforms',
      size: GLOBAL_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.composeUniformBuffer = device.createBuffer({
      label: 'vj-compose-uniforms',
      size: COMPOSE_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.mixUniformBuffer = device.createBuffer({
      label: 'vj-mix-uniforms',
      size: MIX_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.globalBindGroupLayout = device.createBindGroupLayout({
      label: 'vj-global-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', minBindingSize: GLOBAL_UNIFORM_BYTES } },
      ],
    });
    this.layerBindGroupLayout = device.createBindGroupLayout({
      label: 'vj-layer-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
    this.composeBindGroupLayout = device.createBindGroupLayout({
      label: 'vj-compose-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', minBindingSize: COMPOSE_UNIFORM_BYTES } },
      ],
    });
    this.blitBindGroupLayout = device.createBindGroupLayout({
      label: 'vj-blit-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
    this.mixBindGroupLayout = device.createBindGroupLayout({
      label: 'vj-mix-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', minBindingSize: MIX_UNIFORM_BYTES } },
      ],
    });

    this.globalBindGroup = device.createBindGroup({
      label: 'vj-global-bind-group',
      layout: this.globalBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.globalBuffer } }],
    });

    this.composePipeline = this.createFullscreenPipeline('vj-compose-pipeline', COMPOSE_SHADER_WGSL, this.options.texturePool.format, this.composeBindGroupLayout);
    this.blitPipeline = this.createFullscreenPipeline('vj-blit-pipeline', BLIT_SHADER_WGSL, this.options.presentationFormat, this.blitBindGroupLayout);
    this.thumbnailPipeline = this.createFullscreenPipeline('vj-thumbnail-pipeline', BLIT_SHADER_WGSL, this.options.texturePool.thumbnailFormat, this.blitBindGroupLayout);
    this.mixPipeline = this.createFullscreenPipeline('vj-mix-pipeline', MIX_SHADER_WGSL, this.options.texturePool.format, this.mixBindGroupLayout);
    this.blackoutPipeline = this.createFullscreenPipeline('vj-blackout-pipeline', BLACKOUT_SHADER_WGSL, this.options.presentationFormat, null);

    this.fallbackExternalTexture = device.createTexture({
      label: 'vj-external-fallback-black',
      size: { width: 1, height: 1 },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
    });
    device.queue.writeTexture(
      { texture: this.fallbackExternalTexture },
      new Uint8Array([0, 0, 0, 255]),
      { bytesPerRow: 4 },
      { width: 1, height: 1 },
    );
    this.fallbackExternalTextureView = this.fallbackExternalTexture.createView();
  }

  renderFrame(input: CompositorRenderInput): CompositorFrameResult {
    this.writeGlobalUniforms(input.frame, input.width, input.height);
    this.pruneLayerStates([...input.sceneA.layers, ...(input.sceneB?.layers ?? [])]);

    const layerTimings: LayerTiming[] = [];
    const textures = this.options.texturePool.snapshot;
    const externalTextureView = input.webcamTexture?.createView() ?? this.fallbackExternalTextureView;
    const modCtx: ModulatorContext = {
      t: input.frame.time,
      beat: input.frame.beat.beat,
      phase: input.frame.beat.phase,
      bass: input.frame.audio.bass,
      mid: input.frame.audio.mid,
      treble: input.frame.audio.treble,
    };
    const sceneA = this.renderScene(input.sceneA, textures.sceneA, externalTextureView, layerTimings, modCtx);
    const finalScene = input.sceneB
      ? this.renderCrossfade(input.sceneB, sceneA, textures.sceneB, clamp01(input.crossfadeMix ?? 0), externalTextureView, layerTimings, modCtx)
      : sceneA;

    return { finalScene, layerTimings };
  }

  renderFrameToTarget(result: CompositorFrameResult, targetView: GPUTextureView, blackout: boolean): void {
    if (blackout) {
      this.renderBlackout(targetView);
      return;
    }
    this.renderBlit(result.finalScene.view, targetView, this.blitPipeline, this.options.presentationFormat);
  }

  renderThumbnail(encoder: GPUCommandEncoder, source: TextureHandle): TextureHandle {
    const thumbnail = this.options.texturePool.snapshot.thumbnail;
    this.renderBlit(source.view, thumbnail.view, this.thumbnailPipeline, thumbnail.format, encoder);
    return thumbnail;
  }

  destroy(): void {
    this.globalBuffer.destroy();
    this.composeUniformBuffer.destroy();
    this.mixUniformBuffer.destroy();
    this.fallbackExternalTexture.destroy();
    for (const state of this.layerStates.values()) {
      state.paramBuffer.destroy();
    }
    this.layerStates.clear();
  }

  private renderScene(
    input: RenderSceneInput,
    target: TextureHandle,
    externalTextureView: GPUTextureView,
    layerTimings: LayerTiming[],
    modCtx: ModulatorContext,
  ): TextureHandle {
    const textures = this.options.texturePool.snapshot;
    this.clearTexture(textures.compose[0].view);
    this.clearTexture(textures.compose[1].view);

    let readIndex: 0 | 1 = 0;
    const visible = new Set(visibleLayers(input.layers).map(entry => entry.layer.id));

    for (const entry of input.layers) {
      const layerTextures = this.options.texturePool.getLayer(entry.layer.id);
      const layerStartMs = nowMs();
      this.renderLayer(entry, layerTextures, textures.compose[readIndex], externalTextureView, modCtx);
      layerTimings.push({ layerId: entry.layer.id, ms: nowMs() - layerStartMs });
      this.copyTexture(layerTextures.output, layerTextures.feedback);

      if (visible.has(entry.layer.id)) {
        const writeIndex: 0 | 1 = readIndex === 0 ? 1 : 0;
        const opacityModulator = this.options.modulators.get(entry.layer.id, OPACITY_MODULATOR_KEY);
        const opacity = opacityModulator ? clamp01(toScalar(opacityModulator(modCtx))) : entry.layer.opacity;
        this.renderCompose(textures.compose[readIndex], layerTextures.output, textures.compose[writeIndex], opacity, entry.layer.blend);
        readIndex = writeIndex;
      }
    }

    this.renderBlit(textures.compose[readIndex].view, target.view, this.createInternalBlitPipeline(target.format), target.format);
    return target;
  }

  private renderCrossfade(
    input: RenderSceneInput,
    sceneA: TextureHandle,
    sceneB: TextureHandle,
    mix: number,
    externalTextureView: GPUTextureView,
    layerTimings: LayerTiming[],
    modCtx: ModulatorContext,
  ): TextureHandle {
    const renderedB = this.renderScene(input, sceneB, externalTextureView, layerTimings, modCtx);
    this.device.queue.writeBuffer(this.mixUniformBuffer, 0, new Float32Array([mix, 0, 0, 0]));
    const bindGroup = this.device.createBindGroup({
      label: 'vj-mix-bind-group',
      layout: this.mixBindGroupLayout,
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: sceneA.view },
        { binding: 2, resource: renderedB.view },
        { binding: 3, resource: { buffer: this.mixUniformBuffer } },
      ],
    });
    const target = this.options.texturePool.snapshot.compose[0];
    const encoder = this.device.createCommandEncoder({ label: 'vj-crossfade-encoder' });
    const pass = encoder.beginRenderPass({
      label: 'vj-crossfade-pass',
      colorAttachments: [{ view: target.view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(this.mixPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    return target;
  }

  private renderLayer(
    entry: RenderLayer,
    textures: LayerTextureSet,
    currentCompose: TextureHandle,
    externalTextureView: GPUTextureView,
    modCtx: ModulatorContext,
  ): void {
    const compiled = this.getOrCompilePipeline(entry.shader);
    if (!compiled) {
      return;
    }

    const state = this.ensureLayerState(entry.layer.id, compiled.shader, entry.layer.params);
    state.packer.setAll(entry.layer.params);
    if (this.options.modulators.has(entry.layer.id)) {
      for (const paramName of Object.keys(entry.shader.params)) {
        const modulator = this.options.modulators.get(entry.layer.id, paramName);
        if (modulator) {
          state.packer.setParam(paramName, modulator(modCtx));
        }
      }
    }
    if (state.packer.dirty) {
      this.device.queue.writeBuffer(state.paramBuffer, 0, state.packer.buffer);
      state.packer.clearDirty();
    }

    const inputTextureView =
      entry.shader.kind === 'feedback'
        ? textures.feedback.view
        : entry.shader.kind === 'external'
          ? externalTextureView
          : currentCompose.view;
    const bindGroup = this.device.createBindGroup({
      label: `vj-layer-bind-group-${entry.layer.id}`,
      layout: this.layerBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: state.paramBuffer, size: state.packer.layout.minBindingSize } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: inputTextureView },
        { binding: 3, resource: textures.feedback.view },
      ],
    });

    const encoder = this.device.createCommandEncoder({ label: `vj-layer-encoder-${entry.layer.id}` });
    const pass = encoder.beginRenderPass({
      label: `vj-layer-pass-${entry.layer.id}`,
      colorAttachments: [{ view: textures.output.view, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(compiled.pipeline);
    pass.setBindGroup(0, this.globalBindGroup);
    pass.setBindGroup(1, bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  private renderCompose(base: TextureHandle, src: TextureHandle, target: TextureHandle, opacity: number, blend: BlendMode): void {
    const mode = BLEND_MODE_INDEX[blend] ?? 0;
    this.device.queue.writeBuffer(this.composeUniformBuffer, 0, new Float32Array([clamp01(opacity), mode, 0, 0]));
    const bindGroup = this.device.createBindGroup({
      label: 'vj-compose-bind-group',
      layout: this.composeBindGroupLayout,
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: base.view },
        { binding: 2, resource: src.view },
        { binding: 3, resource: { buffer: this.composeUniformBuffer } },
      ],
    });
    const encoder = this.device.createCommandEncoder({ label: 'vj-compose-encoder' });
    const pass = encoder.beginRenderPass({
      label: 'vj-compose-pass',
      colorAttachments: [{ view: target.view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(this.composePipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  private renderBlit(
    sourceView: GPUTextureView,
    targetView: GPUTextureView,
    pipeline: GPURenderPipeline,
    _targetFormat: GPUTextureFormat,
    externalEncoder?: GPUCommandEncoder,
  ): void {
    const bindGroup = this.device.createBindGroup({
      label: 'vj-blit-bind-group',
      layout: this.blitBindGroupLayout,
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: sourceView },
      ],
    });
    const encoder = externalEncoder ?? this.device.createCommandEncoder({ label: 'vj-blit-encoder' });
    const pass = encoder.beginRenderPass({
      label: 'vj-blit-pass',
      colorAttachments: [{ view: targetView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    if (!externalEncoder) {
      this.device.queue.submit([encoder.finish()]);
    }
  }

  private renderBlackout(targetView: GPUTextureView): void {
    const encoder = this.device.createCommandEncoder({ label: 'vj-blackout-encoder' });
    const pass = encoder.beginRenderPass({
      label: 'vj-blackout-pass',
      colorAttachments: [{ view: targetView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(this.blackoutPipeline);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  private clearTexture(view: GPUTextureView): void {
    const encoder = this.device.createCommandEncoder({ label: 'vj-clear-encoder' });
    const pass = encoder.beginRenderPass({
      label: 'vj-clear-pass',
      colorAttachments: [{ view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  private copyTexture(source: TextureHandle, target: TextureHandle): void {
    const encoder = this.device.createCommandEncoder({ label: 'vj-feedback-copy-encoder' });
    encoder.copyTextureToTexture(
      { texture: source.texture },
      { texture: target.texture },
      { width: source.width, height: source.height, depthOrArrayLayers: 1 },
    );
    this.device.queue.submit([encoder.finish()]);
  }

  private writeGlobalUniforms(frame: FrameContext, width: number, height: number): void {
    const data = new Float32Array(GLOBAL_UNIFORM_BYTES / Float32Array.BYTES_PER_ELEMENT);
    data[0] = frame.time;
    data[1] = frame.frame;
    data[2] = frame.audio.bass;
    data[3] = frame.audio.mid;
    data[4] = frame.audio.treble;
    data[5] = frame.beat.bpm;
    data[6] = frame.beat.beat;
    data[7] = frame.beat.phase;
    data[8] = width;
    data[9] = height;
    for (let i = 0; i < 8; i += 1) {
      data[12 + i] = frame.audio.bands[i] ?? 0;
    }
    this.device.queue.writeBuffer(this.globalBuffer, 0, data);
  }

  private pruneLayerStates(layers: RenderLayer[]): void {
    const live = new Set<string>();
    for (const entry of layers) {
      live.add(entry.layer.id);
    }

    for (const [layerId, state] of this.layerStates) {
      if (!live.has(layerId)) {
        state.paramBuffer.destroy();
        this.layerStates.delete(layerId);
      }
    }
  }

  private ensureLayerState(layerId: string, shader: ShaderModuleDef, values: Record<string, number | number[]>): LayerGpuState {
    const paramsSignature = layerParamSignature(shader);
    const existing = this.layerStates.get(layerId);
    if (existing && existing.shaderKey === shader.key && existing.paramsSignature === paramsSignature) {
      return existing;
    }

    existing?.paramBuffer.destroy();
    const packer = new ParamPacker(shader.params, values);
    const paramBuffer = this.device.createBuffer({
      label: `vj-layer-params-${layerId}`,
      size: packer.layout.minBindingSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const next: LayerGpuState = {
      layerId,
      shaderKey: shader.key,
      paramsSignature,
      packer,
      paramBuffer,
    };
    this.layerStates.set(layerId, next);
    return next;
  }

  private getOrCompilePipeline(shader: ShaderModuleDef): CompiledPipeline | null {
    const signature = shaderSignature(shader);
    const existing = this.pipelineCache.get(shader.key);
    if (existing?.signature === signature) {
      return existing.pipeline && existing.activeShader ? { pipeline: existing.pipeline, shader: existing.activeShader } : null;
    }

    const entry: PipelineCacheEntry = {
      signature,
      activeShader: existing?.activeShader ?? null,
      pipeline: existing?.pipeline ?? null,
      compiling: null,
    };
    this.pipelineCache.set(shader.key, entry);

    const built = buildShaderModule(shader);
    const module = this.device.createShaderModule({ label: `vj-shader-${shader.key}`, code: built.wgsl });
    const layout = this.device.createPipelineLayout({
      label: `vj-pipeline-layout-${shader.key}`,
      bindGroupLayouts: [this.globalBindGroupLayout, this.layerBindGroupLayout],
    });
    entry.compiling = this.device
      .createRenderPipelineAsync({
        label: `vj-layer-pipeline-${shader.key}`,
        layout,
        vertex: { module, entryPoint: 'vs_main' },
        fragment: { module, entryPoint: 'fs_main', targets: [{ format: this.options.texturePool.format }] },
        primitive: { topology: 'triangle-list' },
      })
      .then(pipeline => {
        const latest = this.pipelineCache.get(shader.key);
        if (latest?.signature === signature) {
          latest.pipeline = pipeline;
          latest.activeShader = shader;
          latest.compiling = null;
        }
      })
      .catch(error => {
        const latest = this.pipelineCache.get(shader.key);
        if (latest?.signature === signature) {
          latest.compiling = null;
        }
        this.options.onPipelineError?.(shader.key, error);
      });

    return entry.pipeline && entry.activeShader ? { pipeline: entry.pipeline, shader: entry.activeShader } : null;
  }

  private createFullscreenPipeline(
    label: string,
    wgsl: string,
    format: GPUTextureFormat,
    bindGroupLayout: GPUBindGroupLayout | null,
  ): GPURenderPipeline {
    const module = this.device.createShaderModule({ label: `${label}-module`, code: wgsl });
    const layout = bindGroupLayout
      ? this.device.createPipelineLayout({ label: `${label}-layout`, bindGroupLayouts: [bindGroupLayout] })
      : 'auto';
    return this.device.createRenderPipeline({
      label,
      layout,
      vertex: { module, entryPoint: 'vs_main' },
      fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
  }

  private createInternalBlitPipeline(format: GPUTextureFormat): GPURenderPipeline {
    if (format === this.options.presentationFormat) {
      return this.blitPipeline;
    }
    return this.createFullscreenPipeline(`vj-internal-blit-${format}`, BLIT_SHADER_WGSL, format, this.blitBindGroupLayout);
  }
}
