import type { ShaderModuleDef } from '../core/types';

const wgsl = `
// ============================================================
// BLANK CANVAS — オリジナルシェーダーを書き始めるための最小テンプレート
// ============================================================
// このコメントごと自由に書き換えてOK。利用できるグローバルは以下のとおり:
//
//   G.time                     経過秒数 (f32)
//   G.resolution               出力解像度 vec2f(width, height)
//   G.bass / G.mid / G.treble  オーディオ8バンドを3群に集約した値、それぞれ 0..1
//   G.bpm / G.beat / G.phase   BPM・連続ビートカウント・ビート内位相(0..1、次の拍で0に戻る)
//   P.<パラメータ名>            下の params で定義した値。インスペクタのスライダーで調整できる
//   inputTex / feedbackTex     filter/feedback系シェーダー用の入力テクスチャ(このテンプレートでは未使用。
//                              使うときは sampleInput(uv) / sampleFeedback(uv) で読み出す)
//
// 引数の uv は 0..1(左下原点)、frag は -1..1 のクリップ空間座標(アスペクト比は未補正)。
// 下の st のように補正してから使うのが基本。
//
// hash21 / noise2 / fbm2 / rotate2d / hsv2rgb / smin / sdBox3 はライブラリ関数として使用可能。

fn shade(uv: vec2f, frag: vec2f) -> vec4f {
  // アスペクト比を補正した座標(-aspect..aspect, -1..1)
  let st = frag * vec2f(G.resolution.x / G.resolution.y, 1.0);

  // P.speed で回転速度を、P.density でリングの本数を調整できる
  let rotated = rotate2d(st, G.time * P.speed);

  // 同心円状のリングパターン
  let rings = sin(length(rotated) * P.density - G.time * 2.0);
  let brightness = smoothstep(0.0, 0.15, abs(rings));

  // ベース(低音)に反応して色相が動く
  let hue = fract(G.time * 0.05 + G.bass * 0.5);
  let color = hsv2rgb(vec3f(hue, 0.7, brightness));

  return vec4f(color, 1.0);
}
`;

export default {
  key: 'blank-canvas',
  name: 'Blank Canvas [Start Here]',
  category: 'START HERE',
  kind: 'generator',
  wgsl,
  params: {
    speed: { type: 'f32', default: 0.5, min: 0.0, max: 2.0, label: 'Speed' },
    density: { type: 'f32', default: 8.0, min: 1.0, max: 20.0, label: 'Ring Density' },
  },
} satisfies ShaderModuleDef;
