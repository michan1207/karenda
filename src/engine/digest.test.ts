import type { ConflictAlert } from './conflicts';
import { statusKey } from './conflictState';
import { monthlyDigest } from './digest';

const alert = (eventId: string, date: string, score: number): ConflictAlert => ({
  eventId,
  event: { id: eventId, title: eventId, start: date, end: date, allDay: false },
  title: eventId,
  date,
  grade: score >= 70 ? 'A' : 'B',
  score,
  reasons: ['phaseMostSevere'],
  reasonText: '理由',
  risk: 'high',
  impact: 'mitigable',
  message: '提案',
});

describe('monthlyDigest', () => {
  const alerts = [
    alert('late', '2026-10-31', 60),
    alert('next', '2026-11-01', 100),
    alert('last', '2026-09-30', 100),
    alert('top', '2026-10-20', 100),
    alert('low', '2026-10-05', 40),
    alert('mid', '2026-10-12', 70),
    alert('done', '2026-10-15', 90),
  ];
  const statuses = new Map([
    [statusKey('done', '2026-10-15'), { state: 'resolved' as const, resolution: 'shifted' as const }],
    [statusKey('mid', '2026-10-12'), { state: 'acknowledged' as const, resolution: null }],
  ]);

  it('keeps only this month, leaves out what was dealt with, and puts the hardest first', () => {
    const digest = monthlyDigest(alerts, '2026-10', statuses);
    expect(digest.conflicts.map((a) => a.eventId)).toEqual(['top', 'mid', 'late', 'low']);
    expect(digest.topThree.map((a) => a.eventId)).toEqual(['top', 'mid', 'late']);
    expect(digest).toMatchObject({ month: '2026-10', unreviewedCount: 3, isEmpty: false });
  });

  it('is empty for a month without clashes', () => {
    expect(monthlyDigest(alerts, '2026-12', statuses)).toEqual({
      month: '2026-12',
      conflicts: [],
      topThree: [],
      unreviewedCount: 0,
      isEmpty: true,
    });
  });
});
