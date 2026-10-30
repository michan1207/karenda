import { useCallback, useEffect, useState } from 'react';

import {
  addPeriodStart,
  CalendarSource,
  Database,
  deleteAllData,
  dismissAlert,
  exportData,
  isReviewAsked,
  listPeriodStarts,
  loadState,
  Notifier,
  removePeriodStart,
  ReviewPrompt,
  setKeywords as saveKeywords,
  setNotifyEnabled,
  setOnboarded,
  setReviewAsked,
  setZoneSettings as saveZoneSettings,
  StoredState,
} from '../data';
import { DateKey, DEFAULT_KEYWORDS, DEFAULT_ZONE_SETTINGS, RiskKeywords, shouldAskReview, ZoneSettings } from '../engine';

export type Access = 'checking' | 'granted' | 'denied';

export type KarendaDeps = {
  loadDatabase: () => Promise<Database>;
  calendar: CalendarSource;
  notifier: Notifier;
  askReview: ReviewPrompt;
};

/** 画面どうしで共有する、端末内データとカレンダー許可の状態 */
export type Karenda = StoredState & {
  status: 'loading' | 'ready' | 'error';
  access: Access;
  calendar: CalendarSource;
  notifier: Notifier;
  /** 端末の通知の許可 */
  notifyAccess: Access;
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

const INITIAL_STATE: StoredState = {
  onboarded: false,
  notifyEnabled: true,
  starts: [],
  settings: DEFAULT_ZONE_SETTINGS,
  keywords: DEFAULT_KEYWORDS,
  dismissed: new Set(),
};

export function useKarenda({ loadDatabase, calendar, notifier, askReview }: KarendaDeps): Karenda {
  const [db, setDb] = useState<Database | null>(null);
  const [status, setStatus] = useState<Karenda['status']>('loading');
  const [access, setAccess] = useState<Access>('checking');
  const [notifyAccess, setNotifyAccess] = useState<Access>('checking');
  const [stored, setStored] = useState<StoredState>(INITIAL_STATE);

  const reload = useCallback(async (opened: Database) => {
    const loaded = await loadState(opened);
    setStored(loaded);
    return loaded;
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
          if (loaded.notifyEnabled) await requestNotifyAccess();
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
    ...stored,
    status,
    access,
    calendar,
    notifier,
    notifyAccess,
    finishOnboarding: async () => {
      await withDb(setOnboarded);
      await requestAccess();
      await requestNotifyAccess();
    },
    addStart: (day) =>
      withDb(async (opened) => {
        await addPeriodStart(opened, day);
        if ((await isReviewAsked(opened)) || !shouldAskReview(await listPeriodStarts(opened), day)) return;
        await setReviewAsked(opened);
        // 記録はもう済んでいるので、お願いが出せなくても止めない
        await askReview().catch(() => {});
      }),
    removeStart: (day) => withDb((opened) => removePeriodStart(opened, day)),
    setSettings: (next) => withDb((opened) => saveZoneSettings(opened, next)),
    setKeywords: (next) => withDb((opened) => saveKeywords(opened, next)),
    setNotify: async (enabled) => {
      await withDb((opened) => setNotifyEnabled(opened, enabled));
      if (enabled) await requestNotifyAccess();
    },
    dismiss: (eventId, date) => withDb((opened) => dismissAlert(opened, eventId, date)),
    exportJson: async () => (db ? JSON.stringify(await exportData(db), null, 2) : ''),
    deleteAll: async () => {
      await withDb(deleteAllData);
      // 案内からやり直しになると予約の組み直しが止まるので、予定名入りの予約をここで消す
      await notifier.replaceAll([]);
    },
  };
}
