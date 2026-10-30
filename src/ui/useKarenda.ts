import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  answerReview as saveReviewAnswer,
  Authenticator,
  BackupFiles,
  CalendarSource,
  Database,
  deleteAllData,
  dismissConsult as saveConsultDismissed,
  encryptBackup,
  ExportedData,
  getZoneSettings,
  exportData,
  isReviewAsked,
  listPeriodStarts,
  loadState,
  Notifier,
  MetricProps,
  recordMetric,
  recordPeriodStart,
  removePeriodStart,
  removeTitleWeight,
  saveConflictStatus,
  saveTitleWeight,
  restoreData,
  RestoreMode,
  ReviewPrompt,
  setHideMode as saveHideMode,
  setKeywords as saveKeywords,
  setMetricsEnabled,
  setLockEnabled as saveLockEnabled,
  setNotifyEnabled,
  setOnboarded,
  setPmsManual as savePmsManual,
  setReviewAsked,
  setZoneSettings as saveZoneSettings,
  StoredState,
} from '../data';
import {
  advanceStatus,
  buildReport,
  Answer,
  DateKey,
  DEFAULT_KEYWORDS,
  DEFAULT_PMS,
  DEFAULT_ZONE_SETTINGS,
  overrideWeight,
  Resolution,
  ReviewTarget,
  RiskKeywords,
  shouldAskReview,
  statusOf,
  TitleWeight,
  Weight,
  ZoneSettings,
} from '../engine';

export type Access = 'checking' | 'granted' | 'denied';

export type KarendaDeps = {
  loadDatabase: () => Promise<Database>;
  calendar: CalendarSource;
  notifier: Notifier;
  askReview: ReviewPrompt;
  files: BackupFiles;
  authenticator: Authenticator;
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
  /** 保存してある設定に重ねる。自動の時に PMS の手動の日数を推定で上書きしないため */
  setSettings(patch: Partial<ZoneSettings>): Promise<void>;
  /** PMS の日数を手動で決めるか、記録からの推定（たまるまで7日前）にするか */
  setPmsManual(manual: boolean): Promise<void>;
  setKeywords(keywords: RiskKeywords): Promise<void>;
  /** 覚えた重さを自分で直す。以後の答えでは変わらない */
  setTitleWeight(entry: TitleWeight, weight: Weight): Promise<void>;
  /** 覚えた重さを忘れて、言葉の決まりに戻す */
  removeTitleWeight(term: string): Promise<void>;
  /** 予定のあとの「どうだった？」に答える。null は「答えない」 */
  answerReview(target: ReviewTarget, answer: Answer | null): Promise<void>;
  setNotify(enabled: boolean): Promise<void>;
  setHideMode(on: boolean): Promise<void>;
  setMetrics(on: boolean): Promise<void>;
  /** 利用状況をこの端末に記録する（オフの時は何もしない）。予定の名前や日付は入れない */
  track(name: string, props?: MetricProps): void;
  authenticator: Authenticator;
  /** ロックがオンで、まだ本人確認が済んでいない */
  locked: boolean;
  unlock(): Promise<void>;
  /** オンにする時は先に本人確認をし、通らなければオンにしない（false を返す） */
  setLock(on: boolean): Promise<boolean>;
  /** 受診の目安カードを閉じる。その月（YYYY-MM）はもう出さない */
  dismissConsult(month: string): Promise<void>;
  /** 「わかった」。未確認のお知らせを確認済みにする */
  dismiss(eventId: string, date: DateKey): Promise<void>;
  /** 何をしたかを付けて対応済みにする。未確認なら確認済みを経てから進める */
  resolve(eventId: string, date: DateKey, resolution: Resolution): Promise<void>;
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
  lockEnabled: false,
  metricsEnabled: true,
  resolutions: [],
  starts: [],
  settings: DEFAULT_ZONE_SETTINGS,
  pms: DEFAULT_PMS,
  accuracy: buildReport([]),
  consultDismissed: null,
  keywords: DEFAULT_KEYWORDS,
  titleWeights: [],
  reviewed: new Set(),
  statuses: new Map(),
};

