/** レイヤーサムネイルのUIミラー(main.ts が renderer から定期 pull して更新) */
export const thumbnails = $state<{ map: Record<string, ImageBitmap | undefined> }>({ map: {} });
