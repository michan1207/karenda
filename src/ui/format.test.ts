import { gradeLabel, titleOf } from './format';

it('names the grades the same way on every screen', () => {
  expect(gradeLabel('A')).toBe('A 要注意');
  expect(gradeLabel('B')).toBe('B 注意');
});

it('shows a placeholder for an event without a title', () => {
  expect(titleOf('会議')).toBe('会議');
  expect(titleOf('')).toBe('（タイトルなし）');
});
