<script lang="ts">
  /** MIDI設定モーダル: Mappings / Devices / Clock & Sync / Global Actions の4タブ */
  import type { ControlAction, MidiBehavior, MidiBinding, MidiSource } from '../../core/types';
  import { project, dispatch, getStore } from '../store-bridge.svelte';
  import { midiState } from '../midi-state.svelte';
  import { getMidiSystem } from '../midi-ref';
  import { findShader, shaderCatalog } from '../catalog.svelte';
  import { toast } from '../toast.svelte';
  import { newId } from '../../core/store/ids';
  import { runPanic } from '../../midi';

  let { onclose }: { onclose: () => void } = $props();

  const p = $derived(project());
  let tab = $state<'mappings' | 'devices' | 'clock' | 'global'>('mappings');

  interface ActionSpec {
    type: ControlAction['type'];
    label: string;
    needsScene?: boolean;
    needsLayer?: boolean;
    needsParam?: boolean;
    continuous?: boolean;
  }

  const ACTIONS: ActionSpec[] = [
    { type: 'scene.recall', label: 'Scene Recall', needsScene: true },
    { type: 'scene.next', label: 'Scene Next' },
    { type: 'scene.prev', label: 'Scene Prev' },
    { type: 'layer.mute', label: 'Layer Mute', needsLayer: true },
    { type: 'layer.solo', label: 'Layer Solo', needsLayer: true },
    { type: 'layer.select', label: 'Layer Select', needsLayer: true },
    { type: 'layer.opacity', label: 'Layer Opacity', needsLayer: true, continuous: true },
    { type: 'layer.blendNext', label: 'Layer Blend Next', needsLayer: true },
    { type: 'param.set', label: 'Shader Param', needsLayer: true, needsParam: true, continuous: true },
    { type: 'crossfade.mix', label: 'Crossfade Mix', continuous: true },
    { type: 'bpm.tap', label: 'BPM Tap' },
    { type: 'app.blackout', label: 'Blackout' },
    { type: 'app.panic', label: 'Panic' },
  ];

  function actionSpec(type: ControlAction['type']): ActionSpec {
    return ACTIONS.find((a) => a.type === type) ?? ACTIONS[0]!;
  }

  interface EditState {
    bindingId?: string;
    source: MidiSource | null;
    actionType: ControlAction['type'];
    sceneIndex: number;
    layerIndex: number;
    param: string;
    behavior: MidiBehavior;
  }

  let editing = $state<EditState | null>(null);
  let learning = $state(false);

  function newEditState(): EditState {
    return { source: null, actionType: 'scene.recall', sceneIndex: 0, layerIndex: 0, param: '', behavior: 'trigger' };
  }

  function startNew() { editing = newEditState(); }

  function startEdit(binding: MidiBinding) {
    const a = binding.action;
    editing = {
      bindingId: binding.id,
      source: binding.source,
      actionType: a.type,
      sceneIndex: 'sceneIndex' in a ? a.sceneIndex : 0,
      layerIndex: 'layerIndex' in a ? a.layerIndex : 0,
      param: 'param' in a ? a.param : '',
      behavior: binding.behavior,
    };
  }

  function cancelEdit() {
    if (learning) { getMidiSystem().learn.cancel('cancelled by user'); learning = false; }
    editing = null;
  }

  async function learnNow() {
    if (!editing) return;
    learning = true;
    try {
      const source = await getMidiSystem().learn.armLearn();
      if (editing) editing.source = source;
    } catch {
      // キャンセルまたは他のLearnに割り込まれた
    } finally {
      learning = false;
    }
  }

  function buildAction(e: EditState): ControlAction {
    switch (e.actionType) {
      case 'scene.recall': return { type: 'scene.recall', sceneIndex: e.sceneIndex };
      case 'scene.next': return { type: 'scene.next' };
      case 'scene.prev': return { type: 'scene.prev' };
      case 'layer.mute': return { type: 'layer.mute', layerIndex: e.layerIndex };
      case 'layer.solo': return { type: 'layer.solo', layerIndex: e.layerIndex };
      case 'layer.select': return { type: 'layer.select', layerIndex: e.layerIndex };
      case 'layer.opacity': return { type: 'layer.opacity', layerIndex: e.layerIndex };
      case 'layer.blendNext': return { type: 'layer.blendNext', layerIndex: e.layerIndex };
      case 'param.set': return { type: 'param.set', layerIndex: e.layerIndex, param: e.param };
      case 'crossfade.mix': return { type: 'crossfade.mix' };
      case 'bpm.tap': return { type: 'bpm.tap' };
      case 'app.blackout': return { type: 'app.blackout' };
      case 'app.panic': return { type: 'app.panic' };
    }
  }

  function sourceEquals(a: MidiSource, b: MidiSource): boolean {
    return a.kind === b.kind && a.channel === b.channel && a.number === b.number;
  }

  function saveEdit() {
    if (!editing || !editing.source) { toast('MIDI信号をLearnしてください', 'warn'); return; }
    // editing は $state のリアクティブプロキシなので、Immer に渡す前にプレーンオブジェクトへ
    // スナップショットする(プロキシのまま渡すと produceWithPatches の freeze() が例外を投げる)。
    const snapshot = $state.snapshot(editing);
    const binding: MidiBinding = {
      id: snapshot.bindingId ?? newId('bind'),
      source: snapshot.source!,
      behavior: snapshot.behavior,
      action: buildAction(snapshot),
    };
    const conflict = p.midi.bindings.find((b) => b.id !== binding.id && sourceEquals(b.source, binding.source));
    dispatch(
      snapshot.bindingId ? { type: 'midi/updateBinding', binding } : { type: 'midi/addBinding', binding },
      { undoable: true },
    );
    if (conflict) {
      toast(`${formatSource(binding.source)} は既に「${formatAction(conflict.action)}」で使われています(両方発火します)`, 'warn');
    }
    editing = null;
  }

  function removeBinding(binding: MidiBinding) {
    dispatch({ type: 'midi/removeBinding', bindingId: binding.id }, { undoable: true });
    toast(`バインディング「${formatAction(binding.action)}」を削除しました(⌘Zで復元)`);
  }

  function formatSource(s: MidiSource): string {
    return `${s.kind.toUpperCase()} ${s.number} · Ch${s.channel}`;
  }

  function formatAction(a: ControlAction): string {
    const spec = actionSpec(a.type);
    if ('sceneIndex' in a) return `${spec.label} #${a.sceneIndex + 1}`;
    if (a.type === 'param.set') return `${spec.label} #${a.layerIndex + 1} · ${a.param}`;
    if ('layerIndex' in a) return `${spec.label} #${a.layerIndex + 1}`;
    return spec.label;
  }

  const paramOptions = $derived.by(() => {
    if (!editing || editing.actionType !== 'param.set') return [];
    const scene = p.scenes[p.activeSceneIndex];
    const layer = scene?.layers[editing.layerIndex];
    if (!layer) return [];
    const def = findShader(layer.shaderKey);
    return def ? Object.keys(def.params) : [];
  });

  function toggleDevice(id: string, enabled: boolean) {
    dispatch({ type: 'midi/setDeviceEnabled', deviceId: id, enabled });
  }

  function toggleClockSync() {
    dispatch({ type: 'midi/setClockSync', enabled: !p.midi.clockSync });
  }

  function panic() {
    runPanic(getStore());
    toast('MIDI PANIC 実行');
  }

  function clearAllBindings() {
    if (p.midi.bindings.length === 0) return;
    if (!confirm(`${p.midi.bindings.length}件のバインディングを全て削除しますか？`)) return;
    for (const b of [...p.midi.bindings]) {
      dispatch({ type: 'midi/removeBinding', bindingId: b.id }, { undoable: true });
    }
  }

  function exportBindings() {
    const blob = new Blob([JSON.stringify(p.midi.bindings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vj-midi-bindings.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function importBindings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data)) throw new Error('invalid');
        for (const raw of data) {
          if (raw && typeof raw === 'object' && raw.source && raw.action) {
            dispatch({ type: 'midi/addBinding', binding: { ...raw, id: newId('bind') } }, { undoable: true });
          }
        }
        toast(`${data.length}件のバインディングを読み込みました`);
      } catch {
        toast('バインディングの読み込みに失敗しました', 'error');
      }
    };
    input.click();
  }
