import { addDays } from '../engine/date';
import { learnWeight, overrideWeight } from '../engine/learning';
import { DEFAULT_PMS } from '../engine/pms';
import { DEFAULT_KEYWORDS } from '../engine/risk';
import { DEFAULT_ZONE_SETTINGS } from '../engine/zones';
import type { Database } from './database';
import { migrate, SCHEMA_VERSION } from './migrations';
import {
  addManualEvent,
  addPeriodStart,
  answerReview,
  deferAlert,
  deleteAllData,
  dismissConsult,
  getConflictStatuses,
  getConsultDismissed,
  isMetricsEnabled,
  listMetricEvents,
  listResolutions,
  recordMetric,
  setMetricsEnabled,
  exportData,
  getKeywords,
  getZoneSettings,
  isDismissed,
  saveConflictStatus,
  isHideMode,
  isLockEnabled,
  isNotifyEnabled,
  isOnboarded,
  isReviewAsked,
  listPeriodStarts,
  listPredictionRecords,
  listReviewed,
  listTitleWeights,
  loadState,
  readExport,
  recordPeriodStart,
  removeManualEvent,
  removePeriodStart,
  removeTitleWeight,
  restoreData,
  saveTitleWeight,
  setHideMode,
  setKeywords,
  setLockEnabled,
  setNotifyEnabled,
  setOnboarded,
  setPmsManual,
  setReviewAsked,
  setZoneSettings,
} from './store';
import { createTestDatabase } from './testDatabase';

let db: Database;

beforeEach(async () => {
  db = createTestDatabase();
  await migrate(db);
});

describe('migrate', () => {
  it('records the schema version and seeds defaults', async () => {
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: SCHEMA_VERSION });
    expect(await getZoneSettings(db)).toEqual(DEFAULT_ZONE_SETTINGS);
    expect(await getKeywords(db)).toEqual(DEFAULT_KEYWORDS);
  });

  it('is safe to run again and keeps existing data', async () => {
    await addPeriodStart(db, '2026-10-01');
    await setZoneSettings(db, { heavyDays: 4, pmsDays: 5 });
    await migrate(db);
    expect(await listPeriodStarts(db)).toEqual(['2026-10-01']);
    expect(await getZoneSettings(db)).toEqual({ heavyDays: 4, pmsDays: 5 });
  });

  it('refuses a database written by a newer app version', async () => {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    await expect(migrate(db)).rejects.toThrow('newer');
  });
});

describe('period starts', () => {
  it('stores dates sorted and without duplicates', async () => {
    await addPeriodStart(db, '2026-10-01');
    await addPeriodStart(db, '2026-09-03');
    await addPeriodStart(db, '2026-10-01');
    expect(await listPeriodStarts(db)).toEqual(['2026-09-03', '2026-10-01']);
  });

  it('removes a date', async () => {
    await addPeriodStart(db, '2026-10-01');
    await removePeriodStart(db, '2026-10-01');
    expect(await listPeriodStarts(db)).toEqual([]);
  });

  it('rejects an invalid date', async () => {
    await expect(addPeriodStart(db, '2026-13-01')).rejects.toThrow();
    expect(await listPeriodStarts(db)).toEqual([]);
  });
});

describe('settings', () => {
  it('rejects zone settings outside the allowed range', async () => {
    await expect(setZoneSettings(db, { heavyDays: 0, pmsDays: 7 })).rejects.toThrow();
    expect(await getZoneSettings(db)).toEqual(DEFAULT_ZONE_SETTINGS);
  });

  it('replaces keywords, trimming blanks and preferring high on duplicates', async () => {
    await setKeywords(db, { high: [' 出張 ', '発表会'], medium: ['ヨガ', '', '発表会'] });
    expect(await getKeywords(db)).toEqual({ high: ['出張', '発表会'], medium: ['ヨガ'] });
  });
});

describe('onboarding', () => {
  it('remembers that the first-run guide was finished until all data is deleted', async () => {
    expect(await isOnboarded(db)).toBe(false);
    await setOnboarded(db);
    expect(await isOnboarded(db)).toBe(true);
    await deleteAllData(db);
    expect(await isOnboarded(db)).toBe(false);
  });

  it('remembers that a review was asked for', async () => {
    expect(await isReviewAsked(db)).toBe(false);
    await setReviewAsked(db);
    expect(await isReviewAsked(db)).toBe(true);
  });
});

