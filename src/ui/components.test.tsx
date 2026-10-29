import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Text } from './components';
import { fonts } from './theme';

it('uses the bundled rounded font and picks the bold face for heavy text', async () => {
  await render(
    <>
      <Text>本文</Text>
      <Text style={[{ fontSize: 14 }, { fontWeight: '600' }]}>ボタン</Text>
    </>,
  );
  expect(StyleSheet.flatten(screen.getByText('本文').props.style)).toMatchObject({ fontFamily: fonts.regular });
  expect(StyleSheet.flatten(screen.getByText('ボタン').props.style)).toMatchObject({
    fontFamily: fonts.bold,
    fontWeight: 'normal',
    fontSize: 14,
  });
});
