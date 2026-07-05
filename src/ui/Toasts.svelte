<script lang="ts">
  import { toasts } from './toast.svelte';
</script>

<div class="toasts">
  {#each toasts as t (t.id)}
    <div class="toast {t.kind}">{t.text}</div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed; bottom: calc(var(--deck-h) + 20px); left: 50%;
    transform: translateX(-50%);
    display: flex; flex-direction: column; gap: 6px; z-index: 60;
    pointer-events: none;
  }
  .toast {
    background: var(--bg-2); border: 1px solid var(--stroke-strong);
    border-radius: var(--radius); padding: 8px 14px; font-size: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  }
  .toast.warn { border-color: var(--warn); color: var(--warn); }
  .toast.error { border-color: var(--hot); color: var(--hot); }
</style>
