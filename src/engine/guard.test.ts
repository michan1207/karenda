import { DEFAULT_KEYWORDS } from './risk';
import { computeGuard } from './guard';
import { DEFAULT_ZONE_SETTINGS } from './zones';

const base = {
  settings: DEFAULT_ZONE_SETTINGS,
  keywords: DEFAULT_KEYWORDS,
  events: [{ id: 'e', title: '出張', start: '2026-10-27', end: '2026-10-27', allDay: false }],
  range: { from: '2026-10-01', until: '2026-10-31' },
};

it('has no zones or alerts without records', () => {
  expect(computeGuard({ ...base, starts: [] })).toEqual({ prediction: null, zones: new Map(), alerts: [] });
});

it('combines prediction, zones and alerts', () => {
  const guard = computeGuard({ ...base, starts: ['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28'] });
  expect(guard.prediction?.averageLength).toBe(28);
  expect(guard.zones.get('2026-10-26')?.zone).toBe('heavy');
  expect(guard.alerts).toHaveLength(1);
  expect(guard.alerts[0].level).toBe('red');
});

it('colours past recorded periods too, so earlier months show them', () => {
  const guard = computeGuard({ ...base, starts: ['2026-08-03', '2026-08-31', '2026-09-28'], range: { from: '2026-08-01', until: '2026-08-31' } });
  expect(guard.zones.get('2026-08-04')).toMatchObject({ zone: 'heavy', periodDay: 2, predicted: false });
});
