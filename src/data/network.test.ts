import { outboundCount, watchNetwork } from './network';

describe('watchNetwork', () => {
  it('counts attempts to reach the internet, but not the development server on the same network', () => {
    const opened: string[] = [];
    globalThis.XMLHttpRequest = class {
      open(_method: string, url: string) {
        opened.push(url);
      }
    } as never;
    globalThis.WebSocket = class {
      constructor(public url: string) {}
    } as never;
    watchNetwork();
    expect(outboundCount()).toBe(0);

    new XMLHttpRequest().open('GET', 'http://192.168.1.5:8081/symbolicate');
    expect(outboundCount()).toBe(0);
    new XMLHttpRequest().open('POST', 'https://example.com/collect');
    new WebSocket('wss://example.com/live');
    expect(outboundCount()).toBe(2);
    // 数えるだけで、通信そのものは止めない
    expect(opened).toEqual(['http://192.168.1.5:8081/symbolicate', 'https://example.com/collect']);
  });
});
