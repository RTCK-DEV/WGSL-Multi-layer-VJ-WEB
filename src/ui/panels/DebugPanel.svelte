<script lang="ts">
  /** デバッグパネル: FPS/フレーム時間/レイヤータイミング/エラーログ。左下固定の折り畳みオーバーレイ */
  import { live } from '../live.svelte';
  import { modals } from '../modals.svelte';

  function clearErrors() { live.errorLog = []; }
</script>

{#if modals.debugPanel}
  <div class="debug panel">
    <div class="panel-head">
      <span class="microlabel">Debug</span>
      <span class="spacer"></span>
      <button class="btn" onclick={() => (modals.debugPanel = false)} title="Close" aria-label="close debug panel">×</button>
    </div>
    <div class="body">
      <div class="row"><span>FPS</span><span class="mono">{live.fps}</span></div>
      <div class="row"><span>Frame</span><span class="mono">{live.cpuFrameMs.toFixed(2)} ms</span></div>
      <div class="row"><span>Layers</span><span class="mono">{live.layerCount}</span></div>
      <div class="row"><span>GPU Timing</span><span class="mono">{live.gpuTimingAvailable ? 'available' : 'n/a'}</span></div>

      {#if live.layerTimings.length > 0}
        <div class="microlabel section">Layer Timings</div>
        {#each live.layerTimings as t (t.layerId)}
          <div class="row small"><span class="mono">{t.layerId.slice(0, 14)}</span><span class="mono">{t.ms.toFixed(2)} ms</span></div>
        {/each}
      {/if}

      <div class="microlabel section">
        Errors
        {#if live.errorLog.length > 0}<button class="clearbtn" onclick={clearErrors}>clear</button>{/if}
      </div>
      {#if live.errorLog.length === 0}
        <div class="empty">エラーなし</div>
      {:else}
        {#each live.errorLog as err, i (i)}
          <div class="err mono">{err}</div>
        {/each}
      {/if}
    </div>
  </div>
{/if}

<style>
  .debug {
    position: fixed; left: 10px; bottom: calc(var(--deck-h) + 16px);
    width: 260px; max-height: 340px; z-index: 40;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
  .spacer { flex: 1; }
  .body { flex: 1; overflow-y: auto; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
  .row { display: flex; justify-content: space-between; font-size: 11px; color: var(--tx-2); }
  .row.small { font-size: 10px; color: var(--tx-3); }
  .section { margin-top: 6px; display: flex; align-items: center; gap: 8px; }
  .clearbtn { background: none; border: none; color: var(--acc); font-size: 10px; cursor: pointer; padding: 0; }
  .empty { color: var(--tx-3); font-size: 10px; }
  .err { color: var(--hot); font-size: 10px; white-space: pre-wrap; word-break: break-word; }
</style>
