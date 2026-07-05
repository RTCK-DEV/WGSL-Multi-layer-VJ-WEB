export interface OutputWindowHandle {
  canvas: Promise<OffscreenCanvas>;
  close(): void;
  onClosed(callback: () => void): void;
}

export function openOutputWindow(width: number, height: number): OutputWindowHandle {
  const popup = window.open('', 'vj-output', `popup=yes,width=${width},height=${height}`);
  const closeCallbacks = new Set<() => void>();
  let closed = false;

  const notifyClosed = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    for (const callback of closeCallbacks) {
      callback();
    }
    closeCallbacks.clear();
  };

  const canvas = new Promise<OffscreenCanvas>((resolve, reject) => {
    if (!popup) {
      reject(new Error('Failed to open output window. Popup may have been blocked.'));
      notifyClosed();
      return;
    }

    const document = popup.document;
    document.title = 'VJ Output';
    document.body.innerHTML = '';
    document.documentElement.style.cssText = 'width:100%;height:100%;margin:0;background:#000;overflow:hidden;';
    document.body.style.cssText = 'width:100%;height:100%;margin:0;background:#000;overflow:hidden;';

    const target = document.createElement('canvas');
    target.width = Math.max(1, Math.floor(width));
    target.height = Math.max(1, Math.floor(height));
    target.style.cssText = 'display:block;width:100vw;height:100vh;background:#000;';
    document.body.append(target);

    popup.addEventListener('pagehide', notifyClosed, { once: true });
    popup.addEventListener('unload', notifyClosed, { once: true });

    try {
      resolve(target.transferControlToOffscreen());
    } catch (error) {
      reject(error);
      notifyClosed();
    }
  });

  // 短めの間隔でポーリングする: ネイティブの閉じるボタンで閉じられた場合、
  // 'pagehide'/'unload' がすぐに届かないブラウザがあり、その間 renderer が
  // 破棄済みの canvas に対して毎フレーム描画を試みてエラーを吐き続けてしまう。
  const pollId = window.setInterval(() => {
    if (!popup || popup.closed) {
      window.clearInterval(pollId);
      notifyClosed();
    }
  }, 120);

  return {
    canvas,
    close: () => {
      window.clearInterval(pollId);
      popup?.close();
      notifyClosed();
    },
    onClosed: callback => {
      if (closed) {
        callback();
        return;
      }
      closeCallbacks.add(callback);
    },
  };
}
