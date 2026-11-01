import { DEFAULT_KEYWORDS } from './risk';
import { computeGuard } from './guard';
import { DEFAULT_ZONE_SETTINGS } from './zones';

const base = {
  settings: DEFAULT_ZONE_SETTINGS,
  keywords: DEFAULT_KEYWORDS,
  events: [{ id: 'e', title: '出張', start: '2026-10-27', end: '2026-10-27', allDay: false }],
  range: { from: '2026-10-01', until: '2026-10-31' },
  today: '2026-10-01',
};

it('has no zones or alerts without records', () => {
  expect(computeGuard({ ...base, starts: [] })).toMatchObject({ prediction: null, zones: new Map(), alerts: [] });
});

it('plans what to do for an alert once, with days to move to outside the shown range', () => {
  // 表示する期間は 10月だけでも、別の日は 11月から探せる
  const guard = computeGuard({
    ...base,
    starts: ['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28'],
    events: [{ id: 'm', title: '定例会議', start: '2026-10-26', end: '2026-10-26', allDay: false }],
  });
  const [alert] = guard.alerts;
  const actions = guard.actionsOf(alert);
  expect(actions.filter((action) => action.kind === 'suggestAltDate').map((action) => action.kind === 'suggestAltDate' && action.date)).toEqual([
    '2026-11-03',
    '2026-10-17',
    '2026-11-04',
  ]);
  expect(guard.actionsOf(alert)).toBe(actions);
});

it('combines prediction, zones and alerts', () => {
  const guard = computeGuard({ ...base, starts: ['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28'] });
  expect(guard.prediction?.averageLength).toBe(28);
  expect(guard.zones.get('2026-10-26')?.zone).toBe('heavy');
  expect(guard.alerts).toHaveLength(1);
  expect(guard.alerts[0].grade).toBe('A');
});

it('keeps warning about events while the period is late, until a start is recorded', () => {
  const starts = ['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28'];
  const trip = { ...base, events: [{ id: 'e', title: '出張', start: '2026-11-05', end: '2026-11-05', allDay: false }], range: { from: '2026-10-01', until: '2026-11-30' } };
  // 次は 10-25〜10-27 の予測。その前は 11-05 の出張は何もない
  expect(computeGuard({ ...trip, starts, today: '2026-10-20' }).alerts).toEqual([]);
  // 10-27 を過ぎても記録が無い → 遅れているだけかもしれない
  const late = computeGuard({ ...trip, starts, today: '2026-10-30' }).alerts;
  expect(late).toHaveLength(1);
  expect(late[0].reasons).toContain('phasePeriodEdge');
  // 開始日を記録すれば、その日から数え直す
  expect(computeGuard({ ...trip, starts: [...starts, '2026-10-29'], today: '2026-10-30' }).alerts).toEqual([]);
});

it('colours past recorded periods too, so earlier months show them', () => {
  const guard = computeGuard({ ...base, starts: ['2026-08-03', '2026-08-31', '2026-09-28'], range: { from: '2026-08-01', until: '2026-08-31' } });
  expect(guard.zones.get('2026-08-04')).toMatchObject({ zone: 'heavy', periodDay: 2, predicted: false });
});
