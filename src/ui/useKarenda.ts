import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  addManualEvent as saveManualEvent,
  answerReview as saveReviewAnswer,
  applyDecision,
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
  ManualEventInput,
  Notifier,
  MetricProps,
  recordMetric,
  recordPeriodStart,
  removeManualEvent as deleteManualEvent,
  removePeriodStart,
  saveDailyCheck,
  setPeriodEnd as savePeriodEnd,
  setShifted as saveShifted,
  removeTitleWeight,
  saveTitleWeight,
  restoreData,
  RestoreMode,
  ReviewPrompt,
  setHideMode as saveHideMode,
  setKeywords as saveKeywords,
  setMetricsEnabled,
  setLockEnabled as saveLockEnabled,
  setNotifyEnabled,
  setSoonEnabled,
  setCalendarSkipped,
  setOnboarded,
  setPmsManual as savePmsManual,
  setReviewAsked,
  setZoneSettings as saveZoneSettings,
  StoredState,
} from '../data';
import {
  addDays,
  buildReport,
  Answer,
  DailyCheck,
  DateKey,
  DEFAULT_KEYWORDS,
  DEFAULT_PMS,
  DEFAULT_ZONE_SETTINGS,
  overrideWeight,
  Resolution,
  ReviewTarget,
  RiskKeywords,
  shouldAskReview,
  TitleWeight,
  toDateKey,
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
  /** Android の「アラームとリマインダー」（通知を時刻ちょうどに出す）がオンか。iPhone と、まだ読んでいない時は null */
  exactAlarm: boolean | null;
  /** 保存に失敗した。次に保存できるか、閉じるまで案内を出す */
  saveFailed: boolean;
  dismissSaveFailed(): void;
  /** 通知の「代替日を見る」を押した回数。増えたらお知らせを開く */
  alertsRequested: number;
  /** アプリに戻ってきた回数。増えたらカレンダーの予定を読み直す */
  resumed: number;
  /** 案内を終える。カレンダーを使うなら許可を求め、「今はしない」なら求めない（どちらも通知の許可は求める） */
  finishOnboarding(useCalendar: boolean): Promise<void>;
  /** 「今はしない」にしていたカレンダーを使い始める。許可されたら true */
  enableCalendar(): Promise<boolean>;
  addStart(day: DateKey): Promise<void>;
  removeStart(day: DateKey): Promise<void>;
  /** 生理の終わりの日を残す。null で消す */
  setPeriodEnd(start: DateKey, end: DateKey | null): Promise<void>;
  /** 薬（ピルなど）で時期をずらした生理の印をつける・外す */
  setShifted(start: DateKey, shifted: boolean): Promise<void>;
  /** このアプリの中だけに予定を入れる（iPhone のカレンダーには書かない） */
  addManualEvent(event: ManualEventInput): Promise<void>;
  removeManualEvent(eventId: string): Promise<void>;
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
  /** その日の体調を残す（同じ日は書き換える）。answer が null は「答えない」 */
  saveCheck(check: DailyCheck): Promise<void>;
  setNotify(enabled: boolean): Promise<void>;
  /** 予定の30分前にも知らせるか */
  setSoon(enabled: boolean): Promise<void>;
  /** 「アラームとリマインダー」の設定を開く（オン・オフは使う人が決める） */
  openExactAlarm(): Promise<void>;
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
  soonEnabled: true,
  hideMode: false,
  lockEnabled: false,
  metricsEnabled: true,
  resolutions: [],
  starts: [],
  ends: new Map(),
  notes: { shifted: new Set() },
  settings: DEFAULT_ZONE_SETTINGS,
  pms: DEFAULT_PMS,
  accuracy: buildReport([]),
  consultDismissed: null,
  deferrals: new Map(),
  manualEvents: [],
  calendarSkipped: false,
  keywords: DEFAULT_KEYWORDS,
  titleWeights: [],
  reviewed: new Set(),
  checks: new Map(),
  statuses: new Map(),
};

