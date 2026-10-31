import { advanceStatus, statusOf, UNREVIEWED } from './conflictState';

describe('advanceStatus', () => {
  it('goes from unreviewed to acknowledged to resolved, in that order only', () => {
    const acknowledged = advanceStatus(UNREVIEWED, 'acknowledged');
    expect(acknowledged).toEqual({ state: 'acknowledged', resolution: null });
    expect(advanceStatus(acknowledged, 'resolved', 'shifted')).toEqual({ state: 'resolved', resolution: 'shifted' });
  });

  it('refuses to skip a step or go back', () => {
    expect(() => advanceStatus(UNREVIEWED, 'resolved', 'prepared')).toThrow();
    const resolved = advanceStatus(advanceStatus(UNREVIEWED, 'acknowledged'), 'resolved', 'declined');
    expect(() => advanceStatus(resolved, 'acknowledged')).toThrow();
    expect(() => advanceStatus(resolved, 'unreviewed')).toThrow();
    expect(() => advanceStatus(advanceStatus(UNREVIEWED, 'acknowledged'), 'acknowledged')).toThrow();
  });

  it('needs what was done exactly when resolving', () => {
    const acknowledged = advanceStatus(UNREVIEWED, 'acknowledged');
    expect(() => advanceStatus(acknowledged, 'resolved')).toThrow();
    expect(() => advanceStatus(UNREVIEWED, 'acknowledged', 'proceeded')).toThrow();
  });
});

describe('statusOf', () => {
  it('treats an alert with no saved state as unreviewed', () => {
    const statuses = new Map([['trip', { state: 'acknowledged' as const, resolution: null }]]);
    expect(statusOf(statuses, 'trip').state).toBe('acknowledged');
    expect(statusOf(statuses, 'talk')).toEqual(UNREVIEWED);
  });
});
