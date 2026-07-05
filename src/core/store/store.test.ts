import { describe, expect, it } from 'vitest';
import { createInitialProject } from './initial';
import { createStore } from './store';

describe('createStore', () => {
  it('dispatches commands and notifies subscribers with resolved shader defaults', () => {
    const initial = createInitialProject();
    const sceneId = initial.scenes[0]?.id;
    expect(sceneId).toBeDefined();

    const store = createStore(initial, {
      resolveShaderDefaults: shaderKey => ({
        name: `Shader ${shaderKey}`,
        params: { speed: 0.25, color: [ 1, 0, 0 ] },
      }),
    });
    const notified: string[] = [];
    store.subscribe((_state, cmd) => {
      if (cmd) notified.push(cmd.type);
    });

    store.dispatch({ type: 'layer/add', sceneId: sceneId!, shaderKey: 'plasma' }, { undoable: true });

    const layer = store.getState().scenes[0]?.layers[0];
    expect(layer).toMatchObject({
      shaderKey: 'plasma',
      name: 'Shader plasma',
      blend: 'NORMAL',
      opacity: 1,
      params: { speed: 0.25, color: [ 1, 0, 0 ] },
    });
    expect(store.getState().selectedLayerId).toBe(layer?.id);
    expect(notified).toEqual([ 'layer/add' ]);
  });

  it('undoes and redoes undoable commands', () => {
    const initial = createInitialProject();
    const sceneId = initial.scenes[0]?.id;
    expect(sceneId).toBeDefined();

    const store = createStore(initial, {
      resolveShaderDefaults: shaderKey => ({ name: shaderKey, params: {} }),
    });

    store.dispatch({ type: 'layer/add', sceneId: sceneId!, shaderKey: 'feedback' }, { undoable: true });
    expect(store.getState().scenes[0]?.layers).toHaveLength(1);
    expect(store.canUndo()).toBe(true);

    store.undo();
    expect(store.getState().scenes[0]?.layers).toHaveLength(0);
    expect(store.canRedo()).toBe(true);

    store.redo();
    expect(store.getState().scenes[0]?.layers).toHaveLength(1);
  });

  it('coalesces matching history entries within 500ms', () => {
    let now = 1_000;
    const initial = createInitialProject();
    const sceneId = initial.scenes[0]?.id;
    expect(sceneId).toBeDefined();

    const store = createStore(initial, {
      now: () => now,
      resolveShaderDefaults: shaderKey => ({ name: shaderKey, params: {} }),
    });

    store.dispatch({ type: 'layer/add', sceneId: sceneId!, shaderKey: 'noise' }, { undoable: true });
    const layerId = store.getState().scenes[0]?.layers[0]?.id;
    expect(layerId).toBeDefined();

    store.dispatch(
      { type: 'layer/setOpacity', sceneId: sceneId!, layerId: layerId!, value: 0.4 },
      { undoable: true, coalesceKey: `opacity:${layerId}` },
    );
    now += 100;
    store.dispatch(
      { type: 'layer/setOpacity', sceneId: sceneId!, layerId: layerId!, value: 0.8 },
      { undoable: true, coalesceKey: `opacity:${layerId}` },
    );

    expect(store.getState().scenes[0]?.layers[0]?.opacity).toBe(0.8);
    store.undo();
    expect(store.getState().scenes[0]?.layers[0]?.opacity).toBe(1);
    store.undo();
    expect(store.getState().scenes[0]?.layers).toHaveLength(0);
  });
});
