<script lang="ts">
  /** シェーダー選択オーバーレイ: カテゴリごとにグルーピング、1クリック追加 */
  import { dispatch } from '../store-bridge.svelte';
  import { shaderCatalog } from '../catalog.svelte';

  let { sceneId, onclose }: { sceneId: string; onclose: () => void } = $props();

  const groups = $derived.by(() => {
    const g = new Map<string, typeof shaderCatalog.list>();
    for (const s of shaderCatalog.list) {
      const arr = g.get(s.category) ?? [];
      arr.push(s);
      g.set(s.category, arr);
    }
    return [...g.entries()];
  });

  function add(key: string) {
    dispatch({ type: 'layer/add', sceneId, shaderKey: key }, { undoable: true });
    onclose();
  }
</script>

<div class="overlay" onclick={onclose} role="presentation">
  <div
    class="sheet panel" role="dialog" aria-label="shader picker" tabindex="-1"
    onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}
  >
    <div class="panel-head">
      <span class="microlabel">Add Layer — Shader</span>
      <span class="spacer"></span>
      <button class="btn" onclick={onclose} title="Close (Esc)" aria-label="close">ESC</button>
    </div>
    <div class="grid-wrap">
      {#each groups as [cat, items] (cat)}
        <div class="cat">
          <div class="microlabel cathead">{cat}</div>
          <div class="grid">
            {#each items as s (s.key)}
              <button class="cell" onclick={() => add(s.key)}>
                <span class="cellname">{s.name}</span>
                <span class="cellkind mono">{s.kind}</span>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<style>
  .overlay {
    position: fixed; inset: 0; z-index: 40;
    background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(2px);
    display: grid; place-items: center;
  }
  .sheet { width: min(680px, 90vw); max-height: 70vh; }
  .spacer { flex: 1; }
  .grid-wrap { overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 14px; }
  .cathead { margin-bottom: 6px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
  .cell {
    display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
    background: var(--bg-2); border: 1px solid var(--stroke);
    border-radius: var(--radius-sm); padding: 10px;
    cursor: pointer; color: var(--tx-1); font: inherit; text-align: left;
  }
  .cell:hover { border-color: var(--acc); background: color-mix(in srgb, var(--acc) 6%, var(--bg-2)); }
  .cellname { font-size: 12px; font-weight: 600; }
  .cellkind { font-size: 9px; color: var(--tx-3); text-transform: uppercase; }
</style>
