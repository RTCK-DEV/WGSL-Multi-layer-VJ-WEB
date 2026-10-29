export class WebcamSource {
  private videoEl: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private texture: GPUTexture | null = null;
  private textureWidth = 0;
  private textureHeight = 0;
  private disconnectHandlers: Array<() => void> = [];

  /** カメラが切断/権限失効/エラーで使えなくなった時に一度だけ呼ばれる。 */
  onDisconnected(fn: () => void): void {
    this.disconnectHandlers.push(fn);
  }

  private handleDisconnect(): void {
    if (!this.stream) return; // 既にstop済みなら二重発火しない
    this.stop();
    for (const fn of this.disconnectHandlers) fn();
  }

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

    for (const track of stream.getTracks()) {
      track.addEventListener('ended', () => this.handleDisconnect());
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

    try {
      device.queue.copyExternalImageToTexture(
        { source: video },
        { texture: this.texture },
        { width, height },
      );
    } catch {
      // トラックが裏で終了しているのに 'ended' がまだ届いていない場合に起こり得る。
      // 毎フレームここで例外を吐き続けるのを防ぎ、切断として扱う。
      this.handleDisconnect();
      return null;
    }
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
