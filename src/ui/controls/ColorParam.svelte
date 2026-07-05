<script lang="ts">
  /** color型パラメータ(vec3 0..1)をカラーピッカーで編集 */
  let { label, value, onchange }: {
    label: string; value: number[]; onchange: (v: number[]) => void;
  } = $props();

  const hex = $derived(
    '#' + value.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join(''),
  );

  function oninput(e: Event) {
    const h = (e.target as HTMLInputElement).value;
    onchange([
      parseInt(h.slice(1, 3), 16) / 255,
      parseInt(h.slice(3, 5), 16) / 255,
      parseInt(h.slice(5, 7), 16) / 255,
    ]);
  }
</script>

<label class="row">
  <span class="lab">{label}</span>
  <span class="right">
    <span class="val mono">{hex}</span>
    <input type="color" value={hex} {oninput} />
  </span>
</label>

<style>
  .row { display: flex; align-items: center; justify-content: space-between; }
  .lab { font-size: 11px; color: var(--tx-2); }
  .right { display: flex; align-items: center; gap: 8px; }
  .val { font-size: 10px; color: var(--tx-3); }
  input[type='color'] {
    width: 34px; height: 24px; padding: 0; border: 1px solid var(--stroke);
    border-radius: var(--radius-sm); background: var(--bg-3); cursor: pointer;
  }
</style>
