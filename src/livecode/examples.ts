/**
 * Scene Script の学習用サンプル集。LiveCodePanel の「Load Example」から読み込める。
 * デモプロジェクト(初回起動時)の layer(0)=Crystal KIFS, layer(1)=Cyberscape を前提に書いている。
 */
export interface LiveCodeExample {
  name: string;
  description: string;
  code: string;
}

export const LIVECODE_EXAMPLES: LiveCodeExample[] = [
  {
    name: '基本: ブレンドと不透明度',
    description: '数値を渡すと即座に反映される一発コマンド(Undoで戻せる)。',
    code: `// 数値を渡すと一発コマンドとして反映され、Undo(⌘Z)で戻せる
layer(1).blend('ADD').opacity(0.8);`,
  },
  {
    name: '連続変調: 明滅するオパシティ',
    description: '数値の代わりに関数を渡すと、毎フレーム評価される連続変調になる(Undo履歴は汚れない)。',
    code: `// 関数を渡すと連続変調になる。c は { t, beat, phase, bass, mid, treble }
layer(1).opacity((c) => 0.5 + 0.5 * Math.sin(c.t * 2));`,
  },
  {
    name: 'オーディオリアクティブ',
    description: '低音(bass)の強さに応じてシェーダーパラメータを揺らす。',
    code: `// c.bass は 0..1。マイク/システムオーディオをHeaderのMIC/SYSで有効にすると反応する
layer(0).param('fold', (c) => 1.0 + c.bass * 1.5);`,
  },
  {
    name: 'ビート同期の明滅',
    description: 'c.phase は現在の拍内の位置(0..1、次の拍で0に戻る)。ストロボ的な明滅を作る。',
    code: `// 拍の頭(phase=0)で明るく、次第に減衰する
layer(1).opacity((c) => 1.0 - c.phase);`,
  },
  {
    name: '複数レイヤーの協調',
    description: '2つのレイヤーをそれぞれ別の速度・別の変数で同時に動かす。',
    code: `layer(0).param('scale', (c) => 2.0 + Math.sin(c.t * 0.5));
layer(1).param('density', (c) => 15.0 + c.mid * 10.0);`,
  },
  {
    name: 'シーン切替',
    description: 'シーンが複数ある場合、次のシーンへクロスフェードする。',
    code: `// crossfadeの長さは設定済みのXFADE値(拍数)が使われる
scene.next();`,
  },
  {
    name: '変調の解除',
    description: '連続変調を止めて固定値に戻す。layer(1)の作例を試したあとにどうぞ。',
    code: `// 特定のパラメータだけ解除
layer(1).clear('__opacity__');
// そのレイヤーの変調を全部解除
layer(0).clearAll();`,
  },
];
