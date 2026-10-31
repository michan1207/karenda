import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BANNED_PHRASES } from '../engine/wording';
import { migrate } from './migrations';
import { CALENDAR_NOTE, PRIVACY_FACTS, STORED_DATA } from './privacy';
import { createTestDatabase } from './testDatabase';

// 通信するコードが無いことは src/noNetwork.test.ts と ESLint で確かめている
describe('privacy facts', () => {
  it('lists exactly the tables this app keeps on the phone', async () => {
    const db = createTestDatabase();
    await migrate(db);
    const rows = await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
    expect(rows.map((row) => row.name).sort()).toEqual(STORED_DATA.map((data) => data.table).sort());
  });

  it('states facts without absolute claims', () => {
    const texts = [CALENDAR_NOTE, ...PRIVACY_FACTS.flatMap((f) => [f.label, f.value, f.note]), ...STORED_DATA.flatMap((d) => [d.what, d.why])];
    for (const text of texts) {
      for (const rule of BANNED_PHRASES) expect(text).not.toMatch(rule.pattern);
      expect(text).not.toMatch(/安全/);
    }
  });

  it('uses no analytics, ads, crash reporting or remote update packages', () => {
    const { dependencies } = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const sdk = /analytics|firebase|sentry|amplitude|mixpanel|segment|appsflyer|adjust|branch|ads|admob|facebook|bugsnag|crashlytics|datadog|newrelic|expo-updates|expo-insights/;
    expect(Object.keys(dependencies).filter((name) => sdk.test(name))).toEqual([]);
  });
});
