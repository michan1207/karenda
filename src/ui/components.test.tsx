import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Input, Text } from './components';
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

it('gives every input the same field look and lets a screen add to it', async () => {
  await render(<Input accessibilityLabel="欄" placeholder="入れる" style={{ flex: 1 }} />);
  const field = screen.getByLabelText('欄');
  expect(StyleSheet.flatten(field.props.style)).toMatchObject({ fontFamily: fonts.regular, fontSize: 15, borderWidth: 1, flex: 1 });
  expect(field.props.placeholderTextColor).toBeTruthy();
});
