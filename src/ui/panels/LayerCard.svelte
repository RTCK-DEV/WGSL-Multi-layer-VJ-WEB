<script lang="ts">
  /** レイヤーカード: サムネ / 名前 / blend / opacity / M / S / 削除 */
  import { BLEND_MODES, type Layer } from '../../core/types';
  import { project, dispatch } from '../store-bridge.svelte';
  import { thumbnails } from '../thumbs.svelte';
  import { modals } from '../modals.svelte';

  let { layer, sceneId, index }: { layer: Layer; sceneId: string; index: number } = $props();

  const p = $derived(project());
  const selected = $derived(p.selectedLayerId === layer.id);
  const thumb = $derived(thumbnails.map[layer.id]);

  let canvasEl: HTMLCanvasElement | undefined = $state();
  $effect(() => {
    if (canvasEl && thumb) {
      const ctx = canvasEl.getContext('2d');
      if (ctx) { ctx.clearRect(0, 0, 96, 64); ctx.drawImage(thumb, 0, 0, 96, 64); }
    }
  });

  function select() { dispatch({ type: 'layer/select', layerId: layer.id }); }
  function setOpacity(e: Event) {
    const value = Number((e.target as HTMLInputElement).value);
    dispatch(
      { type: 'layer/setOpacity', sceneId, layerId: layer.id, value },
      { undoable: true, coalesceKey: `op:${layer.id}` },
    );
  }
  function setBlend(e: Event) {
    dispatch(
      { type: 'layer/setBlend', sceneId, layerId: layer.id, blend: (e.target as HTMLSelectElement).value as Layer['blend'] },
      { undoable: true },
    );
  }
  function toggleMute(e: MouseEvent) {
    e.stopPropagation();
    dispatch({ type: 'layer/setMuted', sceneId, layerId: layer.id, muted: !layer.muted }, { undoable: true });
  }
  function toggleSolo(e: MouseEvent) {
    e.stopPropagation();
    dispatch({ type: 'layer/setSolo', sceneId, layerId: layer.id, solo: !layer.solo }, { undoable: true });
  }
  function remove(e: MouseEvent) {
    e.stopPropagation();
    dispatch({ type: 'layer/remove', sceneId, layerId: layer.id }, { undoable: true });
  }
  function openEditor(e: MouseEvent) {
    e.stopPropagation();
    dispatch({ type: 'layer/select', layerId: layer.id });
    modals.livecodeTab = 'shader';
    modals.livecode = true;
  }
</script>

<div
  class="card" class:selected class:muted={layer.muted}
  onclick={select} role="button" tabindex="0"
  onkeydown={(e) => e.key === 'Enter' && select()}
>
  <div class="top">
    <canvas bind:this={canvasEl} width="96" height="64" class="thumb"></canvas>
    <div class="meta">
      <div class="name" title={layer.name}>{layer.name}</div>
      <div class="ord mono">#{index + 1}</div>
      <select value={layer.blend} onchange={setBlend} onclick={(e) => e.stopPropagation()}>
        {#each BLEND_MODES as b (b)}<option value={b}>{b}</option>{/each}
      </select>
    </div>
  </div>
  <div class="bottom">
    <input
      type="range" min="0" max="1" step="0.001" value={layer.opacity}
      style="--fill:{layer.opacity * 100}%"
      oninput={setOpacity} onclick={(e) => e.stopPropagation()}
    />
    <div class="btns">
      <button class="mini" class:m-on={layer.muted} onclick={toggleMute} title="mute">M</button>
      <button class="mini" class:s-on={layer.solo} onclick={toggleSolo} title="solo">S</button>
      <button class="mini" onclick={openEditor} title="edit shader">✎</button>
      <button class="mini del" onclick={remove} title="delete">✕</button>
    </div>
  </div>
</div>

<style>
  .card {
    width: 210px; height: 100%;
    display: flex; flex-direction: column; gap: 6px;
    background: var(--bg-2); border: 1px solid var(--stroke);
    border-radius: var(--radius); padding: 8px;
    cursor: pointer; flex: none;
    transition: border-color .1s;
  }
  .card:hover { border-color: var(--stroke-strong); }
  .card.selected { border-color: var(--acc); box-shadow: 0 0 0 1px var(--acc); }
  .card.muted .thumb { opacity: 0.25; }
  .top { display: flex; gap: 8px; min-height: 0; }
  .thumb {
    width: 96px; height: 64px; flex: none;
    background: var(--bg-0); border-radius: var(--radius-sm);
    border: 1px solid var(--stroke);
  }
  .meta { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
  .name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ord { font-size: 10px; color: var(--tx-3); }
  .meta select { width: 100%; font-size: 10px; padding: 2px 4px; }
  .bottom { display: flex; align-items: center; gap: 6px; }
  .bottom input[type="range"] { flex: 1; }
  .btns { display: flex; gap: 3px; }
  .mini {
    width: 22px; height: 22px; font-size: 10px; font-weight: 700;
    border: 1px solid var(--stroke); border-radius: var(--radius-sm);
    background: var(--bg-3); color: var(--tx-2); cursor: pointer;
  }
  .mini.m-on { border-color: var(--hot); color: var(--hot); background: color-mix(in srgb, var(--hot) 15%, var(--bg-3)); }
  .mini.s-on { border-color: var(--warn); color: var(--warn); background: color-mix(in srgb, var(--warn) 15%, var(--bg-3)); }
  .mini.del:hover { border-color: var(--hot); color: var(--hot); }
</style>