describe('usage records kept on this phone', () => {
  it('records events while on, stops when turned off, and is cleared with all data', async () => {
    const now = new Date('2026-10-30T03:00:00Z');
    expect(await isMetricsEnabled(db)).toBe(true);
    await recordMetric(db, 'period_recorded', { source: 'app' }, now);
    await setMetricsEnabled(db, false);
    await recordMetric(db, 'export_created', {}, now);
    expect(await listMetricEvents(db)).toEqual([
      { name: 'period_recorded', props: { source: 'app' }, occurredAt: '2026-10-30T03:00:00.000Z' },
    ]);
    await deleteAllData(db);
    expect(await listMetricEvents(db)).toEqual([]);
    expect(await isMetricsEnabled(db)).toBe(true);
  });

  it('lists what was done for alerts, with when', async () => {
    await saveConflictStatus(db, 'a', '2026-10-27', { state: 'resolved', resolution: 'prepared' }, new Date('2026-10-26T01:00:00Z'));
    await saveConflictStatus(db, 'b', '2026-10-28', { state: 'acknowledged', resolution: null });
    expect(await listResolutions(db)).toEqual([{ resolution: 'prepared', at: '2026-10-26T01:00:00.000Z' }]);
  });
});

describe('notification setting', () => {
  it('is on by default and can be turned off', async () => {
    expect(await isNotifyEnabled(db)).toBe(true);
    await setNotifyEnabled(db, false);
    expect(await isNotifyEnabled(db)).toBe(false);
    await setNotifyEnabled(db, true);
    expect(await isNotifyEnabled(db)).toBe(true);
  });
});

describe('hide mode', () => {
  it('is off by default, can be turned on, and is cleared with all data', async () => {
    expect(await isHideMode(db)).toBe(false);
    await setHideMode(db, true);
    expect(await isHideMode(db)).toBe(true);
    expect((await loadState(db)).hideMode).toBe(true);
    await deleteAllData(db);
    expect(await isHideMode(db)).toBe(false);
  });
});

describe('consult card', () => {
  it('remembers the month it was closed until all data is deleted', async () => {
    expect(await getConsultDismissed(db)).toBeNull();
    await dismissConsult(db, '2026-10');
    expect((await loadState(db)).consultDismissed).toBe('2026-10');
    await deleteAllData(db);
    expect(await getConsultDismissed(db)).toBeNull();
  });
});

describe('"今日は決めない" on a notification', () => {
  it('keeps only the first reminder day per event, until all data is deleted', async () => {
    await deferAlert(db, 'trip', '2026-10-27', '2026-10-21');
    await deferAlert(db, 'trip', '2026-10-27', '2026-10-22');
    expect((await loadState(db)).deferrals).toEqual(new Map([['trip|2026-10-27', '2026-10-21']]));
    await deleteAllData(db);
    expect((await loadState(db)).deferrals.size).toBe(0);
  });
});

describe('events put in this app only', () => {
  it('keeps them apart from calendar events, and removes them by id or with all data', async () => {
    await addManualEvent(db, { title: ' 発表 ', date: '2026-10-27', weight: 'heavy', color: 'orange', startMinutes: 840, durationMinutes: 90 });
    await addManualEvent(db, { title: '面談', date: '2026-10-20', weight: 'normal', color: 'blue' });
    const { manualEvents } = await loadState(db);
    expect(manualEvents).toEqual([
      { id: 'manual:2', title: '面談', start: '2026-10-20', end: '2026-10-20', allDay: false, manual: true, weight: 'normal', color: 'blue' },
      {
        id: 'manual:1',
        title: '発表',
        start: '2026-10-27',
        end: '2026-10-27',
        allDay: false,
        manual: true,
        weight: 'heavy',
        color: 'orange',
        startMinutes: 840,
        durationMinutes: 90,
      },
    ]);
    // カレンダーの予定のIDでは消さない
    await removeManualEvent(db, '2');
    await removeManualEvent(db, 'manual:2');
    expect((await loadState(db)).manualEvents.map((event) => event.title)).toEqual(['発表']);
    await deleteAllData(db);
    expect((await loadState(db)).manualEvents).toEqual([]);
  });

  it('rejects an empty name, a broken date, an unknown color or a time outside the day', async () => {
    const event = { title: '発表', date: '2026-10-27', weight: 'heavy', color: 'blue' } as const;
    await expect(addManualEvent(db, { ...event, title: '  ' })).rejects.toThrow();
    await expect(addManualEvent(db, { ...event, date: '2026-13-01' })).rejects.toThrow();
    await expect(addManualEvent(db, { ...event, color: 'pink' as never })).rejects.toThrow();
    await expect(addManualEvent(db, { ...event, startMinutes: 24 * 60 })).rejects.toThrow();
    await expect(addManualEvent(db, { ...event, startMinutes: 600, durationMinutes: 0 })).rejects.toThrow();
  });
});

