<script lang="ts">
  /** レイヤーデッキ: 横並びカード。追加・並び替え(HTML5 DnD)・選択。 */
  import { project, dispatch } from '../store-bridge.svelte';
  import LayerCard from './LayerCard.svelte';
  import ShaderPicker from './ShaderPicker.svelte';

  const p = $derived(project());
  const scene = $derived(p.scenes[p.activeSceneIndex]);

  let pickerOpen = $state(false);
  let dragFrom: number | null = null;

  function onDragStart(i: number) { dragFrom = i; }
  function onDrop(i: number) {
    if (dragFrom !== null && dragFrom !== i && scene) {
      dispatch({ type: 'layer/move', sceneId: scene.id, from: dragFrom, to: i }, { undoable: true });
    }
    dragFrom = null;
  }
</script>

<div class="panel deck">
  <div class="panel-head">
    <span class="microlabel">Layers — {scene?.name ?? ''}</span>
    <span class="spacer"></span>
    <button class="btn on" onclick={() => (pickerOpen = true)}>＋ ADD LAYER</button>
  </div>
  <div class="cards">
    {#if scene}
      {#each scene.layers as layer, i (layer.id)}
        <div
          role="listitem"
          draggable="true"
          ondragstart={() => onDragStart(i)}
          ondragover={(e) => e.preventDefault()}
          ondrop={() => onDrop(i)}
        >
          <LayerCard {layer} sceneId={scene.id} index={i} />
        </div>
      {/each}
      {#if scene.layers.length === 0}
        <div class="empty">レイヤーがありません — ＋ ADD LAYER から追加</div>
      {/if}
    {/if}
  </div>
</div>

{#if pickerOpen && scene}
  <ShaderPicker sceneId={scene.id} onclose={() => (pickerOpen = false)} />
{/if}

<style>
  .deck { height: var(--deck-h); flex: none; }
  .spacer { flex: 1; }
  .cards {
    flex: 1; display: flex; gap: 8px;
    padding: 8px; overflow-x: auto; overflow-y: hidden;
    align-items: stretch;
  }
  .empty {
    display: grid; place-items: center; flex: 1;
    color: var(--tx-3); font-size: 12px;
  }
</style>
