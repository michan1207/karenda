/**
 * アプリの中からの通信を数える。このアプリは通信しないので 0 のまま（設定の「プライバシー」に出す）。
 * fetch は XMLHttpRequest の上で動くので、XMLHttpRequest と WebSocket を見れば足りる
 */
let attempts = 0;
let watching = false;

// 開発中（Expo Go）は同じネットワークの開発用サーバーとやりとりするので、その分は数えない
const LOCAL = /^(https?|wss?):\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

function record(url: unknown) {
  if (__DEV__ && LOCAL.test(String(url))) return;
  attempts++;
}

/** 起動してすぐ呼ぶ */
export function watchNetwork(): void {
  if (watching) return;
  watching = true;
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: Parameters<typeof open>) {
    record(args[1]);
    return open.apply(this, args);
  };
  const Socket = globalThis.WebSocket;
  globalThis.WebSocket = class extends Socket {
    constructor(...args: ConstructorParameters<typeof WebSocket>) {
      record(args[0]);
      super(...args);
    }
  };
}

/** アプリを開いてから、外へ通信しようとした回数 */
export const outboundCount = () => attempts;
