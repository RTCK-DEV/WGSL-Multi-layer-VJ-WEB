/** RendererFacade implementation tying store state, WebGPU context, and compositor loop together. */
import type {
  EngineStats,
  FrameContext,
  LiveModulatorRegistry,
  ProjectState,
  RendererFacade,
  Scene,
  ShaderDiagnostic,
  ShaderModuleDef,
  ShaderParamDef,
  Store,
} from '../core/types.js';
import { createLiveModulatorRegistry } from '../core/live-modulators.js';
import { Compositor, type RenderSceneInput } from './compositor.js';
import { GpuContextManager } from './context.js';
import { validateShader as validateShaderBody } from './diagnostics.js';
import { TexturePool, type TextureHandle } from './textures.js';

export interface RendererOptions {
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  store: Store;
  shaders?: ReadonlyMap<string, ShaderModuleDef>;
  getFrameContext: () => FrameContext;
  getShaderModule?: (shaderKey: string, state: ProjectState) => ShaderModuleDef | undefined;
  getWebcamTexture?: (device: GPUDevice) => GPUTexture | null;
  /** ライブコーディングDSLの継続値モジュレータ。省略時は内部で新規作成する。 */
  modulators?: LiveModulatorRegistry;
  onError?: (error: unknown) => void;
  thumbnailIntervalMs?: number;
}

