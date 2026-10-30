import { DEFAULT_KEYWORDS } from '../engine/risk';
import { DEFAULT_ZONE_SETTINGS } from '../engine/zones';
import type { Database } from './database';
import { migrate, SCHEMA_VERSION } from './migrations';
import {
  addPeriodStart,
  deleteAllData,
  getConflictStatuses,
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
  loadState,
  readExport,
  removePeriodStart,
  restoreData,
  setHideMode,
  setKeywords,
  setLockEnabled,
  setNotifyEnabled,
  setOnboarded,
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
        await removePeriodStart(db, '2026-10-01');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await listPeriodStarts(db)).toEqual(['2026-10-01']);
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
