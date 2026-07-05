<script lang="ts">
  /**
   * ライブコーディングパネル — 非モーダル・ドッキング表示。
   * SHADER: 選択レイヤーのWGSLをリアルタイム編集(既存Editorの後継)。
   * SCRIPT: シーン全体をHydra風チェーンAPIで操作するJSを Ctrl/Cmd+Enter で評価。
   * どちらのタブもパネルを開いている間ずっとMonacoインスタンスを保持し、タブ切替では破棄しない。
   */
  import { untrack } from 'svelte';
  import { project, dispatch } from '../store-bridge.svelte';
  import { modals } from '../modals.svelte';
  import { findShader } from '../catalog.svelte';
  import { getRenderer } from '../renderer-ref';
  import { getLiveCodeApi } from '../livecode-ref';
  import { runLiveScript } from '../../livecode';
  import {
    createShaderEditor, createScriptEditor,
    type ShaderEditorHost, type ScriptEditorHost,
  } from '../../editor/monaco-host';
  import type { ShaderDiagnostic, ShaderParamDef } from '../../core/types';

  const p = $derived(project());
  const scene = $derived(p.scenes[p.activeSceneIndex]);
  const layer = $derived(scene?.layers.find((l) => l.id === p.selectedLayerId));
  // プリミティブ値のみを追跡対象にする: store全体(p)のどこかが変わるたびに
  // Monacoインスタンスが破棄・再生成されて入力中のテキストが消えるのを防ぐため、
  // 「今どのレイヤーを編集対象にすべきか」だけを安定した依存として切り出す。
  const targetLayerId = $derived(layer?.id ?? null);

  let shaderContainer: HTMLDivElement | undefined = $state();
  let scriptContainer: HTMLDivElement | undefined = $state();
  let shaderHost: ShaderEditorHost | null = null;
  let scriptHost: ScriptEditorHost | null = null;
  let diagnostics = $state<ShaderDiagnostic[]>([]);
  let scriptError = $state<string | null>(null);
  let customKey: string | null = null;
  let flash = $state<'ok' | 'error' | null>(null);
  let validateSeq = 0;

  function triggerFlash(kind: 'ok' | 'error') {
    flash = kind;
    setTimeout(() => { if (flash === kind) flash = null; }, 260);
  }

  // ---------- SHADER タブ ----------
  function resolveInitialBody(): { key: string; wgsl: string } | null {
    if (!scene || !layer) return null;
    const existingCustom = p.customShaders[layer.shaderKey];
    if (existingCustom) return { key: layer.shaderKey, wgsl: existingCustom.wgsl };

    const def = findShader(layer.shaderKey);
    if (!def) return null;
    const key = `custom:${layer.id}`;
    // ビルトインシェーダーを最初の編集時にカスタムスロットへ複製し、レイヤーをそこへ切り替える。
    // def は $state(shaderCatalog) 由来のプロキシなので snapshot してから渡す。
    dispatch({ type: 'shader/saveCustom', key, name: def.name, wgsl: def.wgsl, params: $state.snapshot(def.params) });
    dispatch({ type: 'layer/setShaderKey', sceneId: scene.id, layerId: layer.id, shaderKey: key });
    return { key, wgsl: def.wgsl };
  }

  async function runShaderValidation(body: string, params: Record<string, ShaderParamDef>) {
    const seq = ++validateSeq;
    const diags = await getRenderer().validateShader(body, params);
    if (seq !== validateSeq) return;
    diagnostics = diags;
    shaderHost?.setDiagnostics(diags);
  }

  $effect(() => {
    // 依存はここに書いた分だけ: パネル開閉・コンテナ有無・「どのレイヤーか」の3つのみ。
    // p.customShaders等の中身の変更(=自分自身の入力による更新)では再実行しない。
    if (!modals.livecode || !shaderContainer || !targetLayerId) {
      shaderHost?.dispose();
      shaderHost = null;
      return;
    }

    const resolved = untrack(() => resolveInitialBody());
    if (!resolved) return;
    customKey = resolved.key;

    shaderHost = createShaderEditor(shaderContainer, {
      initialValue: resolved.wgsl,
      onChange: (value) => {
        if (!customKey) return;
        const existing = p.customShaders[customKey];
        dispatch({
          type: 'shader/saveCustom',
          key: customKey,
          name: existing?.name ?? customKey,
          wgsl: value,
          params: existing ? $state.snapshot(existing.params) : {},
        }, { undoable: true, coalesceKey: `shader:${customKey}` });
        void runShaderValidation(value, existing?.params ?? {});
      },
    });
    void runShaderValidation(resolved.wgsl, untrack(() => p.customShaders[customKey!]?.params ?? {}));

    return () => {
      shaderHost?.dispose();
      shaderHost = null;
    };
  });

  // ---------- SCRIPT タブ ----------
  function evalScript(code: string) {
    const result = runLiveScript(code, getLiveCodeApi());
    scriptError = result.error ?? null;
    scriptHost?.setError(scriptError);
    triggerFlash(result.ok ? 'ok' : 'error');
  }

  $effect(() => {
    if (!modals.livecode || !scriptContainer) {
      scriptHost?.dispose();
      scriptHost = null;
      return;
    }

    scriptHost = createScriptEditor(scriptContainer, {
      initialValue: untrack(() => p.liveScript),
      onChange: (value) => {
        dispatch({ type: 'app/setLiveScript', script: value });
      },
      onEval: evalScript,
    });

    return () => {
      scriptHost?.dispose();
      scriptHost = null;
    };
  });

  function close() { modals.livecode = false; }
  function selectTab(tab: 'shader' | 'script') { modals.livecodeTab = tab; }
