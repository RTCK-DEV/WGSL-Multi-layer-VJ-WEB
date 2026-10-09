# WGSL Multi-layer VJ

[GLSL-Multi-layer-VJ-WEB](https://github.com/RTCK-DEV/GLSL-Multi-layer-VJ-WEB) の後継。
Three.js/GLSLベースの旧アプリを WebGPU(WGSL) + TypeScript + Svelte 5 でフルリライトしたもの。
シェーダーがGLSLからWGSLに変わったため、旧リポジトリとは別プロジェクトとして独立させています。

## 特徴

- 生WebGPU(Three.js非依存)によるレイヤー合成パイプライン。10種のブレンドモード、feedback/filter/external(webcam)系シェーダー対応
- 組み込みシェーダー10種(GLSLから手作業でWGSLへ移植)
- ライブシェーダーエディタ(Monaco、WGSL構文ハイライト+リアルタイム診断)
- **ライブコーディング**: Hydra風のシーンスクリプトDSL(`layer(0).blend('ADD').opacity(c => 1+Math.sin(c.t))`)。関数を渡すとオーディオ/ビート反応の連続変調になり、Undo履歴を汚さず毎フレームGPUへ反映される
- MIDI(Web MIDI API): CC/Note/PC/Clock対応、Learn機能付きバインディングエディタ
- オーディオ8バンド解析(マイク/システムオーディオ)、タップテンポ+MIDI Clock同期
- シーン管理・クロスフェード・自動シーン切替
- IndexedDBへの自動保存、JSON形式でのプロジェクトエクスポート/インポート(旧アプリのlocalStorage形式からの移行にも対応)
- 出力ウィンドウ(ポップアップ、OffscreenCanvas転送によるデュアルターゲット描画)

## 動作要件

WebGPU対応ブラウザが必須です(WebGL2フォールバックなし)。Chrome/Edge、Safari 26+、Firefox 141+ で動作します。

## セットアップ

```bash
npm install
npm run dev      # 開発サーバー(Vite)
npm run build    # 本番ビルド → dist/
npm run check    # svelte-check
npm test         # Vitest
```

## ライセンス

MIT