</script>

<div class="overlay" onclick={onclose} role="presentation">
  <div
    class="sheet panel" role="dialog" aria-label="midi config" tabindex="-1"
    onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}
  >
    <div class="panel-head">
      <span class="microlabel">MIDI Configuration</span>
      <span class="spacer"></span>
      <button class="btn" onclick={onclose} title="Close (Esc)" aria-label="close">ESC</button>
    </div>

    <div class="tabs">
      <button class="tab" class:on={tab === 'mappings'} onclick={() => (tab = 'mappings')}>Mappings</button>
      <button class="tab" class:on={tab === 'devices'} onclick={() => (tab = 'devices')}>Devices</button>
      <button class="tab" class:on={tab === 'clock'} onclick={() => (tab = 'clock')}>Clock &amp; Sync</button>
      <button class="tab" class:on={tab === 'global'} onclick={() => (tab = 'global')}>Global Actions</button>
    </div>

    <div class="content">
      {#if tab === 'mappings'}
        {#if !editing}
          <button class="btn on new-btn" onclick={startNew}>＋ NEW BINDING</button>
        {:else}
          <div class="editor">
            <div class="erow">
              <button class="btn" class:warn={learning} onclick={learnNow} disabled={learning}>
                {learning ? 'LISTENING…' : 'LEARN'}
              </button>
              <span class="mono learned">{editing.source ? formatSource(editing.source) : '(未学習)'}</span>
            </div>
            <div class="erow">
              <span class="microlabel">Action</span>
              <select bind:value={editing.actionType}>
                {#each ACTIONS as a (a.type)}<option value={a.type}>{a.label}</option>{/each}
              </select>
            </div>
            {#if actionSpec(editing.actionType).needsScene}
              <div class="erow">
                <span class="microlabel">Scene #</span>
                <input type="number" min="1" max={p.scenes.length} bind:value={() => editing!.sceneIndex + 1, (v) => (editing!.sceneIndex = Math.max(0, Number(v) - 1))} />
              </div>
            {/if}
            {#if actionSpec(editing.actionType).needsLayer}
              <div class="erow">
                <span class="microlabel">Layer #</span>
                <input type="number" min="1" bind:value={() => editing!.layerIndex + 1, (v) => (editing!.layerIndex = Math.max(0, Number(v) - 1))} />
              </div>
            {/if}
            {#if actionSpec(editing.actionType).needsParam}
              <div class="erow">
                <span class="microlabel">Param</span>
                {#if paramOptions.length > 0}
                  <select bind:value={editing.param}>
                    <option value="">—</option>
                    {#each paramOptions as key (key)}<option value={key}>{key}</option>{/each}
                  </select>
                {:else}
                  <input type="text" placeholder="param name" bind:value={editing.param} />
                {/if}
              </div>
            {/if}
            {#if !actionSpec(editing.actionType).continuous}
              <div class="erow">
                <span class="microlabel">Behavior</span>
                <select bind:value={editing.behavior}>
                  <option value="trigger">Trigger</option>
                  <option value="toggle">Toggle</option>
                  <option value="momentary">Momentary</option>
                </select>
              </div>
            {:else}
              <div class="erow hint">CCの連続値のみ対応します</div>
            {/if}
            <div class="erow">
              <button class="btn on" onclick={saveEdit}>SAVE</button>
              <button class="btn" onclick={cancelEdit}>CANCEL</button>
            </div>
          </div>
        {/if}

        <table class="tbl">
          <thead><tr><th>Source</th><th>Action</th><th>Behavior</th><th></th></tr></thead>
          <tbody>
            {#each p.midi.bindings as b (b.id)}
              <tr>
                <td class="mono">{formatSource(b.source)}</td>
                <td>{formatAction(b.action)}</td>
                <td class="mono">{actionSpec(b.action.type).continuous ? '—' : b.behavior}</td>
                <td class="rowbtns">
                  <button class="mini" onclick={() => startEdit(b)} aria-label="edit binding">EDIT</button>
                  <button class="mini del" onclick={() => removeBinding(b)} title="delete" aria-label="delete binding">✕</button>
                </td>
              </tr>
            {/each}
            {#if p.midi.bindings.length === 0}
              <tr><td colspan="4" class="empty">バインディングがありません</td></tr>
            {/if}
          </tbody>
        </table>
      {/if}

      {#if tab === 'devices'}
        <table class="tbl">
          <thead><tr><th></th><th>Name</th><th>Manufacturer</th><th>State</th><th>Enabled</th></tr></thead>
          <tbody>
            {#each midiState.devices as d (d.id)}
              <tr>
                <td><span class="dot" class:ok={d.state === 'connected'}></span></td>
                <td>{d.name}</td>
                <td class="mono">{d.manufacturer || '—'}</td>
                <td class="mono">{d.state}</td>
                <td><button class="btn" class:on={d.enabled} onclick={() => toggleDevice(d.id, !d.enabled)}>{d.enabled ? 'ON' : 'OFF'}</button></td>
              </tr>
            {/each}
            {#if midiState.devices.length === 0}
              <tr><td colspan="5" class="empty">MIDIデバイスが検出されていません</td></tr>
            {/if}
          </tbody>
        </table>
      {/if}

      {#if tab === 'clock'}
        <div class="clockpanel">
          <div class="erow">
            <span class="microlabel">MIDI Clock Sync</span>
            <button class="btn" class:on={p.midi.clockSync} onclick={toggleClockSync}>{p.midi.clockSync ? 'ON' : 'OFF'}</button>
          </div>
          <p class="hint">
            ONにすると、接続されたMIDIデバイスからのMIDI Clock(24 PPQN)信号でBPMを自動追従します。
            Start/Stopメッセージでトランスポートも同期されます。
          </p>
          <div class="erow">
            <span class="microlabel">Current BPM</span>
            <span class="mono">{p.bpm.toFixed(1)}</span>
          </div>
        </div>
      {/if}

      {#if tab === 'global'}
        <div class="globalpanel">
          <div class="erow">
            <button class="btn hot" onclick={panic}>MIDI PANIC</button>
            <span class="hint">全レイヤーのMute/Soloを解除し、Blackoutとクロスフェードを中断します</span>
          </div>
          <div class="erow">
            <button class="btn" onclick={exportBindings}>EXPORT BINDINGS</button>
            <button class="btn" onclick={importBindings}>IMPORT BINDINGS</button>
          </div>
          <div class="erow">
            <button class="btn hot" onclick={clearAllBindings}>CLEAR ALL BINDINGS</button>
          </div>
          <div class="shortcuts">
            <div class="microlabel">Keyboard Shortcuts</div>
            <div class="scrow"><span class="mono">⌘Z</span><span>Undo</span></div>
            <div class="scrow"><span class="mono">⇧⌘Z</span><span>Redo</span></div>
            <div class="scrow"><span class="mono">B</span><span>Blackout Toggle</span></div>
            <div class="scrow"><span class="mono">⌘⏎</span><span>Live Code: Eval Script</span></div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<style>
  .overlay {
    position: fixed; inset: 0; z-index: 50;
    background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(2px);
    display: grid; place-items: center;
  }
  .sheet { width: min(720px, 92vw); max-height: 80vh; }
  .spacer { flex: 1; }
  .tabs { display: flex; border-bottom: 1px solid var(--stroke); flex: none; }
  .tab {
    background: none; border: none; color: var(--tx-2); cursor: pointer;
    padding: 8px 14px; font-size: 12px; font-weight: 600; border-bottom: 2px solid transparent;
  }
  .tab.on { color: var(--acc); border-bottom-color: var(--acc); }
  .content { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
  .new-btn { align-self: flex-start; }
  .editor {
    display: flex; flex-direction: column; gap: 8px;
    background: var(--bg-2); border: 1px solid var(--stroke-strong);
    border-radius: var(--radius); padding: 10px;
  }
  .erow { display: flex; align-items: center; gap: 8px; }
  .erow.hint, .hint { color: var(--tx-3); font-size: 11px; }
  .learned { color: var(--acc); }
  .tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
  .tbl th { text-align: left; color: var(--tx-2); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; padding: 6px 8px; border-bottom: 1px solid var(--stroke); }
  .tbl td { padding: 6px 8px; border-bottom: 1px solid var(--stroke); }
  .empty { text-align: center; color: var(--tx-3); padding: 16px !important; }
  .rowbtns { display: flex; gap: 6px; }
  .mini { background: var(--bg-3); border: 1px solid var(--stroke); border-radius: var(--radius-sm); color: var(--tx-2); font-size: 12px; padding: 6px 11px; min-height: 30px; cursor: pointer; }
  .mini.del:hover { border-color: var(--hot); color: var(--hot); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--tx-3); display: inline-block; }
  .dot.ok { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
  .clockpanel, .globalpanel { display: flex; flex-direction: column; gap: 12px; }
  .shortcuts { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
  .scrow { display: flex; gap: 10px; font-size: 12px; color: var(--tx-2); }
  .scrow .mono { color: var(--acc); min-width: 44px; }
</style>