</script>

{#if modals.livecode}
  <div class="dock panel" class:flash-ok={flash === 'ok'} class:flash-error={flash === 'error'}>
    <div class="panel-head">
      <span class="microlabel">Live Code</span>
      <div class="tabs">
        <button class="tab" class:on={modals.livecodeTab === 'shader'} onclick={() => selectTab('shader')}>
          SHADER{#if layer} · {layer.name}{/if}
        </button>
        <button class="tab" class:on={modals.livecodeTab === 'script'} onclick={() => selectTab('script')}>SCRIPT</button>
      </div>
      <span class="spacer"></span>
      {#if modals.livecodeTab === 'script'}<span class="hint mono">⌘⏎ eval</span>{/if}
      <button class="btn" onclick={close}>×</button>
    </div>

    <div class="body">
      <div class="editorhost" class:hidden={modals.livecodeTab !== 'shader'} bind:this={shaderContainer}></div>
      <div class="editorhost" class:hidden={modals.livecodeTab !== 'script'} bind:this={scriptContainer}></div>

      {#if modals.livecodeTab === 'shader'}
        <div class="side">
          <div class="microlabel">Diagnostics</div>
          {#if diagnostics.length === 0}
            <div class="ok">エラーなし — コンパイル成功</div>
          {:else}
            {#each diagnostics as d, i (i)}
              <div class="diag {d.severity}"><span class="mono">L{d.line}:{d.column}</span> {d.message}</div>
            {/each}
          {/if}
        </div>
      {:else}
        <div class="side">
          <div class="microlabel">Output</div>
          {#if scriptError}
            <div class="diag error">{scriptError}</div>
          {:else}
            <div class="ok">OK</div>
          {/if}
          <div class="apidoc">
            <div class="microlabel">API</div>
            <pre class="mono">layer(i).blend('ADD')
layer(i).opacity(0.8)
layer(i).opacity(c =&gt; 1+Math.sin(c.t))
layer(i).param('zoom', 2)
layer(i).param('zoom', c =&gt; c.bass*3)
layer(i).mute() / .solo() / .select()
layer(i).clear('zoom') / .clearAll()
scene.next() / .prev()
scene.recall(1, {'{'}beats: 4{'}'})
bpm.tap() / bpm.set(128)
blackout(true)</pre>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .dock {
    position: fixed;
    top: calc(var(--header-h) + 12px);
    right: calc(var(--inspector-w) + 18px);
    width: 640px;
    height: 440px;
    min-width: 420px;
    min-height: 260px;
    resize: both;
    overflow: hidden;
    z-index: 45;
    background: color-mix(in srgb, var(--bg-1) 92%, transparent);
    backdrop-filter: blur(6px);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
    border-color: var(--stroke-strong);
    transition: box-shadow 0.15s, border-color 0.15s;
  }
  .dock.flash-ok { border-color: var(--acc); box-shadow: 0 0 0 2px var(--acc), 0 12px 32px rgba(0, 0, 0, 0.55); }
  .dock.flash-error { border-color: var(--hot); box-shadow: 0 0 0 2px var(--hot), 0 12px 32px rgba(0, 0, 0, 0.55); }
  .tabs { display: flex; gap: 2px; }
  .tab {
    background: none; border: none; color: var(--tx-2); cursor: pointer;
    padding: 4px 10px; font-size: 11px; font-weight: 600; border-radius: var(--radius-sm);
  }
  .tab.on { color: var(--acc); background: color-mix(in srgb, var(--acc) 12%, transparent); }
  .spacer { flex: 1; }
  .hint { color: var(--tx-3); font-size: 10px; }
  .body { flex: 1; display: flex; min-height: 0; }
  .editorhost { flex: 1; min-width: 0; }
  .editorhost.hidden { display: none; }
  .side {
    width: 220px; flex: none; border-left: 1px solid var(--stroke);
    padding: 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;
  }
  .ok { color: var(--ok); font-size: 11px; }
  .diag { font-size: 11px; color: var(--tx-2); line-height: 1.4; white-space: pre-wrap; word-break: break-word; }
  .diag.error { color: var(--hot); }
  .diag.warning { color: var(--warn); }
  .diag .mono { color: var(--tx-3); margin-right: 4px; }
  .apidoc { margin-top: 4px; }
  .apidoc pre { font-size: 10px; color: var(--tx-3); line-height: 1.6; white-space: pre-wrap; margin: 4px 0 0; }
</style>
