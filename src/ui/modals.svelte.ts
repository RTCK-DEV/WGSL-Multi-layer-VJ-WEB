/** モーダル・パネル開閉の揮発UI状態 */
export const modals = $state({
  midiConfig: false,
  /** ライブコーディングパネル(非モーダル・ドッキング表示)の開閉。 */
  livecode: false,
  livecodeTab: 'shader' as 'shader' | 'script',
  debugPanel: false,
});
