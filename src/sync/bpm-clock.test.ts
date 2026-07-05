import { describe, expect, it } from 'vitest';
import { createBpmClock } from './bpm-clock';

describe('createBpmClock', () => {
  it('computes tap tempo from the median interval and resets origin', () => {
    let now = 0;
    const clock = createBpmClock({ initialBpm: 120, now: () => now });

    clock.tap();
    now = 500;
    clock.tap();
    now = 1000;
    clock.tap();
    now = 1750;
    clock.tap();

    const frame = clock.getFrame();
    expect(frame.bpm).toBeCloseTo(120, 5);
    expect(frame.beat).toBeCloseTo(0, 5);
    expect(frame.phase).toBeCloseTo(0, 5);
  });

  it('estimates BPM from 24PPQN MIDI clock pulses', () => {
    const clock = createBpmClock({ initialBpm: 120, now: () => 0 });

    for (let pulse = 1; pulse <= 25; pulse += 1) {
      clock.clockPulse(pulse * 25);
    }

    expect(clock.getFrame().bpm).toBeCloseTo(100, 5);
  });

  it('keeps the current beat when BPM changes', () => {
    let now = 0;
    const clock = createBpmClock({ initialBpm: 120, now: () => now });
    now = 1000;
    expect(clock.getFrame().beat).toBeCloseTo(2, 5);

    clock.setBpm(60);
    expect(clock.getFrame().beat).toBeCloseTo(2, 5);

    now = 2000;
    expect(clock.getFrame().beat).toBeCloseTo(3, 5);
  });
});
