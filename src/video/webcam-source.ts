export class WebcamSource {
  private videoEl: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private texture: GPUTexture | null = null;
  private textureWidth = 0;
  private textureHeight = 0;

  async start(): Promise<void> {
    if (this.stream) {
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.style.display = 'none';
    video.srcObject = stream;
    document.body.append(video);

    try {
      await video.play();
    } catch (error) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      video.remove();
      throw error;
    }

    this.stream = stream;
    this.videoEl = video;
  }

  updateTexture(device: GPUDevice): GPUTexture | null {
    const video = this.videoEl;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return this.texture;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width <= 0 || height <= 0) {
      return this.texture;
    }

    if (!this.texture || this.textureWidth !== width || this.textureHeight !== height) {
      this.texture?.destroy();
      this.texture = device.createTexture({
        label: 'vj-webcam-source',
        size: { width, height },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
      });
      this.textureWidth = width;
      this.textureHeight = height;
    }

    device.queue.copyExternalImageToTexture(
      { source: video },
      { texture: this.texture },
      { width, height },
    );
    return this.texture;
  }

  getTexture(): GPUTexture | null {
    return this.texture;
  }

  stop(): void {
    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }
    this.videoEl?.remove();
    this.texture?.destroy();
    this.videoEl = null;
    this.stream = null;
    this.texture = null;
    this.textureWidth = 0;
    this.textureHeight = 0;
  }
}
