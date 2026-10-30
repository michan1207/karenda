import { registerRootComponent } from 'expo';

import { watchNetwork } from './src/data';
import App from './src/ui/App';

// 外への通信を数え始める（設定の「プライバシー」に出す）
watchNetwork();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
