/** Render texture allocation and resize handling for the GPU compositor. */
export interface TextureHandle {
  texture: GPUTexture;
  view: GPUTextureView;
  width: number;
  height: number;
  format: GPUTextureFormat;
}

export interface LayerTextureSet {
  output: TextureHandle;
  feedback: TextureHandle;
}

export interface TexturePoolSnapshot {
  width: number;
  height: number;
  compose: readonly [TextureHandle, TextureHandle];
  sceneA: TextureHandle;
  sceneB: TextureHandle;
  thumbnail: TextureHandle;
}

const RENDER_USAGE =
  GPUTextureUsage.RENDER_ATTACHMENT |
  GPUTextureUsage.TEXTURE_BINDING |
  GPUTextureUsage.COPY_SRC |
  GPUTextureUsage.COPY_DST;

export class TexturePool {
  readonly format: GPUTextureFormat;
  readonly thumbnailFormat: GPUTextureFormat = 'rgba8unorm';
  readonly thumbnailWidth = 96;
  readonly thumbnailHeight = 64;

  private widthValue = 1;
  private heightValue = 1;
  private composeValue: [TextureHandle, TextureHandle] | null = null;
  private sceneAValue: TextureHandle | null = null;
  private sceneBValue: TextureHandle | null = null;
  private thumbnailValue: TextureHandle | null = null;
  private readonly layers = new Map<string, LayerTextureSet>();

  constructor(private readonly device: GPUDevice, format: GPUTextureFormat = 'rgba16float') {
    this.format = format;
  }

  get width(): number {
    return this.widthValue;
  }

  get height(): number {
    return this.heightValue;
  }

  get snapshot(): TexturePoolSnapshot {
    if (!this.composeValue || !this.sceneAValue || !this.sceneBValue || !this.thumbnailValue) {
      this.resize(this.widthValue, this.heightValue, []);
    }

    if (!this.composeValue || !this.sceneAValue || !this.sceneBValue || !this.thumbnailValue) {
      throw new Error('TexturePool failed to initialize textures.');
    }

    return {
      width: this.widthValue,
      height: this.heightValue,
      compose: this.composeValue,
      sceneA: this.sceneAValue,
      sceneB: this.sceneBValue,
      thumbnail: this.thumbnailValue,
    };
  }

  resize(width: number, height: number, layerIds: readonly string[]): void {
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));
    const resolutionChanged = nextWidth !== this.widthValue || nextHeight !== this.heightValue || !this.composeValue;

    if (resolutionChanged) {
      this.destroyAll();
      this.widthValue = nextWidth;
      this.heightValue = nextHeight;
      this.composeValue = [
        this.createRenderTexture('compose-a', nextWidth, nextHeight, this.format),
        this.createRenderTexture('compose-b', nextWidth, nextHeight, this.format),
      ];
      this.sceneAValue = this.createRenderTexture('scene-a', nextWidth, nextHeight, this.format);
      this.sceneBValue = this.createRenderTexture('scene-b', nextWidth, nextHeight, this.format);
      this.thumbnailValue = this.createRenderTexture(
        'thumbnail',
        this.thumbnailWidth,
        this.thumbnailHeight,
        this.thumbnailFormat,
      );
    }

    const liveIds = new Set(layerIds);
    for (const id of layerIds) {
      if (!this.layers.has(id)) {
        this.layers.set(id, this.createLayerTextures(id));
      }
    }
    for (const [id, textures] of this.layers) {
      if (!liveIds.has(id)) {
        textures.output.texture.destroy();
        textures.feedback.texture.destroy();
        this.layers.delete(id);
      }
    }
  }

  getLayer(id: string): LayerTextureSet {
    const textures = this.layers.get(id);
    if (!textures) {
      const next = this.createLayerTextures(id);
      this.layers.set(id, next);
      return next;
    }
    return textures;
  }

  destroy(): void {
    this.destroyAll();
    this.layers.clear();
  }

  private createLayerTextures(layerId: string): LayerTextureSet {
    return {
      output: this.createRenderTexture(`layer-${layerId}-output`, this.widthValue, this.heightValue, this.format),
      feedback: this.createRenderTexture(`layer-${layerId}-feedback`, this.widthValue, this.heightValue, this.format),
    };
  }

  private createRenderTexture(label: string, width: number, height: number, format: GPUTextureFormat): TextureHandle {
    const texture = this.device.createTexture({
      label,
      size: { width, height },
      format,
      usage: RENDER_USAGE,
    });
    return {
      texture,
      view: texture.createView(),
      width,
      height,
      format,
    };
  }

  private destroyAll(): void {
    if (this.composeValue) {
      this.composeValue[0].texture.destroy();
      this.composeValue[1].texture.destroy();
      this.composeValue = null;
    }
    this.sceneAValue?.texture.destroy();
    this.sceneBValue?.texture.destroy();
    this.thumbnailValue?.texture.destroy();
    this.sceneAValue = null;
    this.sceneBValue = null;
    this.thumbnailValue = null;

    for (const textures of this.layers.values()) {
      textures.output.texture.destroy();
      textures.feedback.texture.destroy();
    }
    this.layers.clear();
  }
}
