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
  isNotifyEnabled,
  isOnboarded,
  listDismissedAlerts,
  listPeriodStarts,
  Notifier,
  removePeriodStart,
  setKeywords as saveKeywords,
  setNotifyEnabled,
  setOnboarded,
  setZoneSettings as saveZoneSettings,
} from '../data';
import { DateKey, DEFAULT_KEYWORDS, DEFAULT_ZONE_SETTINGS, RiskKeywords, ZoneSettings } from '../engine';

export type Access = 'checking' | 'granted' | 'denied';

export type KarendaDeps = {
  loadDatabase: () => Promise<Database>;
  calendar: CalendarSource;
  notifier: Notifier;
};

/** 画面どうしで共有する、端末内データとカレンダー許可の状態 */
export type Karenda = {
  status: 'loading' | 'ready' | 'error';
  onboarded: boolean;
  access: Access;
  calendar: CalendarSource;
  notifier: Notifier;
  /** 設定でお知らせ通知を使うか */
  notifyEnabled: boolean;
  /** 端末の通知の許可 */
  notifyAccess: Access;
  starts: DateKey[];
  settings: ZoneSettings;
  keywords: RiskKeywords;
  dismissed: Set<string>;
  finishOnboarding(): Promise<void>;
  addStart(day: DateKey): Promise<void>;
  removeStart(day: DateKey): Promise<void>;
  setSettings(settings: ZoneSettings): Promise<void>;
  setKeywords(keywords: RiskKeywords): Promise<void>;
  setNotify(enabled: boolean): Promise<void>;
  dismiss(eventId: string, date: DateKey): Promise<void>;
  exportJson(): Promise<string>;
  deleteAll(): Promise<void>;
};

export function useKarenda({ loadDatabase, calendar, notifier }: KarendaDeps): Karenda {
  const [db, setDb] = useState<Database | null>(null);
  const [status, setStatus] = useState<Karenda['status']>('loading');
  const [onboarded, setOnboardedState] = useState(false);
  const [access, setAccess] = useState<Access>('checking');
  const [notifyEnabled, setNotifyEnabledState] = useState(true);
  const [notifyAccess, setNotifyAccess] = useState<Access>('checking');
  const [starts, setStarts] = useState<DateKey[]>([]);
  const [settings, setSettingsState] = useState<ZoneSettings>(DEFAULT_ZONE_SETTINGS);
  const [keywords, setKeywordsState] = useState<RiskKeywords>(DEFAULT_KEYWORDS);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const reload = useCallback(async (opened: Database) => {
    const [loadedOnboarded, loadedNotify, loadedStarts, loadedSettings, loadedKeywords, loadedDismissed] = await Promise.all([
      isOnboarded(opened),
      isNotifyEnabled(opened),
      listPeriodStarts(opened),
      getZoneSettings(opened),
      getKeywords(opened),
      listDismissedAlerts(opened),
    ]);
    setOnboardedState(loadedOnboarded);
    setNotifyEnabledState(loadedNotify);
    setStarts(loadedStarts);
    setSettingsState(loadedSettings);
    setKeywordsState(loadedKeywords);
    setDismissed(loadedDismissed);
    return { onboarded: loadedOnboarded, notify: loadedNotify };
  }, []);

  const requestAccess = useCallback(async () => {
    try {
      setAccess((await calendar.requestAccess()) ? 'granted' : 'denied');
    } catch {
      setAccess('denied');
    }
  }, [calendar]);

  const requestNotifyAccess = useCallback(async () => {
    try {
      setNotifyAccess((await notifier.requestAccess()) ? 'granted' : 'denied');
    } catch {
      setNotifyAccess('denied');
    }
  }, [notifier]);

  useEffect(() => {
    let active = true;
    loadDatabase()
      .then(async (opened) => {
        if (!active) return;
        setDb(opened);
        const loaded = await reload(opened);
        if (!active) return;
        setStatus('ready');
        // はじめての案内で説明してから許可を求める。案内が済んでいれば起動時に確認する
        if (loaded.onboarded) {
          await requestAccess();
          if (loaded.notify) await requestNotifyAccess();
        }
      })
      .catch(() => active && setStatus('error'));
    return () => {
      active = false;
    };
  }, [loadDatabase, reload, requestAccess, requestNotifyAccess]);

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
    notifier,
    notifyEnabled,
    notifyAccess,
    starts,
    settings,
    keywords,
    dismissed,
    finishOnboarding: async () => {
      await withDb(setOnboarded);
      await requestAccess();
      await requestNotifyAccess();
    },
    addStart: (day) => withDb((opened) => addPeriodStart(opened, day)),
    removeStart: (day) => withDb((opened) => removePeriodStart(opened, day)),
    setSettings: (next) => withDb((opened) => saveZoneSettings(opened, next)),
    setKeywords: (next) => withDb((opened) => saveKeywords(opened, next)),
    setNotify: async (enabled) => {
      await withDb((opened) => setNotifyEnabled(opened, enabled));
      if (enabled) await requestNotifyAccess();
    },
    dismiss: (eventId, date) => withDb((opened) => dismissAlert(opened, eventId, date)),
    exportJson: async () => (db ? JSON.stringify(await exportData(db), null, 2) : ''),
    deleteAll: () => withDb(deleteAllData),
  };
}
