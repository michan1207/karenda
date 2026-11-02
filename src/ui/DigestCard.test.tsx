import { render, screen } from '@testing-library/react-native';

import type { ConflictAlert } from '../engine';
import { DigestCard } from './DigestCard';
import { dayTitle } from './format';

it('reads an event without a title as untitled, not as empty quotes', async () => {
  const alert = { eventId: 'e', date: '2026-11-12', title: '', grade: 'A' } as ConflictAlert;
  await render(
    <DigestCard
      digest={{ month: '2026-11', conflicts: [alert], topThree: [alert], unreviewedCount: 0, isEmpty: false }}
      isThisMonth
      month={11}
      onPick={jest.fn()}
      openAlerts={jest.fn()}
      nextMonth={jest.fn()}
    />,
  );
  expect(screen.getByLabelText(`「（タイトルなし）」${dayTitle('2026-11-12')} A 要注意`)).toBeTruthy();
});
