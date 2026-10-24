import { render, screen } from '@testing-library/react-native';

import HomeScreen from './HomeScreen';

it('shows the greeting and the on-device promise', async () => {
  await render(<HomeScreen />);
  expect(screen.getByText('こんにちは')).toBeTruthy();
  expect(screen.getByText('データはこのiPhoneの中だけで扱います')).toBeTruthy();
});
