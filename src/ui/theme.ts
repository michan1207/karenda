import { useColorScheme } from 'react-native';

// 値と役割は AMIEL_DESIGN_SYSTEM.md §3。地色・文字・線は Amicuna 流の温かい色（v1.2.0）
const palette = {
  light: {
    background: '#fdf6f8',
    surface: '#ffffff',
    text: '#3b2a40',
    muted: '#7a6570',
    line: '#eadbe3',
    accent: '#7a4f9a',
    onAccent: '#ffffff',
    heavy: '#f7d9e2',
    pms: '#e6dcf3',
    rose: '#c44c74',
    roseSoft: '#fceef3',
    alertStrong: '#4a5ead',
    alertStrongSoft: '#e7eaf9',
    alertMild: '#7a5100',
    alertMildSoft: '#faf1e0',
    danger: '#b4234a',
    disabledSurface: '#f4eef2',
    // 黒ではなくプラム色の、やわらかい影
    shadow: '0px 4px 12px #5a3a5e1f',
  },
  dark: {
    background: '#17141c',
    surface: '#211d28',
    text: '#ece8f1',
    muted: '#a59db0',
    line: '#352f3f',
    accent: '#c9a3e8',
    onAccent: '#17141c',
    heavy: '#4a2833',
    pms: '#3a2f4b',
    rose: '#f28fb0',
    roseSoft: '#33222d',
    alertStrong: '#8d9ace',
    alertStrongSoft: '#262a3d',
    alertMild: '#f0c35a',
    alertMildSoft: '#332a1a',
    danger: '#ff8fa8',
    disabledSurface: '#2b2633',
    shadow: '0px 4px 12px #0b081066',
  },
};

export type Colors = (typeof palette)['light'];

// 文字・余白・角丸のスケール（AMIEL_DESIGN_SYSTEM.md §4〜5）
export const fontSize = { display: 32, title: 22, heading: 17, bodyLarge: 16, label: 15, body: 14, small: 13, caption: 12 } as const;
export const fontWeight = { regular: '400', semibold: '600', bold: '700' } as const;
export const space = { hair: 2, xs: 4, sm: 6, md: 8, lg: 12, card: 14, xl: 16, xxl: 24 } as const;
export const radius = { xs: 4, sm: 8, md: 12, lg: 16, pill: 999 } as const;
// 丸ゴシック（Zen Maru Gothic、OFL）。assets/fonts に同梱し、外から取らない
export const fonts = { regular: 'ZenMaruGothic-Regular', bold: 'ZenMaruGothic-Bold' } as const;

export function useColors(): Colors {
  return palette[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
