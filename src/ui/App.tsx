import { SafeAreaProvider } from 'react-native-safe-area-context';

import CalendarScreen from './CalendarScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <CalendarScreen />
    </SafeAreaProvider>
  );
}
