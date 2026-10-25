import { shouldAskReview } from './review';

describe('shouldAskReview', () => {
  it('asks once two cycles are recorded and the newest start was just added', () => {
    expect(shouldAskReview(['2026-08-31', '2026-09-28', '2026-10-26'], '2026-10-26')).toBe(true);
  });

  it('waits until there are two full cycles', () => {
    expect(shouldAskReview(['2026-09-28', '2026-10-26'], '2026-10-26')).toBe(false);
  });

  it('does not ask while filling in older history', () => {
    expect(shouldAskReview(['2026-08-31', '2026-09-28', '2026-10-26'], '2026-08-31')).toBe(false);
  });
});
