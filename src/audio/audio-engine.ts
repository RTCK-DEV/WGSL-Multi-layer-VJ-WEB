import type { AudioEngine, AudioFrame } from '../core/types';

const FFT_SIZE = 512;
const SMOOTHING_TIME_CONSTANT = 0.8;
const BAND_RANGES: readonly (readonly [number, number])[] = [
  [0, 3],
  [3, 12],
  [12, 24],
  [24, 48],
  [48, 96],
  [96, 144],
  [144, 192],
  [192, 256],
];

export class BrowserAudioEngine implements AudioEngine {
  readonly #bands = new Float32Array(8);
  readonly #frame: AudioFrame = { bands: this.#bands, bass: 0, mid: 0, treble: 0 };

  #audioContext: AudioContext | null = null;
  #analyser: AnalyserNode | null = null;
  #data = new Uint8Array(FFT_SIZE / 2);
  #source: MediaStreamAudioSourceNode | null = null;
  #stream: MediaStream | null = null;
  #sourceKind: 'none' | 'mic' | 'system' = 'none';

  get active(): boolean {
    return this.#analyser !== null && this.#stream !== null;
  }

  get sourceKind(): 'none' | 'mic' | 'system' {
    return this.#sourceKind;
  }

  async initMic(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await this.#initStream(stream, 'mic');
  }

  async initSystem(): Promise<void> {
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
    for (const track of stream.getVideoTracks()) {
      track.stop();
    }
    await this.#initStream(stream, 'system');
  }

  stop(): void {
    this.#source?.disconnect();
    this.#source = null;
    this.#analyser = null;

    if (this.#stream) {
      for (const track of this.#stream.getTracks()) {
        track.stop();
      }
    }
    this.#stream = null;
    this.#sourceKind = 'none';
    this.#bands.fill(0);
    this.#frame.bass = 0;
    this.#frame.mid = 0;
    this.#frame.treble = 0;
  }

  getFrame(): AudioFrame {
    if (!this.#analyser) {
      return this.#frame;
    }

    this.#analyser.getByteFrequencyData(this.#data);

    for (let bandIndex = 0; bandIndex < BAND_RANGES.length; bandIndex += 1) {
      const range = BAND_RANGES[bandIndex];
      if (!range) continue;

      const [start, end] = range;
      let sum = 0;
      for (let bin = start; bin < end; bin += 1) {
        sum += this.#data[bin] ?? 0;
      }
      this.#bands[bandIndex] = Math.min(1, Math.max(0, sum / (end - start) / 255));
    }

    this.#frame.bass = ((this.#bands[0] ?? 0) + (this.#bands[1] ?? 0)) * 0.5;
    this.#frame.mid = ((this.#bands[2] ?? 0) + (this.#bands[3] ?? 0) + (this.#bands[4] ?? 0)) / 3;
    this.#frame.treble = ((this.#bands[5] ?? 0) + (this.#bands[6] ?? 0) + (this.#bands[7] ?? 0)) / 3;
    return this.#frame;
  }

  async #initStream(stream: MediaStream, sourceKind: 'mic' | 'system'): Promise<void> {
    this.stop();

    try {
      const AudioContextCtor = window.AudioContext;
      this.#audioContext ??= new AudioContextCtor();
      if (this.#audioContext.state === 'suspended') {
        await this.#audioContext.resume();
      }

      const source = this.#audioContext.createMediaStreamSource(stream);
      const analyser = this.#audioContext.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
      source.connect(analyser);

      this.#stream = stream;
      this.#source = source;
      this.#analyser = analyser;
      this.#sourceKind = sourceKind;
      if (this.#data.length !== analyser.frequencyBinCount) {
        this.#data = new Uint8Array(analyser.frequencyBinCount);
      }
    } catch (error) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      throw new Error(`Failed to initialize ${sourceKind} audio source`, { cause: error });
    }
  }
}

export function createAudioEngine(): AudioEngine {
  return new BrowserAudioEngine();
}

export { BrowserAudioEngine as AudioEngineImpl };
