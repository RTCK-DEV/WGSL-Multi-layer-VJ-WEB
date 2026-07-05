import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import './monaco-env';
import type { ShaderDiagnostic } from '../core/types';

export interface ShaderEditorOptions {
  initialValue: string;
  onChange: (value: string) => void;
  theme?: string;
}

export interface ShaderEditorHost {
  setDiagnostics(diags: ShaderDiagnostic[]): void;
  setValue(value: string): void;
  getValue(): string;
  dispose(): void;
}

export interface ScriptEditorOptions {
  initialValue: string;
  /** キー入力ごとにデバウンスして呼ばれる(永続化用途。副作用を起こす実行はしない)。 */
  onChange?: (value: string) => void;
  /** Ctrl/Cmd+Enter で明示的に発火する評価トリガー。 */
  onEval: (value: string) => void;
  theme?: string;
}

export interface ScriptEditorHost {
  setError(message: string | null): void;
  setValue(value: string): void;
  getValue(): string;
  dispose(): void;
}

const VJ_DARK_THEME = 'vj-dark';
const CHANGE_DEBOUNCE_MS = 300;
const MARKER_OWNER = 'vj-shader-diagnostics';
const SCRIPT_MARKER_OWNER = 'vj-script-error';

let themeDefined = false;

function defineVjDarkTheme(): void {
  if (themeDefined) return;

  monaco.editor.defineTheme(VJ_DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '7dd3fc' },
      { token: 'type', foreground: 'c4b5fd' },
      { token: 'annotation', foreground: 'fbbf24' },
      { token: 'number', foreground: 'a7f3d0' },
      { token: 'string', foreground: 'fca5a5' },
      { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#0c0e12',
      'editor.foreground': '#d7dde8',
      'editor.lineHighlightBackground': '#151923',
      'editorLineNumber.foreground': '#4b5565',
      'editorLineNumber.activeForeground': '#aeb7c6',
      'editor.selectionBackground': '#264663',
      'editor.inactiveSelectionBackground': '#1d3145',
      'editorCursor.foreground': '#f8fafc',
      'editorGutter.background': '#0c0e12',
    },
  });

  themeDefined = true;
}

function toMarkerSeverity(severity: ShaderDiagnostic['severity']): monaco.MarkerSeverity {
  switch (severity) {
    case 'error':
      return monaco.MarkerSeverity.Error;
    case 'warning':
      return monaco.MarkerSeverity.Warning;
    case 'info':
      return monaco.MarkerSeverity.Info;
  }
}

function toMarker(diag: ShaderDiagnostic): monaco.editor.IMarkerData {
  const startLineNumber = Math.max(1, diag.line);
  const startColumn = Math.max(1, diag.column);
  const length = Math.max(1, diag.length);

  return {
    startLineNumber,
    startColumn,
    endLineNumber: startLineNumber,
    endColumn: startColumn + length,
    message: diag.message,
    severity: toMarkerSeverity(diag.severity),
  };
}

function baseEditorOptions(): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    automaticLayout: true,
    fontFamily: '"SFMono-Regular", "Menlo", "Consolas", monospace',
    fontSize: 13,
    lineHeight: 20,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    tabSize: 2,
    insertSpaces: true,
    wordWrap: 'on',
  };
}

export function createShaderEditor(container: HTMLElement, opts: ShaderEditorOptions): ShaderEditorHost {
  defineVjDarkTheme();

  const model = monaco.editor.createModel(opts.initialValue, 'wgsl');
  const editor = monaco.editor.create(container, {
    ...baseEditorOptions(),
    model,
    theme: opts.theme ?? VJ_DARK_THEME,
  });

  let changeTimer: ReturnType<typeof setTimeout> | undefined;
  const changeSubscription = model.onDidChangeContent(() => {
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      opts.onChange(model.getValue());
    }, CHANGE_DEBOUNCE_MS);
  });

  return {
    setDiagnostics(diags: ShaderDiagnostic[]): void {
      monaco.editor.setModelMarkers(model, MARKER_OWNER, diags.map(toMarker));
    },
    setValue(value: string): void {
      if (model.getValue() === value) return;
      model.setValue(value);
    },
    getValue(): string {
      return model.getValue();
    },
    dispose(): void {
      if (changeTimer) clearTimeout(changeTimer);
      monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
      changeSubscription.dispose();
      editor.dispose();
      model.dispose();
    },
  };
}

/**
 * ライブコーディングの Scene Script タブ用エディタ。
 * キー入力では実行せず(副作用を持つため)、Ctrl/Cmd+Enter で明示的に評価する。
 * 自動保存目的の onChange は呼ぶが、それとは独立して onEval が「実行」を担う。
 */
export function createScriptEditor(container: HTMLElement, opts: ScriptEditorOptions): ScriptEditorHost {
  defineVjDarkTheme();

  const model = monaco.editor.createModel(opts.initialValue, 'javascript');
  const editor = monaco.editor.create(container, {
    ...baseEditorOptions(),
    model,
    theme: opts.theme ?? VJ_DARK_THEME,
  });

  let changeTimer: ReturnType<typeof setTimeout> | undefined;
  const changeSubscription = model.onDidChangeContent(() => {
    if (!opts.onChange) return;
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      opts.onChange?.(model.getValue());
    }, CHANGE_DEBOUNCE_MS);
  });

  const evalAction = editor.addAction({
    id: 'vj-livecode-eval',
    label: 'Evaluate Script',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
    run: () => {
      opts.onEval(model.getValue());
    },
  });

  return {
    setError(message: string | null): void {
      monaco.editor.setModelMarkers(
        model,
        SCRIPT_MARKER_OWNER,
        message
          ? [{
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: model.getLineCount(),
              endColumn: 1,
              message,
              severity: monaco.MarkerSeverity.Error,
            }]
          : [],
      );
    },
    setValue(value: string): void {
      if (model.getValue() === value) return;
      model.setValue(value);
    },
    getValue(): string {
      return model.getValue();
    },
    dispose(): void {
      if (changeTimer) clearTimeout(changeTimer);
      monaco.editor.setModelMarkers(model, SCRIPT_MARKER_OWNER, []);
      changeSubscription.dispose();
      evalAction.dispose();
      editor.dispose();
      model.dispose();
    },
  };
}
