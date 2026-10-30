import { useColorScheme } from 'react-native';

// 値と役割は AMIEL_DESIGN_SYSTEM.md §3。Amicuna 流のパステル（v1.3.0）
const palette = {
  light: {
    background: '#ffeef4',
    // 画面全体の地。ピンク→ラベンダー→水色のパステル
    backdrop: 'linear-gradient(165deg, #ffe1ec 0%, #f1e4ff 55%, #e1f0ff 100%)',
    surface: '#ffffff',
    text: '#3b2a40',
    muted: '#6b5563',
    line: '#f7bfd2',
    accent: '#7a4f9a',
    onAccent: '#ffffff',
    heavy: '#ffd6e4',
    heavyEdge: '#ffecf2',
    pms: '#ece2fb',
    // リボン・主なボタン・今日の丸。白い文字を乗せる
    pink: '#c93a72',
    onPink: '#ffffff',
    pinkSoft: '#ffe0ec',
    pinkText: '#9b2f5f',
    // 飾り（文字には使わない）
    heart: '#f48fb1',
    flower: '#ffb3cb',
    sparkle: '#ffcf5c',
    alertStrong: '#4a5ead',
    alertStrongSoft: '#e7eaf9',
    alertMild: '#7a5100',
    alertMildSoft: '#faf1e0',
    danger: '#b4234a',
    disabledSurface: '#f4eef2',
    // 黒ではなくピンク寄りの、やわらかい影
    shadow: '0px 4px 14px #c93a721f',
    // このアプリに入れた予定の色（点にだけ使い、文字には使わない）。生理のピンクとは分ける
    event: { blue: '#4f7fd6', green: '#3b9a6a', orange: '#e07b35', purple: '#8d5fcf', yellow: '#d6a520', gray: '#8a8190' },
  },
  dark: {
    background: '#221a2a',
    backdrop: 'linear-gradient(165deg, #2a1a2a 0%, #221a33 55%, #172033 100%)',
    surface: '#2a2030',
    text: '#ece8f1',
    muted: '#c4b3c9',
    line: '#5a3a4e',
    accent: '#c9a3e8',
    onAccent: '#17141c',
    heavy: '#4a2833',
    heavyEdge: '#3a2530',
    pms: '#3a2f4b',
    pink: '#c93a72',
    onPink: '#ffffff',
    pinkSoft: '#3a2433',
    pinkText: '#f7a8c8',
    heart: '#f48fb1',
    flower: '#d97aa0',
    sparkle: '#e8c060',
    alertStrong: '#8d9ace',
    alertStrongSoft: '#262a3d',
    alertMild: '#f0c35a',
    alertMildSoft: '#332a1a',
    danger: '#ff8fa8',
    disabledSurface: '#352c3c',
    shadow: '0px 4px 14px #0b081066',
    event: { blue: '#86a8ec', green: '#72c79b', orange: '#f2a56c', purple: '#b896ea', yellow: '#e9c75c', gray: '#b0a7b8' },
  },
};

export type Colors = (typeof palette)['light'];

// 文字・余白・角丸のスケール（AMIEL_DESIGN_SYSTEM.md §4〜5）
export const fontSize = { display: 32, title: 22, heading: 17, bodyLarge: 16, label: 15, body: 14, small: 13, caption: 12 } as const;
export const fontWeight = { regular: '400', semibold: '600', bold: '700' } as const;
export const space = { hair: 2, xs: 4, sm: 6, md: 8, lg: 12, card: 14, xl: 16, xxl: 24 } as const;
export const radius = { xs: 4, sm: 8, md: 12, lg: 16, card: 22, pill: 999 } as const;
// 丸ゴシック（Zen Maru Gothic、OFL）。assets/fonts に同梱し、外から取らない
export const fonts = { regular: 'ZenMaruGothic-Regular', bold: 'ZenMaruGothic-Bold' } as const;

export function useColors(): Colors {
  return palette[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
