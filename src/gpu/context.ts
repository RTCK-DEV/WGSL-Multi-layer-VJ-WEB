/** WebGPU device acquisition, support checks, and device-lost recovery. */
export class WebGpuUnavailableError extends Error {
  constructor(message = 'WebGPU is not available in this browser.') {
    super(message);
    this.name = 'WebGpuUnavailableError';
  }
}

export interface GpuContextResources {
  adapter: GPUAdapter;
  device: GPUDevice;
}

export interface GpuContextOptions {
  powerPreference?: GPUPowerPreference;
  requiredFeatures?: GPUFeatureName[];
  requiredLimits?: Record<string, GPUSize64>;
  onDeviceLost?: (info: GPUDeviceLostInfo) => void;
  onDeviceRestored?: (resources: GpuContextResources) => void;
  onError?: (error: unknown) => void;
}

export function isWebGpuSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu !== undefined;
}

export class GpuContextManager {
  private resourcesValue: GpuContextResources | null = null;
  private destroyed = false;
  private initializing: Promise<GpuContextResources> | null = null;

  constructor(private readonly options: GpuContextOptions = {}) {}

  get resources(): GpuContextResources | null {
    return this.resourcesValue;
  }

  get device(): GPUDevice | null {
    return this.resourcesValue?.device ?? null;
  }

  async initialize(): Promise<GpuContextResources> {
    if (this.initializing) {
      return this.initializing;
    }

    this.initializing = this.createResources();
    try {
      const resources = await this.initializing;
      this.resourcesValue = resources;
      this.watchDeviceLost(resources.device);
      return resources;
    } finally {
      this.initializing = null;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.resourcesValue?.device.destroy();
    this.resourcesValue = null;
  }

  private async createResources(): Promise<GpuContextResources> {
    if (!isWebGpuSupported()) {
      throw new WebGpuUnavailableError();
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: this.options.powerPreference ?? 'high-performance',
    });
    if (!adapter) {
      throw new WebGpuUnavailableError('WebGPU adapter request returned null.');
    }

    const device = await adapter.requestDevice({
      requiredFeatures: this.options.requiredFeatures ?? [],
      requiredLimits: this.options.requiredLimits ?? {},
    });

    return { adapter, device };
  }

  private watchDeviceLost(device: GPUDevice): void {
    void device.lost.then(info => {
      this.options.onDeviceLost?.(info);
      if (this.destroyed || info.reason === 'destroyed') {
        return;
      }

      void this.initialize()
        .then(resources => {
          this.options.onDeviceRestored?.(resources);
        })
        .catch(error => {
          this.options.onError?.(error);
        });
    });
  }
}
