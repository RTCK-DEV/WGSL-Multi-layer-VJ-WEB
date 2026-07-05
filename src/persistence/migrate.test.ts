import { describe, expect, it } from 'vitest';
import { importLegacy, migrate } from './migrate';

describe('migrate', () => {
  it('fills missing v1 fields from the initial project shape', () => {
    const state = migrate({
      version: 1,
      name: 'Partial',
      scenes: [ { name: 'Only Scene' } ],
    });

    expect(state.version).toBe(1);
    expect(state.name).toBe('Partial');
    expect(state.scenes).toHaveLength(1);
    expect(state.scenes[0]?.name).toBe('Only Scene');
    expect(state.scenes[0]?.layers).toEqual([]);
    expect(state.bpm).toBe(120);
    expect(state.output).toEqual({ width: 1920, height: 1080, dpr: 1 });
    expect(state.midi.bindings).toEqual([]);
  });
});

describe('importLegacy', () => {
  it('converts legacy scenes, blend indexes, uniforms, and shader keys', () => {
    const state = importLegacy({
      name: 'Legacy Project',
      bpm: 128,
      width: 1280,
      height: 720,
      dpr: 2,
      scenes: [
        {
          name: 'Legacy Scene',
          layers: [
            {
              key: 'old-plasma',
              blend: 1,
              opacity: 0.5,
              muted: true,
              uniformsDef: {
                u_speed: { value: 0.75 },
                u_color: { value: [ 1, 0.5, 0 ] },
                ignored: { value: 123 },
              },
            },
          ],
        },
      ],
    });

    expect(state).not.toBeNull();
    expect(state?.name).toBe('Legacy Project');
    expect(state?.bpm).toBe(128);
    expect(state?.output).toEqual({ width: 1280, height: 720, dpr: 2 });
    expect(state?.scenes[0]?.name).toBe('Legacy Scene');
    expect(state?.scenes[0]?.layers[0]).toMatchObject({
      shaderKey: 'old-plasma',
      name: 'old-plasma',
      blend: 'ADD',
      opacity: 0.5,
      muted: true,
      solo: false,
      params: {
        speed: 0.75,
        color: [ 1, 0.5, 0 ],
      },
    });
  });
});