export function useKarenda({ loadDatabase, calendar, notifier, askReview, files, authenticator }: KarendaDeps): Karenda {
  const [db, setDb] = useState<Database | null>(null);
  const [status, setStatus] = useState<Karenda['status']>('loading');
  const [access, setAccess] = useState<Access>('checking');
  const [notifyAccess, setNotifyAccess] = useState<Access>('checking');
  const [exactAlarm, setExactAlarm] = useState<boolean | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [stored, setStored] = useState<StoredState>(INITIAL_STATE);
  const [alertsRequested, setAlertsRequested] = useState(0);
  const [resumed, setResumed] = useState(0);

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
    setNotifyAccess((await notifier.requestAccess().catch(() => false)) ? 'granted' : 'denied');
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
        // はじめての案内で説明してから許可を求める。案内が済んでいれば起動時に確認する。
        // 「今はしない」にした人には、開くたびに確認画面を出さない（いまの許可だけ見る）
        if (loaded.onboarded) {
          if (loaded.calendarSkipped) setAccess((await calendar.hasAccess().catch(() => false)) ? 'granted' : 'denied');
          else await requestAccess();
          if (loaded.notifyEnabled) await requestNotifyAccess();
        }
      })
      .catch(() => active && setStatus('error'));
    return () => {
      active = false;
    };
  }, [loadDatabase, reload, requestAccess, requestNotifyAccess, calendar]);

  // 「アラームとリマインダー」は設定アプリでしか変えられないので、開いた時と戻った時に読む
  const readExactAlarm = useCallback(async () => setExactAlarm(await notifier.exactAlarm().catch(() => null)), [notifier]);
  useEffect(() => {
    if (status !== 'ready') return;
    let active = true;
    notifier
      .exactAlarm()
      .then((on) => active && setExactAlarm(on))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [status, notifier]);

  // 設定アプリで許可を変えて戻った時に読み直す。戻るたびに確認画面は出さない
  // 離れている間にカレンダーアプリで予定が変わることがあるので、予定も読み直す
  const { onboarded, notifyEnabled } = stored;
  useEffect(() => {
    if (status !== 'ready' || !onboarded) return;
    const subscription = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      setAccess((await calendar.hasAccess().catch(() => false)) ? 'granted' : 'denied');
      setResumed((count) => count + 1);
      if (notifyEnabled) setNotifyAccess((await notifier.hasAccess().catch(() => false)) ? 'granted' : 'denied');
      await readExactAlarm();
    });
    return () => subscription.remove();
  }, [status, onboarded, notifyEnabled, calendar, notifier, readExactAlarm]);

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

  // 重なる予定の通知のボタン。確認したら確認済みに、決めないなら次の日にもう一度だけ知らせる
  useEffect(() => {
    if (!db) return;
    return notifier.onDecision((conflicts, decision) => {
      if (decision === 'alternatives') return setAlertsRequested((count) => count + 1);
      applyDecision(db, conflicts, decision === 'defer' ? { kind: 'defer', remindOn: addDays(toDateKey(new Date()), 1) } : { kind: 'acknowledge' })
        .then(() => reload(db))
        .catch(() => {});
    });
  }, [db, notifier, reload]);

  // 失敗しても今の保存内容で読み直し、画面の上に案内を出す。ボタンの多くは待たずに呼ぶので、失敗は投げ返さない
  const withDb = useCallback(
    async (task: (opened: Database) => Promise<void>) => {
      if (!db) return;
      try {
        await task(db);
        setSaveFailed(false);
      } catch {
        setSaveFailed(true);
      }
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
    exactAlarm,
    saveFailed,
    dismissSaveFailed: () => setSaveFailed(false),
    alertsRequested,
    resumed,
    finishOnboarding: async (useCalendar) => {
      await withDb(async (opened) => {
        await setOnboarded(opened);
        if (!useCalendar) await setCalendarSkipped(opened, true);
      });
      track('onboarding_completed');
      if (useCalendar) track('calendar_permission_result', { granted: await requestAccess() });
      else setAccess('denied');
      await requestNotifyAccess();
    },
    enableCalendar: async () => {
      await withDb((opened) => setCalendarSkipped(opened, false));
      const granted = await requestAccess();
      track('calendar_permission_result', { granted });
      return granted;
    },
    addStart: (day) =>
      withDb(async (opened) => {
        await recordPeriodStart(opened, day);
        track('period_recorded', { source: 'app' });
        if ((await isReviewAsked(opened)) || !shouldAskReview(await listPeriodStarts(opened), day)) return;
        await setReviewAsked(opened);
        // 記録はもう済んでいるので、お願いが出せなくても止めない
        await askReview().catch(() => {});
      }),
    removeStart: (day) => withDb((opened) => removePeriodStart(opened, day)),
    setPeriodEnd: (start, end) => withDb((opened) => savePeriodEnd(opened, start, end)),
    setShifted: (start, shifted) => withDb((opened) => saveShifted(opened, start, shifted)),
    addManualEvent: (event) => withDb((opened) => saveManualEvent(opened, event)),
    removeManualEvent: (eventId) => withDb((opened) => deleteManualEvent(opened, eventId)),
    setSettings: (patch) => withDb(async (opened) => saveZoneSettings(opened, { ...(await getZoneSettings(opened)), ...patch })),
    setPmsManual: (manual) => withDb((opened) => savePmsManual(opened, manual)),
    setKeywords: (next) => withDb((opened) => saveKeywords(opened, next)),
    setTitleWeight: (entry, weight) => withDb((opened) => saveTitleWeight(opened, overrideWeight(entry, entry.label, weight))),
    removeTitleWeight: (term) => withDb((opened) => removeTitleWeight(opened, term)),
    answerReview: (target, answer) => withDb((opened) => saveReviewAnswer(opened, target, answer)),
    saveCheck: (check) => withDb((opened) => saveDailyCheck(opened, check)),
    setNotify: async (enabled) => {
      await withDb((opened) => setNotifyEnabled(opened, enabled));
      if (enabled) await requestNotifyAccess();
    },
    setSoon: (enabled) => withDb((opened) => setSoonEnabled(opened, enabled)),
    openExactAlarm: async () => {
      // オンにした時は戻るまで待つ。アプリの情報を開いた時はすぐ戻るので、アプリに戻った時にもう一度読む
      await notifier.openExactAlarm().catch(() => {});
      await readExactAlarm();
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
        if (await applyDecision(opened, [{ eventId, date }], { kind: 'acknowledge' })) track('conflict_acknowledged');
      }),
    resolve: (eventId, date, resolution) =>
      withDb(async (opened) => {
        await applyDecision(opened, [{ eventId, date }], { kind: 'resolve', resolution });
        track('conflict_resolved', { resolution });
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
    // 失敗はバックアップの画面が自分で知らせるので、withDb を使わずに投げ返す
    restoreBackup: async (data, mode) => {
      if (!db) return;
      // try/finally だと React Compiler がこのフックごと飛ばすので、Promise の finally で読み直す
      await restoreData(db, data, mode).finally(() => reload(db));
      track('import_completed', { mode });
    },
    deleteAll: async () => {
      await withDb(deleteAllData);
      // 案内からやり直しになると予約の組み直しが止まるので、予定名入りの予約をここで消す
      await notifier.replaceAll([]);
    },
  };
}