export function useKarenda({ loadDatabase, calendar, notifier, askReview, files, authenticator }: KarendaDeps): Karenda {
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
    const granted = await calendar.requestAccess().catch(() => false);
    setAccess(granted ? 'granted' : 'denied');
    return granted;
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

  const [unlocked, setUnlocked] = useState(false);
  const locked = stored.lockEnabled && !unlocked;
  const lockedRef = useRef(locked);
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  const unlock = useCallback(async () => {
    // iPhone のパスコードが外された時は、締め出さずに開ける（記録を守る鍵が iPhone 側に無いため）
    if (!(await authenticator.isAvailable().catch(() => false))) return setUnlocked(true);
    if (await authenticator.authenticate().catch(() => false)) setUnlocked(true);
  }, [authenticator]);

  // 開いた時に一度だけ、こちらから本人確認を出す
  const askedAtStart = useRef(false);
  useEffect(() => {
    if (status !== 'ready' || !locked || askedAtStart.current) return;
    askedAtStart.current = true;
    void unlock();
  }, [status, locked, unlock]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      // Face ID の画面は一時的に inactive にするだけなので、background に入った時だけ鍵をかける
      if (state === 'background') setUnlocked(false);
      else if (state === 'active' && lockedRef.current) void unlock();
    });
    return () => subscription.remove();
  }, [unlock]);

  const track = useCallback(
    (name: string, props: MetricProps = {}) => {
      // 数え忘れても使い方には関わらないので、失敗しても止めない
      if (db) recordMetric(db, name, props).catch(() => {});
    },
    [db],
  );

  // 通知のボタンで答えた分を残す
  useEffect(() => {
    if (!db) return;
    return notifier.onReviewAnswer((target, answer) => {
      saveReviewAnswer(db, target, answer)
        .then(() => reload(db))
        .catch(() => {});
    });
  }, [db, notifier, reload]);

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
      track('onboarding_completed');
      track('calendar_permission_result', { granted: await requestAccess() });
      await requestNotifyAccess();
    },
    addStart: (day) =>
      withDb(async (opened) => {
        await recordPeriodStart(opened, day);
        await recordMetric(opened, 'period_recorded', { source: 'app' });
        if ((await isReviewAsked(opened)) || !shouldAskReview(await listPeriodStarts(opened), day)) return;
        await setReviewAsked(opened);
        // 記録はもう済んでいるので、お願いが出せなくても止めない
        await askReview().catch(() => {});
      }),
    removeStart: (day) => withDb((opened) => removePeriodStart(opened, day)),
    setSettings: (patch) => withDb(async (opened) => saveZoneSettings(opened, { ...(await getZoneSettings(opened)), ...patch })),
    setPmsManual: (manual) => withDb((opened) => savePmsManual(opened, manual)),
    setKeywords: (next) => withDb((opened) => saveKeywords(opened, next)),
    setTitleWeight: (entry, weight) => withDb((opened) => saveTitleWeight(opened, overrideWeight(entry, entry.label, weight))),
    removeTitleWeight: (term) => withDb((opened) => removeTitleWeight(opened, term)),
    answerReview: (target, answer) => withDb((opened) => saveReviewAnswer(opened, target, answer)),
    setNotify: async (enabled) => {
      await withDb((opened) => setNotifyEnabled(opened, enabled));
      if (enabled) await requestNotifyAccess();
    },
    setHideMode: (on) => withDb((opened) => saveHideMode(opened, on)),
    dismissConsult: (month) => withDb((opened) => saveConsultDismissed(opened, month)),
    setMetrics: (on) => withDb((opened) => setMetricsEnabled(opened, on)),
    track,
    authenticator,
    locked,
    unlock,
    setLock: async (on) => {
      if (on) {
        // 本当に確かめられるかを先に試す。通ったら今は開いたままにする
        if (!(await authenticator.authenticate().catch(() => false))) return false;
        setUnlocked(true);
      }
      await withDb((opened) => saveLockEnabled(opened, on));
      return true;
    },
    dismiss: (eventId, date) =>
      withDb(async (opened) => {
        const current = statusOf(stored.statuses, eventId, date);
        if (current.state !== 'unreviewed') return;
        await saveConflictStatus(opened, eventId, date, advanceStatus(current, 'acknowledged'));
        await recordMetric(opened, 'conflict_acknowledged');
      }),
    resolve: (eventId, date, resolution) =>
      withDb(async (opened) => {
        let current = statusOf(stored.statuses, eventId, date);
        if (current.state === 'unreviewed') current = advanceStatus(current, 'acknowledged');
        await saveConflictStatus(opened, eventId, date, advanceStatus(current, 'resolved', resolution));
        await recordMetric(opened, 'conflict_resolved', { resolution });
      }),
    exportBackup: async (passphrase, today) => {
      if (!db) return;
      const started = Date.now();
      const file = await encryptBackup(JSON.stringify(await exportData(db)), passphrase);
      // 鍵を作る回数を決めるため、開発中だけ iPhone でかかった時間を残す
      if (__DEV__) console.log(`[backup] 暗号化 ${Date.now() - started}ms`);
      await files.share(file, `cocomia-backup-${today}.json`);
      track('export_created');
    },
    pickBackup: () => files.pick(),
    restoreBackup: (data, mode) =>
      withDb(async (opened) => {
        await restoreData(opened, data, mode);
        await recordMetric(opened, 'import_completed', { mode });
      }),
    deleteAll: async () => {
      await withDb(deleteAllData);
      // 案内からやり直しになると予約の組み直しが止まるので、予定名入りの予約をここで消す
      await notifier.replaceAll([]);
    },
  };
}