const DEFAULT_STATS: EngineStats = {
  fps: 0,
  cpuFrameMs: 0,
  layerCount: 0,
  layerTimings: [],
  gpuTimingAvailable: false,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function roundUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

export class Renderer implements RendererFacade {
  private state: ProjectState;
  private readonly contextManager: GpuContextManager;
  private readonly thumbnails = new Map<string, ImageBitmap>();
  private readonly thumbnailIntervalMs: number;
  private unsubscribe: (() => void) | null = null;
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private canvasContext: GPUCanvasContext | null = null;
  private outputCanvas: OffscreenCanvas | null = null;
  private outputCanvasContext: GPUCanvasContext | null = null;
  private texturePool: TexturePool | null = null;
  private compositor: Compositor | null = null;
  private presentationFormat: GPUTextureFormat = 'bgra8unorm';
  private rafId: number | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private stats: EngineStats = { ...DEFAULT_STATS };
  private lastFrameMs = 0;
  private lastThumbnailMs = 0;
  private thumbnailCursor = 0;
  private thumbnailInFlight = false;
  private initPromise: Promise<void> | null = null;
  private running = false;
  private readonly modulators: LiveModulatorRegistry;

  constructor(private readonly options: RendererOptions) {
    this.state = options.store.getState();
    this.canvas = options.canvas ?? null;
    this.thumbnailIntervalMs = options.thumbnailIntervalMs ?? 100;
    this.modulators = options.modulators ?? createLiveModulatorRegistry();
    this.contextManager = new GpuContextManager({
      onDeviceRestored: ({ device }) => {
        this.rebuildGpuObjects(device);
      },
      onError: error => this.reportError(error),
    });

    this.unsubscribe = options.store.subscribe(state => {
      this.state = state;
    });
  }

  init(): Promise<void> {
    this.initPromise ??= this.initialize();
    return this.initPromise;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    void this.init();
    this.scheduleNextFrame();
  }

  async validateShader(wgslBody: string, params?: Record<string, ShaderParamDef>): Promise<ShaderDiagnostic[]> {
    const { device } = await this.contextManager.initialize();
    return validateShaderBody(device, wgslBody, params);
  }

  getThumbnail(layerId: string): ImageBitmap | undefined {
    return this.thumbnails.get(layerId);
  }

  getStats(): EngineStats {
    return this.stats;
  }

  setOutputCanvas(canvas: OffscreenCanvas | null): void {
    this.outputCanvas = canvas;
    this.outputCanvasContext = null;
    if (canvas && this.contextManager.device) {
      this.outputCanvasContext = this.configureCanvas(canvas, this.contextManager.device);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.running = false;
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
    }
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.compositor?.destroy();
    this.texturePool?.destroy();
    this.contextManager.destroy();
    this.outputCanvas = null;
    this.outputCanvasContext = null;
    for (const bitmap of this.thumbnails.values()) {
      bitmap.close();
    }
    this.thumbnails.clear();
  }

  private async initialize(): Promise<void> {
    try {
      const { device } = await this.contextManager.initialize();
      this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
      this.rebuildGpuObjects(device);
    } catch (error) {
      this.reportError(error);
    }
  }

  private rebuildGpuObjects(device: GPUDevice): void {
    this.compositor?.destroy();
    this.texturePool?.destroy();
    this.texturePool = new TexturePool(device);
    this.compositor = new Compositor(device, {
      presentationFormat: this.presentationFormat,
      texturePool: this.texturePool,
      modulators: this.modulators,
      onPipelineError: (_shaderKey, error) => this.reportError(error),
    });
    this.stats = { ...this.stats, gpuTimingAvailable: device.features.has('timestamp-query') };
    if (this.canvas) {
      this.canvasContext = this.configureCanvas(this.canvas, device);
    }
    if (this.outputCanvas) {
      this.outputCanvasContext = this.configureCanvas(this.outputCanvas, device);
    }
  }

  private configureCanvas(canvas: HTMLCanvasElement | OffscreenCanvas, device: GPUDevice): GPUCanvasContext {
    const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (!context) {
      throw new Error('Failed to acquire WebGPU canvas context.');
    }
    context.configure({
      device,
      format: this.presentationFormat,
      alphaMode: 'opaque',
    });
    return context;
  }

  private scheduleNextFrame(): void {
    if (this.destroyed) {
      return;
    }

    if (typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame(() => {
        this.renderLoop();
      });
      return;
    }

    this.timeoutId = setTimeout(() => {
      this.renderLoop();
    }, 16);
  }

  private renderLoop(): void {
    const start = nowMs();
    try {
      this.renderOnce(start);
    } catch (error) {
      this.reportError(error);
    } finally {
      this.scheduleNextFrame();
    }
  }

  private renderOnce(startMs: number): void {
    const device = this.contextManager.device;
    if (!device || !this.texturePool || !this.compositor) {
      return;
    }

    const hasPreviewTarget = Boolean(this.canvas && this.canvasContext);
    const hasOutputTarget = Boolean(this.outputCanvas && this.outputCanvasContext);
    if (!hasPreviewTarget && !hasOutputTarget) {
      return;
    }

    const width = Math.max(1, Math.floor(this.state.output.width * this.state.output.dpr));
    const height = Math.max(1, Math.floor(this.state.output.height * this.state.output.dpr));
    if (this.canvas && this.canvas.width !== width) {
      this.canvas.width = width;
    }
    if (this.canvas && this.canvas.height !== height) {
      this.canvas.height = height;
    }
    if (this.outputCanvas && this.outputCanvas.width !== width) {
      this.outputCanvas.width = width;
    }
    if (this.outputCanvas && this.outputCanvas.height !== height) {
      this.outputCanvas.height = height;
    }

    const activeScene = this.state.scenes[this.state.activeSceneIndex];
    if (!activeScene) {
      return;
    }

    const targetScene = this.state.crossfade.active ? this.state.scenes[this.state.crossfade.toSceneIndex] : undefined;
    const layerIds = [
      ...activeScene.layers.map(layer => layer.id),
      ...(targetScene?.layers.map(layer => layer.id) ?? []),
    ];
    this.texturePool.resize(width, height, layerIds);

    const frame = this.options.getFrameContext();
    const renderSceneA = this.buildRenderScene(activeScene);
    const renderSceneB = targetScene ? this.buildRenderScene(targetScene) : undefined;
    const crossfadeMix = this.computeCrossfadeMix(frame);

    const frameResult = this.compositor.renderFrame({
      frame,
      width,
      height,
      sceneA: renderSceneA,
      sceneB: renderSceneB,
      crossfadeMix,
      blackout: this.state.blackout,
      webcamTexture: this.options.getWebcamTexture?.(device) ?? null,
    });
    if (this.canvasContext) {
      this.compositor.renderFrameToTarget(
        frameResult,
        this.canvasContext.getCurrentTexture().createView(),
        this.state.blackout,
      );
    }
    if (this.outputCanvasContext) {
      this.compositor.renderFrameToTarget(
        frameResult,
        this.outputCanvasContext.getCurrentTexture().createView(),
        this.state.blackout,
      );
    }

    if (this.state.crossfade.active && crossfadeMix >= 1) {
      this.options.store.dispatch({ type: 'scene/crossfadeDone' }, { undoable: false });
    }

    this.maybeUpdateThumbnail(device, startMs, activeScene);
    this.updateStats(startMs, activeScene.layers.length, frameResult.layerTimings);
  }

  private readonly unknownShaderKeys = new Set<string>();

  private buildRenderScene(scene: Scene): RenderSceneInput {
    const layers = scene.layers.flatMap(layer => {
      const shader = this.resolveShader(layer.shaderKey);
      if (!shader) {
        if (!this.unknownShaderKeys.has(layer.shaderKey)) {
          this.unknownShaderKeys.add(layer.shaderKey);
          this.reportError(new Error(`Shader "${layer.shaderKey}" is not registered.`));
        }
        return [];
      }
      return [{ layer, shader }];
    });

    return { scene, layers };
  }

  private resolveShader(shaderKey: string): ShaderModuleDef | undefined {
    const provided = this.options.getShaderModule?.(shaderKey, this.state);
    if (provided) {
      return provided;
    }

    const fromMap = this.options.shaders?.get(shaderKey);
    if (fromMap) {
      return fromMap;
    }

    const custom = this.state.customShaders[shaderKey];
    if (!custom) {
      return undefined;
    }

    return {
      key: shaderKey,
      name: custom.name,
      category: 'CUSTOM',
      kind: 'generator',
      wgsl: custom.wgsl,
      params: custom.params,
    };
  }

  private computeCrossfadeMix(frame: FrameContext): number {
    const crossfade = this.state.crossfade;
    if (!crossfade.active) {
      return 0;
    }
    if (crossfade.durationBeats <= 0) {
      return 1;
    }
    return clamp01((frame.beat.beat - crossfade.startBeat) / crossfade.durationBeats);
  }

  private maybeUpdateThumbnail(device: GPUDevice, frameStartMs: number, scene: Scene): void {
    if (
      this.thumbnailInFlight ||
      frameStartMs - this.lastThumbnailMs < this.thumbnailIntervalMs ||
      typeof ImageData === 'undefined' ||
      typeof createImageBitmap === 'undefined' ||
      !this.texturePool ||
      !this.compositor ||
      scene.layers.length === 0
    ) {
      return;
    }

    const batch: { layerId: string; source: TextureHandle }[] = [];
    const batchSize = Math.min(3, scene.layers.length);
    for (let i = 0; i < batchSize; i += 1) {
      const layer = scene.layers[this.thumbnailCursor % scene.layers.length];
      this.thumbnailCursor += 1;
      if (!layer) {
        continue;
      }
      batch.push({ layerId: layer.id, source: this.texturePool.getLayer(layer.id).output });
    }
    if (batch.length === 0) {
      return;
    }

    this.lastThumbnailMs = frameStartMs;
    this.thumbnailInFlight = true;
    void this.readThumbnailBatch(device, batch)
      .catch(error => this.reportError(error))
      .finally(() => {
        this.thumbnailInFlight = false;
      });
  }

  private async readThumbnailBatch(
    device: GPUDevice,
    batch: readonly { layerId: string; source: TextureHandle }[],
  ): Promise<void> {
    for (const item of batch) {
      await this.readThumbnail(device, item.layerId, item.source);
    }
  }

  private async readThumbnail(device: GPUDevice, layerId: string, source: TextureHandle): Promise<void> {
    if (!this.compositor || !this.texturePool) {
      return;
    }

    const thumbnail = this.texturePool.snapshot.thumbnail;
    const bytesPerPixel = 4;
    const unpaddedBytesPerRow = thumbnail.width * bytesPerPixel;
    const bytesPerRow = roundUp(unpaddedBytesPerRow, 256);
    const bufferSize = bytesPerRow * thumbnail.height;
    const readBuffer = device.createBuffer({
      label: `vj-thumbnail-readback-${layerId}`,
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const encoder = device.createCommandEncoder({ label: `vj-thumbnail-encoder-${layerId}` });
    this.compositor.renderThumbnail(encoder, source);
    encoder.copyTextureToBuffer(
      { texture: thumbnail.texture },
      { buffer: readBuffer, bytesPerRow, rowsPerImage: thumbnail.height },
      { width: thumbnail.width, height: thumbnail.height, depthOrArrayLayers: 1 },
    );
    device.queue.submit([encoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(readBuffer.getMappedRange());
    const pixels = new Uint8ClampedArray(unpaddedBytesPerRow * thumbnail.height);
    for (let row = 0; row < thumbnail.height; row += 1) {
      const srcOffset = row * bytesPerRow;
      const dstOffset = row * unpaddedBytesPerRow;
      pixels.set(mapped.subarray(srcOffset, srcOffset + unpaddedBytesPerRow), dstOffset);
    }
    readBuffer.unmap();
    readBuffer.destroy();

    const imageData = new ImageData(pixels, thumbnail.width, thumbnail.height);
    const bitmap = await createImageBitmap(imageData);
    this.thumbnails.get(layerId)?.close();
    this.thumbnails.set(layerId, bitmap);
  }

  private updateStats(frameStartMs: number, layerCount: number, layerTimings: EngineStats['layerTimings']): void {
    const end = nowMs();
    const cpuFrameMs = end - frameStartMs;
    const delta = this.lastFrameMs > 0 ? frameStartMs - this.lastFrameMs : 0;
    const instantFps = delta > 0 ? 1000 / delta : this.stats.fps;
    this.lastFrameMs = frameStartMs;
    this.stats = {
      layerTimings,
      gpuTimingAvailable: this.stats.gpuTimingAvailable,
      fps: this.stats.fps === 0 ? instantFps : this.stats.fps * 0.9 + instantFps * 0.1,
      cpuFrameMs,
      layerCount,
    };
  }

  private reportError(error: unknown): void {
    this.options.onError?.(error);
  }
}
