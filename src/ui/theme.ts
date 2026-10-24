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
    red: '#b4234a',
    yellow: '#946200',
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
    red: '#ff8fa8',
    yellow: '#f0c35a',
  },
};

export type Colors = (typeof palette)['light'];

export function useColors(): Colors {
  return palette[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
