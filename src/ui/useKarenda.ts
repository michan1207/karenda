import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import {
  addPeriodStart,
  BackupFiles,
  CalendarSource,
  Database,
  deleteAllData,
  dismissAlert,
  encryptBackup,
  ExportedData,
  exportData,
  isReviewAsked,
  listPeriodStarts,
  loadState,
  Notifier,
  removePeriodStart,
  restoreData,
  RestoreMode,
  ReviewPrompt,
  setHideMode as saveHideMode,
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
  files: BackupFiles;
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
  setHideMode(on: boolean): Promise<void>;
  dismiss(eventId: string, date: DateKey): Promise<void>;
  /** パスワードで鍵をかけたバックアップを作り、共有メニューで渡す。平文で書き出す道は作らない */
  exportBackup(passphrase: string, today: DateKey): Promise<void>;
  /** バックアップのファイルを選んでもらう。やめた時は null */
  pickBackup(): Promise<string | null>;
  restoreBackup(data: ExportedData, mode: RestoreMode): Promise<void>;
  deleteAll(): Promise<void>;
};

const INITIAL_STATE: StoredState = {
  onboarded: false,
  notifyEnabled: true,
  hideMode: false,
  starts: [],
  settings: DEFAULT_ZONE_SETTINGS,
  keywords: DEFAULT_KEYWORDS,
  dismissed: new Set(),
};

export function useKarenda({ loadDatabase, calendar, notifier, askReview, files }: KarendaDeps): Karenda {
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

  // 設定アプリで許可を変えて戻った時に読み直す。戻るたびに確認画面は出さない
  const { onboarded, notifyEnabled } = stored;
  useEffect(() => {
    if (status !== 'ready' || !onboarded) return;
    const subscription = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      setAccess((await calendar.hasAccess().catch(() => false)) ? 'granted' : 'denied');
      if (notifyEnabled) setNotifyAccess((await notifier.hasAccess().catch(() => false)) ? 'granted' : 'denied');
    });
    return () => subscription.remove();
  }, [status, onboarded, notifyEnabled, calendar, notifier]);

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
    setHideMode: (on) => withDb((opened) => saveHideMode(opened, on)),
    dismiss: (eventId, date) => withDb((opened) => dismissAlert(opened, eventId, date)),
    exportBackup: async (passphrase, today) => {
      if (!db) return;
      const started = Date.now();
      const file = await encryptBackup(JSON.stringify(await exportData(db)), passphrase);
      // 鍵を作る回数を決めるため、開発中だけ iPhone でかかった時間を残す
      if (__DEV__) console.log(`[backup] 暗号化 ${Date.now() - started}ms`);
      await files.share(file, `cocomia-backup-${today}.json`);
    },
    pickBackup: () => files.pick(),
    restoreBackup: (data, mode) => withDb((opened) => restoreData(opened, data, mode)),
    deleteAll: async () => {
      await withDb(deleteAllData);
      // 案内からやり直しになると予約の組み直しが止まるので、予定名入りの予約をここで消す
      await notifier.replaceAll([]);
    },
  };
}
