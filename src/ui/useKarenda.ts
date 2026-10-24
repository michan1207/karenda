import { useCallback, useEffect, useState } from 'react';

import {
  addPeriodStart,
  CalendarSource,
  Database,
  deleteAllData,
  dismissAlert,
  exportData,
  getKeywords,
  getZoneSettings,
  isOnboarded,
  listDismissedAlerts,
  listPeriodStarts,
  removePeriodStart,
  setKeywords as saveKeywords,
  setOnboarded,
  setZoneSettings as saveZoneSettings,
} from '../data';
import { DateKey, DEFAULT_KEYWORDS, DEFAULT_ZONE_SETTINGS, RiskKeywords, ZoneSettings } from '../engine';

export type Access = 'checking' | 'granted' | 'denied';

export type KarendaDeps = {
  loadDatabase: () => Promise<Database>;
  calendar: CalendarSource;
};

/** 画面どうしで共有する、端末内データとカレンダー許可の状態 */
export type Karenda = {
  status: 'loading' | 'ready' | 'error';
  onboarded: boolean;
  access: Access;
  calendar: CalendarSource;
  starts: DateKey[];
  settings: ZoneSettings;
  keywords: RiskKeywords;
  dismissed: Set<string>;
  finishOnboarding(): Promise<void>;
  addStart(day: DateKey): Promise<void>;
  removeStart(day: DateKey): Promise<void>;
  setSettings(settings: ZoneSettings): Promise<void>;
  setKeywords(keywords: RiskKeywords): Promise<void>;
  dismiss(eventId: string, date: DateKey): Promise<void>;
  exportJson(): Promise<string>;
  deleteAll(): Promise<void>;
};

export function useKarenda({ loadDatabase, calendar }: KarendaDeps): Karenda {
  const [db, setDb] = useState<Database | null>(null);
  const [status, setStatus] = useState<Karenda['status']>('loading');
  const [onboarded, setOnboardedState] = useState(false);
  const [access, setAccess] = useState<Access>('checking');
  const [starts, setStarts] = useState<DateKey[]>([]);
  const [settings, setSettingsState] = useState<ZoneSettings>(DEFAULT_ZONE_SETTINGS);
  const [keywords, setKeywordsState] = useState<RiskKeywords>(DEFAULT_KEYWORDS);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const reload = useCallback(async (opened: Database) => {
    const [loadedOnboarded, loadedStarts, loadedSettings, loadedKeywords, loadedDismissed] = await Promise.all([
      isOnboarded(opened),
      listPeriodStarts(opened),
      getZoneSettings(opened),
      getKeywords(opened),
      listDismissedAlerts(opened),
    ]);
    setOnboardedState(loadedOnboarded);
    setStarts(loadedStarts);
    setSettingsState(loadedSettings);
    setKeywordsState(loadedKeywords);
    setDismissed(loadedDismissed);
    return loadedOnboarded;
  }, []);

  const requestAccess = useCallback(async () => {
    try {
      setAccess((await calendar.requestAccess()) ? 'granted' : 'denied');
    } catch {
      setAccess('denied');
    }
  }, [calendar]);

  useEffect(() => {
    let active = true;
    loadDatabase()
      .then(async (opened) => {
        if (!active) return;
        setDb(opened);
        const done = await reload(opened);
        if (!active) return;
        setStatus('ready');
        // はじめての案内で説明してから許可を求める。案内が済んでいれば起動時に確認する
        if (done) await requestAccess();
      })
      .catch(() => active && setStatus('error'));
    return () => {
      active = false;
    };
  }, [loadDatabase, reload, requestAccess]);

  const withDb = useCallback(
    async (task: (opened: Database) => Promise<void>) => {
      if (!db) return;
      await task(db);
      await reload(db);
    },
    [db, reload],
  );

  return {
    status,
    onboarded,
    access,
    calendar,
    starts,
    settings,
    keywords,
    dismissed,
    finishOnboarding: async () => {
      await withDb(setOnboarded);
      await requestAccess();
    },
    addStart: (day) => withDb((opened) => addPeriodStart(opened, day)),
    removeStart: (day) => withDb((opened) => removePeriodStart(opened, day)),
    setSettings: (next) => withDb((opened) => saveZoneSettings(opened, next)),
    setKeywords: (next) => withDb((opened) => saveKeywords(opened, next)),
    dismiss: (eventId, date) => withDb((opened) => dismissAlert(opened, eventId, date)),
    exportJson: async () => (db ? JSON.stringify(await exportData(db), null, 2) : ''),
    deleteAll: () => withDb(deleteAllData),
  };
}