describe('app lock', () => {
  it('is off by default, can be turned on, and is cleared with all data', async () => {
    expect(await isLockEnabled(db)).toBe(false);
    await setLockEnabled(db, true);
    expect((await loadState(db)).lockEnabled).toBe(true);
    await deleteAllData(db);
    expect(await isLockEnabled(db)).toBe(false);
  });
});

describe('dismissed alerts', () => {
  it('remembers the state of each alert per event and date', async () => {
    await saveConflictStatus(db, 'ev1', '2026-10-27', { state: 'acknowledged', resolution: null });
    await saveConflictStatus(db, 'ev2', '2026-10-28', { state: 'resolved', resolution: 'shifted' });
    const statuses = await getConflictStatuses(db);
    expect(statuses.get('ev2|2026-10-28')).toEqual({ state: 'resolved', resolution: 'shifted' });
    expect(isDismissed(statuses, 'ev1', '2026-10-27')).toBe(true);
    expect(isDismissed(statuses, 'ev1', '2026-11-24')).toBe(false);
  });

  it('keeps alerts closed with the old "わかった" as acknowledged after updating', async () => {
    const old = createTestDatabase();
    await old.execAsync(`
      CREATE TABLE dismissed_alerts (event_id TEXT NOT NULL, date TEXT NOT NULL, PRIMARY KEY (event_id, date));
      INSERT INTO dismissed_alerts (event_id, date) VALUES ('ev1', '2026-10-27');
      PRAGMA user_version = 1;
    `);
    await migrate(old);
    expect((await getConflictStatuses(old)).get('ev1|2026-10-27')).toEqual({ state: 'acknowledged', resolution: null });
    expect(await old.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'dismissed_alerts'")).toBeNull();
  });
});

describe('title weights', () => {
  it('keeps answers per title, judges only with decided ones, and forgets them on remove or delete all', async () => {
    const heavy = learnWeight(learnWeight(undefined, '役員会議', 'hard', 'pms'), '役員会議', 'hard', 'pms');
    const pending = learnWeight(undefined, '社員旅行', 'easy', 'period');
    await saveTitleWeight(db, heavy, new Date('2026-10-01T00:00:00Z'));
    await saveTitleWeight(db, pending, new Date('2026-10-02T00:00:00Z'));
    expect(await listTitleWeights(db)).toEqual([pending, heavy]);
    expect([...(await loadState(db)).keywords.learned!]).toEqual([['役員会議', 'heavy']]);

    await saveTitleWeight(db, overrideWeight(heavy, heavy.label, 'normal'));
    expect([...(await loadState(db)).keywords.learned!]).toEqual([['役員会議', 'normal']]);

    await removeTitleWeight(db, '役員会議');
    expect((await loadState(db)).keywords.learned!.size).toBe(0);
    await deleteAllData(db);
    expect(await listTitleWeights(db)).toEqual([]);
  });
});

describe('answers after an event', () => {
  const target = (eventId: string, date: string) => ({ eventId, title: '役員会議', date, phase: 'pms' as const, risk: 'medium' as const });

  it('learns from answers, not from skips, and counts each event once', async () => {
    await answerReview(db, target('a', '2026-10-20'), null);
    expect(await listTitleWeights(db)).toEqual([]);
    await answerReview(db, target('b', '2026-10-21'), 'hard');
    await answerReview(db, target('b', '2026-10-21'), 'hard');
    expect(await listTitleWeights(db)).toMatchObject([{ term: '役員会議', weight: null, observations: 1 }]);
    await answerReview(db, target('c', '2026-10-22'), 'hard');
    expect((await loadState(db)).keywords.learned!.get('役員会議')).toBe('heavy');
    expect(await listReviewed(db)).toEqual(new Set(['a|2026-10-20', 'b|2026-10-21', 'c|2026-10-22']));

    await deleteAllData(db);
    expect((await listReviewed(db)).size).toBe(0);
  });
});

describe('PMS length', () => {
  const STARTS = ['2026-05-04', '2026-06-01', '2026-06-29', '2026-07-27', '2026-08-24', '2026-09-21'];

  /** どの周期も10日前と2日前が「きつかった」、12日前は「平気だった」 */
  async function answerCycles() {
    for (const start of STARTS) {
      await addPeriodStart(db, start);
      for (const [n, answer] of [[2, 'hard'], [10, 'hard'], [12, 'easy']] as const) {
        const target = { eventId: `${start}-${n}`, title: '会議', date: addDays(start, -n), phase: 'pms' as const, risk: 'medium' as const };
        await answerReview(db, target, answer);
      }
    }
  }

  it('stays at 7 days until the records show it, then switches from that day on', async () => {
    expect((await loadState(db)).pms).toEqual(DEFAULT_PMS);
    await answerCycles();
    const state = await loadState(db, new Date(2026, 9, 1, 12));
    expect(state.pms).toEqual({ daysBefore: 10, source: 'auto', observations: 6, appliedFrom: '2026-10-01', before: 7 });
    expect(state.settings).toEqual({ heavyDays: 3, pmsDays: 10, pmsBefore: { until: '2026-10-01', days: 7 } });
    // 読み直しても使い始めた日は変わらない。手動の日数（書き出しに入る）も変えない
    expect((await loadState(db, new Date(2026, 9, 20, 12))).pms.appliedFrom).toBe('2026-10-01');
    expect(await getZoneSettings(db)).toEqual(DEFAULT_ZONE_SETTINGS);
  });

  it('keeps a manual length, starting from the current one, until switched back', async () => {
    await answerCycles();
    await loadState(db, new Date(2026, 9, 1, 12));
    await setPmsManual(db, true);
    expect((await loadState(db)).pms).toMatchObject({ daysBefore: 10, source: 'manual', appliedFrom: null });
    await setZoneSettings(db, { heavyDays: 3, pmsDays: 12 });
    expect((await loadState(db)).settings).toEqual({ heavyDays: 3, pmsDays: 12 });

    await setPmsManual(db, false);
    expect((await loadState(db, new Date(2026, 9, 20, 12))).pms).toEqual({
      daysBefore: 10,
      source: 'auto',
      observations: 6,
      appliedFrom: '2026-10-20',
      before: 12,
    });
  });

  it('treats a length changed before this version as manual, and resets with delete all', async () => {
    await setZoneSettings(db, { heavyDays: 3, pmsDays: 5 });
    expect((await loadState(db)).pms).toMatchObject({ daysBefore: 5, source: 'manual' });
    await deleteAllData(db);
    expect((await loadState(db)).pms).toEqual(DEFAULT_PMS);
  });
});

describe('prediction records', () => {
  /** 28日ごとの記録。次は 10-26（±1日）の予測 */
  async function regular() {
    for (const start of ['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28']) await addPeriodStart(db, start);
    await loadState(db, new Date(2026, 8, 28, 12));
  }

  it('compares the waiting prediction once when the next start is recorded', async () => {
    await regular();
    expect(await listPredictionRecords(db)).toEqual([
      { basedOn: '2026-09-28', predictedStart: '2026-10-26', earliest: '2026-10-25', latest: '2026-10-27', confidence: 'medium', actualStart: null, absErrorDays: null },
    ]);
    await recordPeriodStart(db, '2026-10-28');
    await recordPeriodStart(db, '2026-10-28');
    const state = await loadState(db, new Date(2026, 9, 28, 12));
    expect(state.accuracy).toEqual({
      n: 1,
      meanAbsErrorDays: null,
      within1DayRate: null,
      latest: { predictedStart: '2026-10-26', actualStart: '2026-10-28', errorDays: 2 },
    });
    // 次の予測が待っている
    expect((await listPredictionRecords(db)).map((r) => [r.basedOn, r.actualStart])).toEqual([
      ['2026-09-28', '2026-10-28'],
      ['2026-10-28', null],
    ]);
  });

  it('never rewrites a compared prediction when the prediction changes later', async () => {
    await regular();
    await recordPeriodStart(db, '2026-10-28');
    await loadState(db, new Date(2026, 9, 28, 12));
    const [compared] = await listPredictionRecords(db);
    await recordPeriodStart(db, '2026-06-01');
    await loadState(db, new Date(2026, 9, 29, 12));
    expect((await listPredictionRecords(db))[0]).toEqual(compared);
  });

  it('puts a prediction back to waiting when the start it was compared with is removed', async () => {
    await regular();
    await recordPeriodStart(db, '2026-10-28');
    await loadState(db, new Date(2026, 9, 28, 12));
    await removePeriodStart(db, '2026-10-28');
    expect(await listPredictionRecords(db)).toMatchObject([{ basedOn: '2026-09-28', actualStart: null, absErrorDays: null }]);
    await recordPeriodStart(db, '2026-10-27');
    expect(await listPredictionRecords(db)).toMatchObject([{ actualStart: '2026-10-27', absErrorDays: 1 }]);
  });

  it('does not compare when a period seems unrecorded, or old starts are entered later', async () => {
    await regular();
    await recordPeriodStart(db, '2026-11-23');
    expect(await listPredictionRecords(db)).toEqual([]);

    await deleteAllData(db);
    await loadState(db, new Date(2026, 9, 31, 12));
    await recordPeriodStart(db, '2026-08-03');
    await loadState(db, new Date(2026, 9, 31, 12));
    await recordPeriodStart(db, '2026-08-31');
    expect((await loadState(db, new Date(2026, 9, 31, 12))).accuracy.n).toBe(0);
    expect(await listPredictionRecords(db)).toEqual([]);
  });

  it('is cleared with all data', async () => {
    await regular();
    await deleteAllData(db);
    expect(await listPredictionRecords(db)).toEqual([]);
  });
});

describe('loadState', () => {
  it('reads everything the screens show in one call', async () => {
    await setOnboarded(db);
    await setNotifyEnabled(db, false);
    await addPeriodStart(db, '2026-10-01');
    await saveConflictStatus(db, 'ev1', '2026-10-27', { state: 'acknowledged', resolution: null });
    const state = await loadState(db);
    expect(state).toMatchObject({
      onboarded: true,
      notifyEnabled: false,
      starts: ['2026-10-01'],
      settings: DEFAULT_ZONE_SETTINGS,
      keywords: DEFAULT_KEYWORDS,
    });
    expect(isDismissed(state.statuses, 'ev1', '2026-10-27')).toBe(true);
  });
});

describe('export and delete', () => {
  it('exports records and settings as JSON-ready data', async () => {
    await addPeriodStart(db, '2026-10-01');
    const data = await exportData(db, new Date('2026-10-24T00:00:00Z'));
    expect(data).toEqual({
      app: 'karenda',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-10-24T00:00:00.000Z',
      periodStarts: ['2026-10-01'],
      zoneSettings: DEFAULT_ZONE_SETTINGS,
      keywords: DEFAULT_KEYWORDS,
    });
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });

  it('deletes everything and restores defaults', async () => {
    await addPeriodStart(db, '2026-10-01');
    await setZoneSettings(db, { heavyDays: 5, pmsDays: 3 });
    await setKeywords(db, { high: ['ヨガ'], medium: [] });
    await saveConflictStatus(db, 'ev1', '2026-10-27', { state: 'acknowledged', resolution: null });
    await deleteAllData(db);
    expect(await listPeriodStarts(db)).toEqual([]);
    expect(await getZoneSettings(db)).toEqual(DEFAULT_ZONE_SETTINGS);
    expect(await getKeywords(db)).toEqual(DEFAULT_KEYWORDS);
    expect((await getConflictStatuses(db)).size).toBe(0);
  });

  it('rolls back a failed transaction', async () => {
    await addPeriodStart(db, '2026-10-01');
    await expect(
      db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM period_starts');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await listPeriodStarts(db)).toEqual(['2026-10-01']);
  });

  it('runs overlapping transactions one after the other, so neither is half done', async () => {
    await Promise.all([
      setKeywords(db, { high: ['面接'], medium: [] }),
      setKeywords(db, { high: ['試験'], medium: ['会議'] }),
    ]);
    expect(await getKeywords(db)).toEqual({ high: ['試験'], medium: ['会議'] });
  });
});

describe('reading an exported file back', () => {
  const exported = async () => JSON.stringify(await exportData(db));

  it('restores records and settings exactly after everything was deleted', async () => {
    await addPeriodStart(db, '2026-09-01');
    await addPeriodStart(db, '2026-09-29');
    await setZoneSettings(db, { heavyDays: 5, pmsDays: 3 });
    await setKeywords(db, { high: ['ヨガ'], medium: ['会議'] });
    const before = await loadState(db);
    const file = await exported();

    await deleteAllData(db);
    const read = readExport(file);
    if (!read.ok) throw new Error(read.reason);
    await restoreData(db, read.data, 'replace');

    const after = await loadState(db);
    expect(after.starts).toEqual(before.starts);
    expect(after.settings).toEqual(before.settings);
    expect(after.keywords).toEqual(before.keywords);
  });

  it('can add the file’s records to the ones already here, keeping these settings', async () => {
    await addPeriodStart(db, '2026-08-04');
    const file = await exported();
    await deleteAllData(db);
    await addPeriodStart(db, '2026-09-01');
    await setZoneSettings(db, { heavyDays: 4, pmsDays: 5 });

    const read = readExport(file);
    if (!read.ok) throw new Error(read.reason);
    await restoreData(db, read.data, 'keepMine');
    expect(await listPeriodStarts(db)).toEqual(['2026-08-04', '2026-09-01']);
    expect(await getZoneSettings(db)).toEqual({ heavyDays: 4, pmsDays: 5 });
  });

  it('can add the file’s records and take its settings', async () => {
    await setZoneSettings(db, { heavyDays: 2, pmsDays: 10 });
    await addPeriodStart(db, '2026-08-04');
    const file = await exported();
    await deleteAllData(db);
    await addPeriodStart(db, '2026-09-01');

    const read = readExport(file);
    if (!read.ok) throw new Error(read.reason);
    await restoreData(db, read.data, 'preferFile');
    expect(await listPeriodStarts(db)).toEqual(['2026-08-04', '2026-09-01']);
    expect(await getZoneSettings(db)).toEqual({ heavyDays: 2, pmsDays: 10 });
    expect((await loadState(db)).pms).toMatchObject({ daysBefore: 10, source: 'manual' });
  });

  it.each([
    ['not JSON', 'こんにちは', 'broken'],
    ['another app', JSON.stringify({ app: 'other' }), 'notCocomia'],
    ['a newer app', JSON.stringify({ app: 'karenda', schemaVersion: SCHEMA_VERSION + 1 }), 'newer'],
    ['an impossible date', JSON.stringify({ app: 'karenda', schemaVersion: 1, periodStarts: ['2026-02-30'], zoneSettings: DEFAULT_ZONE_SETTINGS, keywords: DEFAULT_KEYWORDS }), 'broken'],
    ['settings out of range', JSON.stringify({ app: 'karenda', schemaVersion: 1, periodStarts: [], zoneSettings: { heavyDays: 0, pmsDays: 7 }, keywords: DEFAULT_KEYWORDS }), 'broken'],
    ['keywords that are not lists of words', JSON.stringify({ app: 'karenda', schemaVersion: 1, periodStarts: [], zoneSettings: DEFAULT_ZONE_SETTINGS, keywords: { high: 'ヨガ' } }), 'broken'],
  ])('refuses %s and says why', (_, text, reason) => {
    expect(readExport(text)).toEqual({ ok: false, reason });
  });

  it('changes nothing when restoring fails halfway', async () => {
    await addPeriodStart(db, '2026-09-01');
    const bad = { ...(await exportData(db)), periodStarts: ['2026-08-04', '2026-02-30'] };
    await expect(restoreData(db, bad, 'replace')).rejects.toThrow();
    expect(await listPeriodStarts(db)).toEqual(['2026-09-01']);
  });
});
