import { describe, expect, it } from 'vitest';
import { createLiveModulatorRegistry } from './live-modulators';

describe('createLiveModulatorRegistry', () => {
  it('stores and retrieves a modulator by layer/param', () => {
    const registry = createLiveModulatorRegistry();
    const fn = (ctx: { t: number }) => ctx.t;
    registry.set('layer-1', 'zoom', fn);

    expect(registry.get('layer-1', 'zoom')).toBe(fn);
    expect(registry.has('layer-1')).toBe(true);
    expect(registry.get('layer-1', 'other')).toBeUndefined();
    expect(registry.get('layer-2', 'zoom')).toBeUndefined();
  });

  it('clears a single param without affecting siblings', () => {
    const registry = createLiveModulatorRegistry();
    registry.set('layer-1', 'zoom', () => 1);
    registry.set('layer-1', 'flow', () => 2);

    registry.clear('layer-1', 'zoom');

    expect(registry.get('layer-1', 'zoom')).toBeUndefined();
    expect(registry.get('layer-1', 'flow')).toBeDefined();
    expect(registry.has('layer-1')).toBe(true);
  });

  it('removes the layer entry once its last param is cleared', () => {
    const registry = createLiveModulatorRegistry();
    registry.set('layer-1', 'zoom', () => 1);

    registry.clear('layer-1', 'zoom');

    expect(registry.has('layer-1')).toBe(false);
  });

  it('clearLayer and clearAll wipe modulators', () => {
    const registry = createLiveModulatorRegistry();
    registry.set('layer-1', 'zoom', () => 1);
    registry.set('layer-2', 'flow', () => 2);

    registry.clearLayer('layer-1');
    expect(registry.has('layer-1')).toBe(false);
    expect(registry.has('layer-2')).toBe(true);

    registry.clearAll();
    expect(registry.has('layer-2')).toBe(false);
  });
});
