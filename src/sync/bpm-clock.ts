import type { BeatFrame, BpmClock } from '../core/types';

const DEFAULT_BPM = 120;
const MIN_BPM = 40;
const MAX_BPM = 300;
const TAP_RESET_MS = 2000;
const MAX_TAPS = 8;
const CLOCK_PPQN = 24;
const MAX_CLOCK_INTERVALS = 48;
const CLOCK_BPM_UPDATE_THRESHOLD = 0.5;

export interface BpmClockOptions {
  initialBpm?: number;
  now?: () => number;
}

export class PerformanceBpmClock implements BpmClock {
  readonly #now: () => number;
  readonly #frame: BeatFrame;
  readonly #tapTimes: number[] = [];
  readonly #clockIntervals: number[] = [];

  #bpm: number;
  #originMs: number;
  #running = true;
  #pausedBeat = 0;
  #lastClockPulseMs = 0;

  constructor(options: BpmClockOptions = {}) {
    this.#now = options.now ?? (() => performance.now());
    this.#bpm = clampBpm(options.initialBpm ?? DEFAULT_BPM);
    this.#originMs = this.#now();
    this.#frame = { bpm: this.#bpm, beat: 0, phase: 0 };
  }

  tap(): void {
    const now = this.#now();
    const lastTap = this.#tapTimes.at(-1);
    if (lastTap !== undefined && now - lastTap > TAP_RESET_MS) {
      this.#tapTimes.length = 0;
    }

    this.#tapTimes.push(now);
    while (this.#tapTimes.length > MAX_TAPS) {
      this.#tapTimes.shift();
    }

    if (this.#tapTimes.length < 2) {
      this.#resetOrigin(now);
      return;
    }

    const intervals: number[] = [];
    for (let index = 1; index < this.#tapTimes.length; index += 1) {
      const prev = this.#tapTimes[index - 1];
      const current = this.#tapTimes[index];
      if (prev === undefined || current === undefined) continue;
      const interval = current - prev;
      if (interval > 0 && interval <= TAP_RESET_MS) {
        intervals.push(interval);
      }
    }

    const medianInterval = median(intervals);
    if (medianInterval === null) {
      this.#resetOrigin(now);
      return;
    }

    this.#bpm = clampBpm(60000 / medianInterval);
    this.#resetOrigin(now);
  }

  setBpm(bpm: number): void {
    this.#setBpmKeepingBeat(clampBpm(bpm), this.#now());
    this.#tapTimes.length = 0;
  }

  clockPulse(nowMs: number): void {
    if (this.#lastClockPulseMs > 0) {
      const interval = nowMs - this.#lastClockPulseMs;
      if (interval > 0 && interval < 200) {
        this.#clockIntervals.push(interval);
        while (this.#clockIntervals.length > MAX_CLOCK_INTERVALS) {
          this.#clockIntervals.shift();
        }
      }
    }
    this.#lastClockPulseMs = nowMs;

    if (this.#clockIntervals.length < CLOCK_PPQN) {
      return;
    }

    let total = 0;
    for (const interval of this.#clockIntervals) {
      total += interval;
    }
    const averagePulseMs = total / this.#clockIntervals.length;
    const estimatedBpm = clampBpm(60000 / (averagePulseMs * CLOCK_PPQN));
    if (Math.abs(estimatedBpm - this.#bpm) >= CLOCK_BPM_UPDATE_THRESHOLD) {
      this.#setBpmKeepingBeat(estimatedBpm, nowMs);
    }
  }

  transportStart(): void {
    const now = this.#now();
    this.#running = true;
    this.#pausedBeat = 0;
    this.#lastClockPulseMs = 0;
    this.#clockIntervals.length = 0;
    this.#resetOrigin(now);
  }

  transportStop(): void {
    const now = this.#now();
    this.#pausedBeat = this.#beatAt(now);
    this.#running = false;
    this.#lastClockPulseMs = 0;
    this.#clockIntervals.length = 0;
  }

  getFrame(): BeatFrame {
    const beat = this.#beatAt(this.#now());
    this.#frame.bpm = this.#bpm;
    this.#frame.beat = beat;
    this.#frame.phase = beat - Math.floor(beat);
    return this.#frame;
  }

  #beatAt(nowMs: number): number {
    if (!this.#running) {
      return this.#pausedBeat;
    }
    return Math.max(0, ((nowMs - this.#originMs) / 60000) * this.#bpm);
  }

  #setBpmKeepingBeat(nextBpm: number, nowMs: number): void {
    const currentBeat = this.#beatAt(nowMs);
    this.#bpm = nextBpm;
    if (this.#running) {
      this.#originMs = nowMs - (currentBeat / this.#bpm) * 60000;
    } else {
      this.#pausedBeat = currentBeat;
      this.#originMs = nowMs - (currentBeat / this.#bpm) * 60000;
    }
  }

  #resetOrigin(nowMs: number): void {
    this.#originMs = nowMs;
    this.#pausedBeat = 0;
  }
}

export function createBpmClock(options?: BpmClockOptions): BpmClock {
  return new PerformanceBpmClock(options);
}

export { PerformanceBpmClock as BpmClockImpl };

function clampBpm(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, value));
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) return null;
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[middle - 1];
  return lower === undefined ? upper : (lower + upper) / 2;
}
