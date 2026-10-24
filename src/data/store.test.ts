import { DEFAULT_KEYWORDS } from '../engine/risk';
import { DEFAULT_ZONE_SETTINGS } from '../engine/zones';
import type { Database } from './database';
import { migrate, SCHEMA_VERSION } from './migrations';
import {
  addPeriodStart,
  deleteAllData,
  dismissAlert,
  exportData,
  getKeywords,
  getZoneSettings,
  isDismissed,
  isOnboarded,
  listDismissedAlerts,
  listPeriodStarts,
  removePeriodStart,
  setKeywords,
  setOnboarded,
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
});

describe('dismissed alerts', () => {
  it('remembers dismissed alerts per event and date', async () => {
    await dismissAlert(db, 'ev1', '2026-10-27');
    await dismissAlert(db, 'ev1', '2026-10-27');
    const dismissed = await listDismissedAlerts(db);
    expect(isDismissed(dismissed, 'ev1', '2026-10-27')).toBe(true);
    expect(isDismissed(dismissed, 'ev1', '2026-11-24')).toBe(false);
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
    await dismissAlert(db, 'ev1', '2026-10-27');
    await deleteAllData(db);
    expect(await listPeriodStarts(db)).toEqual([]);
    expect(await getZoneSettings(db)).toEqual(DEFAULT_ZONE_SETTINGS);
    expect(await getKeywords(db)).toEqual(DEFAULT_KEYWORDS);
    expect((await listDismissedAlerts(db)).size).toBe(0);
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
