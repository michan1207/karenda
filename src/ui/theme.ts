import { useColorScheme } from 'react-native';

const palette = {
  light: {
    background: '#f7f6f9',
    surface: '#ffffff',
    text: '#26222e',
    muted: '#6c6577',
    line: '#e3dfe9',
    accent: '#7a4f9a',
    onAccent: '#ffffff',
    heavy: '#f7d9e2',
    pms: '#e6dcf3',
    alertStrong: '#4a5ead',
    alertStrongSoft: '#e7eaf9',
    alertMild: '#7a5100',
    alertMildSoft: '#faf1e0',
    danger: '#b4234a',
    rose: '#c44c74',
    roseText: '#a63d62',
    disabledSurface: '#ece9f0',
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
    alertStrong: '#8d9ace',
    alertStrongSoft: '#262a3d',
    alertMild: '#f0c35a',
    alertMildSoft: '#332a1a',
    danger: '#ff8fa8',
    rose: '#f28fb0',
    roseText: '#f28fb0',
    disabledSurface: '#2b2633',
  },
};

export type Colors = (typeof palette)['light'];

// 文字・余白・角丸のスケール（AMIEL_DESIGN_SYSTEM.md §4〜5）。値は今の画面で使っている数値そのまま
export const fontSize = { display: 32, title: 22, heading: 17, bodyLarge: 16, label: 15, body: 14, small: 13, caption: 12 } as const;
export const fontWeight = { regular: '400', semibold: '600', bold: '700' } as const;
export const space = { hair: 2, xs: 4, sm: 6, md: 8, lg: 12, card: 14, xl: 16, xxl: 24 } as const;
export const radius = { xs: 4, sm: 8, md: 12, pill: 999 } as const;

export function useColors(): Colors {
  return palette[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
