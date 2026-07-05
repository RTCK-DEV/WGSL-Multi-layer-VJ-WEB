// 'monaco-editor' のバレルは60以上の組み込み言語+json/css/html/tsの重量級リッチ言語サービスを
// 巻き込みバンドルサイズが激増するため、コア(editor.api)+contrib一式(edcore.main)のみを読み込む。
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import 'monaco-editor/esm/vs/editor/edcore.main.js';
// ライブコーディングのScene Scriptタブ用。basic-languagesの軽量Monarchトークナイザのみで、
// tsMode等の重量級リッチ言語サービス(型チェック・補完用ワーカー)は含まない。
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

const WGSL_LANGUAGE_ID = 'wgsl';

const wgslKeywords = [
  'fn',
  'var',
  'let',
  'struct',
  'return',
  'if',
  'else',
  'for',
  'while',
  'loop',
  'break',
  'continue',
  'switch',
  'case',
  'default',
  'discard',
];

const wgslTypes = [
  'f32',
  'i32',
  'u32',
  'bool',
  'vec2f',
  'vec3f',
  'vec4f',
  'mat2x2f',
  'mat3x3f',
  'mat4x4f',
  'texture_2d',
  'sampler',
  'ptr',
  'array',
];

const wgslAttributes = [
  '@vertex',
  '@fragment',
  '@compute',
  '@group',
  '@binding',
  '@location',
  '@builtin',
  '@size',
];

globalThis.MonacoEnvironment = {
  getWorker: (_workerId: string, label: string): Worker => new EditorWorker({ name: label }),
};

if (!monaco.languages.getLanguages().some((language) => language.id === WGSL_LANGUAGE_ID)) {
  monaco.languages.register({ id: WGSL_LANGUAGE_ID });

  monaco.languages.setMonarchTokensProvider(WGSL_LANGUAGE_ID, {
    keywords: wgslKeywords,
    typeKeywords: wgslTypes,
    attributes: wgslAttributes,
    operators: [
      '=',
      '>',
      '<',
      '!',
      '~',
      '?',
      ':',
      '==',
      '<=',
      '>=',
      '!=',
      '&&',
      '||',
      '+',
      '-',
      '*',
      '/',
      '&',
      '|',
      '^',
      '%',
      '+=',
      '-=',
      '*=',
      '/=',
      '&=',
      '|=',
      '^=',
      '%=',
      '->',
    ],
    symbols: /[=><!~?:&|+\-*/^%]+/,
    tokenizer: {
      root: [
        [/@[a-zA-Z_]\w*/, { cases: { '@attributes': 'annotation', '@default': 'annotation' } }],
        [/[a-zA-Z_]\w*/, { cases: { '@keywords': 'keyword', '@typeKeywords': 'type', '@default': 'identifier' } }],
        { include: '@whitespace' },
        [/[{}()[\]]/, '@brackets'],
        [/[<>](?!@symbols)/, '@brackets'],
        [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],
        [/0[xX][0-9a-fA-F]+[iu]?/, 'number.hex'],
        [/\d*\.\d+([eE][+-]?\d+)?f?/, 'number.float'],
        [/\d+([eE][+-]?\d+)?[iuf]?/, 'number'],
        [/[;,.]/, 'delimiter'],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\/\*/, 'comment', '@push'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
      string: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
      ],
      whitespace: [
        [/[ \t\r\n]+/, 'white'],
        [/\/\*/, 'comment', '@comment'],
        [/\/\/.*$/, 'comment'],
      ],
    },
  });
}
