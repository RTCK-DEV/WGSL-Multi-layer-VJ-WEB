<script lang="ts">
  /** シーンレール: シーン一覧 / 追加 / クロスフェード設定 / オート切替 */
  import { project, dispatch } from '../store-bridge.svelte';
  import { live } from '../live.svelte';

  const p = $derived(project());
  const CF_CHOICES = [0, 0.5, 1, 2, 4, 8];

  function recall(i: number) {
    if (i === p.activeSceneIndex && !p.crossfade.active) return;
    dispatch({
      type: 'scene/crossfadeTo',
      index: i,
      durationBeats: p.crossfadeBeats,
      startBeat: live.bpm > 0 ? currentBeatGuess() : 0,
    });
  }
  function setCfBeats(beats: number) {
    dispatch({ type: 'scene/setCrossfadeBeats', beats });
  }
  // 開始beatは renderer 側で精密化される。UI からは近似値でよい。
  function currentBeatGuess(): number { return performance.now() / 60000 * live.bpm; }

  function addScene() { dispatch({ type: 'scene/add' }, { undoable: true }); }
  function removeScene(id: string, e: MouseEvent) {
    e.stopPropagation();
    dispatch({ type: 'scene/remove', sceneId: id }, { undoable: true });
  }
  function rename(id: string, e: Event) {
    const name = (e.target as HTMLInputElement).value.trim();
    if (name) dispatch({ type: 'scene/rename', sceneId: id, name }, { undoable: true });
  }
</script>

<div class="panel">
  <div class="panel-head">
    <span class="microlabel">Scenes</span>
    <span class="spacer"></span>
    <button class="btn" onclick={addScene} aria-label="add scene">＋</button>
  </div>

  <div class="list">
    {#each p.scenes as scene, i (scene.id)}
      <div
        class="scene" class:active={i === p.activeSceneIndex}
        class:incoming={p.crossfade.active && p.crossfade.toSceneIndex === i}
        onclick={() => recall(i)}
        role="button" tabindex="0"
        onkeydown={(e) => e.key === 'Enter' && recall(i)}
      >
        <span class="idx mono">{i + 1}</span>
        <input class="name" value={scene.name} onchange={(e) => rename(scene.id, e)} onclick={(e) => e.stopPropagation()} aria-label="scene name" />
        <span class="count mono">{scene.layers.length}L</span>
        {#if p.scenes.length > 1}
          <button class="x" onclick={(e) => removeScene(scene.id, e)} title="delete" aria-label="delete scene">×</button>
        {/if}
      </div>
    {/each}
  </div>

  <div class="foot">
    <div class="row">
      <span class="microlabel">Xfade</span>
      <div class="seg">
        {#each CF_CHOICES as c (c)}
          <button class="segbtn mono" class:on={p.crossfadeBeats === c} onclick={() => setCfBeats(c)}>{c}</button>
        {/each}
      </div>
    </div>
    <div class="row">
      <span class="microlabel">Auto</span>
      <button
        class="btn" class:on={p.autoSwitch.enabled}
        onclick={() => dispatch({ type: 'scene/autoSwitch', enabled: !p.autoSwitch.enabled })}
      >{p.autoSwitch.enabled ? 'ON' : 'OFF'}</button>
      <select
        value={p.autoSwitch.mode}
        onchange={(e) => dispatch({ type: 'scene/autoSwitch', mode: (e.target as HTMLSelectElement).value as 'sequential' | 'random' })}
      >
        <option value="sequential">SEQ</option>
        <option value="random">RND</option>
      </select>
      <select
        value={String(p.autoSwitch.intervalBeats)}
        onchange={(e) => dispatch({ type: 'scene/autoSwitch', intervalBeats: Number((e.target as HTMLSelectElement).value) })}
      >
        {#each [4, 8, 16, 32, 64] as b (b)}<option value={String(b)}>{b} beats</option>{/each}
      </select>
    </div>
  </div>
</div>

<style>
  .spacer { flex: 1; }
  .list { flex: 1; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
  .scene {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px; border-radius: var(--radius-sm);
    border: 1px solid var(--stroke); background: var(--bg-2);
    cursor: pointer; transition: border-color .1s, background .1s;
  }
  .scene:hover { background: var(--bg-3); }
  .scene:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
  .scene.active { border-color: var(--acc); background: color-mix(in srgb, var(--acc) 8%, var(--bg-2)); }
  .scene.incoming { border-color: var(--warn); animation: blink-warn 0.8s infinite; }
  .idx { color: var(--tx-3); font-size: 11px; width: 14px; }
  .name {
    flex: 1; min-width: 0; background: none; border: none; color: var(--tx-1);
    font: inherit; padding: 0;
  }
  .name:focus { outline: none; color: var(--acc); }
  .count { color: var(--tx-3); font-size: 10px; }
  .x {
    background: none; border: none; color: var(--tx-2); cursor: pointer; font-size: 16px;
    width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; flex: none;
    border-radius: var(--radius-sm);
  }
  .x:hover { background: var(--bg-3); color: var(--hot); }
  .x:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
  .foot { border-top: 1px solid var(--stroke); padding: 8px 10px; display: flex; flex-direction: column; gap: 8px; }
  .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .seg { display: flex; border: 1px solid var(--stroke); border-radius: var(--radius-sm); overflow: hidden; }
  .segbtn {
    background: var(--bg-2); border: none; color: var(--tx-2);
    padding: 6px 11px; font-size: 12px; cursor: pointer; min-height: 30px;
  }
  .segbtn + .segbtn { border-left: 1px solid var(--stroke); }
  .segbtn.on { background: var(--acc-dim); color: var(--acc); }
</style>
