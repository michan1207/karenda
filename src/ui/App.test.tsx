import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { randomBytes } from 'node:crypto';
import { AppState, Linking, Share } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  addPeriodStart,
  answerReview,
  Authenticator,
  BackupFiles,
  CalendarSource,
  Database,
  encryptBackup,
  exportData,
  getConflictStatuses,
  getZoneSettings,
  isHideMode,
  isLockEnabled,
  isMetricsEnabled,
  listMetricEvents,
  listPeriodStarts,
  migrate,
  Notifier,
  openBackup,
  listReviewed,
  listTitleWeights,
  saveConflictStatus,
  saveTitleWeight,
  setLockEnabled,
  setOnboarded,
} from '../data';
import { createTestDatabase } from '../data/testDatabase';
import { addDays, learnWeight, type CalendarEvent, type NotificationPlan } from '../engine';
import { Main } from './App';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('expo-calendar/legacy', () => ({}));
jest.mock('expo-store-review', () => ({}));
jest.mock('expo-file-system', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-local-authentication', () => ({}));
jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(jest.requireActual('node:crypto').randomBytes(n)) }));
// 最初の1件は画面全体の読み込みを含むため、遅いPCでは既定の5秒を超える
jest.setTimeout(20_000);

// 次の生理は 10-26（ヘビー期 10-26〜28）、PMS期 10-19〜25。今日は 10-24
const REGULAR = ['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28'];
const EVENTS: CalendarEvent[] = [
  { id: 'trip', title: '福岡出張', start: '2026-10-27', end: '2026-10-27', allDay: false },
  { id: 'shop', title: '買い物', start: '2026-10-27', end: '2026-10-27', allDay: false },
  { id: 'talk', title: '企画プレゼン', start: '2026-11-20', end: '2026-11-20', allDay: false },
];

function fakeCalendar(granted: boolean, events: CalendarEvent[] = EVENTS) {
  return {
    requestAccess: jest.fn(async () => granted),
    hasAccess: jest.fn(async () => granted),
    getEvents: jest.fn(async (from: string, until: string) =>
      events.filter((event) => event.end >= from && event.start <= until),
    ),
  } satisfies CalendarSource;
}

function fakeNotifier(granted = true) {
  return {
    requestAccess: jest.fn(async () => granted),
    hasAccess: jest.fn(async () => granted),
    replaceAll: jest.fn(async (_plans: NotificationPlan[]) => {}),
    onReviewAnswer: jest.fn((_handler: Parameters<Notifier['onReviewAnswer']>[0]) => () => {}),
  } satisfies Notifier;
}

/** アプリの状態が変わった時の動き。AppState は jest の偽物なので、外されていない受け取り口を直接呼ぶ */
async function sendAppState(state: 'active' | 'background') {
  const { calls, results } = jest.mocked(AppState.addEventListener).mock;
  const handlers = calls.filter((_, i) => !results[i].value.remove.mock.calls.length).map(([, handler]) => handler);
  await act(async () => {
    for (const handler of handlers) await handler(state);
  });
}

/** ホームから戻った時の動き */
const returnToApp = () => sendAppState('active');

/** 本人確認の偽物。results の順に成功・失敗を返し、使い切ったら成功 */
function fakeAuthenticator(available = true, results: boolean[] = []) {
  return {
    isAvailable: jest.fn(async () => available),
    authenticate: jest.fn(async () => results.shift() ?? true),
  } satisfies Authenticator;
}

function fakeFiles(picked: string | null = null) {
  return {
    share: jest.fn(async (_text: string, _name: string) => {}),
    pick: jest.fn(async () => picked),
  } satisfies BackupFiles;
}

const lastPlanDates = (notifier: ReturnType<typeof fakeNotifier>) =>
  notifier.replaceAll.mock.calls
    .at(-1)?.[0]
    .filter((plan) => !plan.review)
    .map((plan) => plan.date);

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function setup({
  starts = REGULAR,
  onboarded = true,
  calendar = fakeCalendar(true),
  notifier = fakeNotifier(),
  askReview = jest.fn(async () => {}),
  today = () => '2026-10-24',
  files = fakeFiles(),
  authenticator = fakeAuthenticator(),
  lock = false,
  prepare,
}: {
  starts?: string[];
  onboarded?: boolean;
  calendar?: ReturnType<typeof fakeCalendar>;
  notifier?: ReturnType<typeof fakeNotifier>;
  askReview?: jest.Mock;
  today?: () => string;
  files?: ReturnType<typeof fakeFiles>;
  authenticator?: ReturnType<typeof fakeAuthenticator>;
  lock?: boolean;
  prepare?: (db: Database) => Promise<void>;
} = {}) {
  const db: Database = createTestDatabase();
  await migrate(db);
  if (onboarded) await setOnboarded(db);
  for (const start of starts) await addPeriodStart(db, start);
  if (lock) await setLockEnabled(db, true);
  await prepare?.(db);
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <Main
        loadDatabase={async () => db}
        calendar={calendar}
        notifier={notifier}
        askReview={askReview}
        today={today}
        files={files}
        authenticator={authenticator}
      />
    </SafeAreaProvider>,
  );
  return { db, calendar, notifier, askReview, files, authenticator };
}

describe('first run', () => {
  it('explains the app before asking for calendar access', async () => {
    const { calendar, notifier } = await setup({ onboarded: false, starts: [] });
    expect(await screen.findByText('データはこの端末の中だけ')).toBeTruthy();
    expect(calendar.requestAccess).not.toHaveBeenCalled();
    expect(notifier.requestAccess).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('はじめる'));
    expect(await screen.findByText('2026年10月')).toBeTruthy();
    expect(calendar.requestAccess).toHaveBeenCalled();
    expect(notifier.requestAccess).toHaveBeenCalled();
  });
});

describe('calendar', () => {
  it('colors the zones and marks days where events clash', async () => {
    const { calendar } = await setup();
    expect(await screen.findByLabelText('10月27日（火）、生理2日目（予測）、予定と重なっています')).toBeTruthy();
    expect(screen.getByLabelText('10月20日（火）、PMS警戒期（予測）')).toBeTruthy();
    expect(calendar.getEvents).toHaveBeenCalledWith('2026-09-28', '2026-11-01');
  });

  it('shows the events and advice for a tapped day', async () => {
    await setup();
    await fireEvent.press(await screen.findByLabelText('10月27日（火）、生理2日目（予測）、予定と重なっています'));
    expect(screen.getByText('福岡出張')).toBeTruthy();
    expect(screen.getByText(/生理2日目と重なる見込みです/)).toBeTruthy();
    // お知らせの一覧と同じ A/B をカレンダーでも出す
    expect(screen.getByText('A 要注意')).toBeTruthy();
    expect(screen.getByText('買い物')).toBeTruthy();
  });

  it('shows the feelings that the phase of the tapped day tends to bring, without naming illnesses', async () => {
    await setup();
    // 今日 10-24 は PMS警戒期
    expect(await screen.findByText('生理前に起こりやすい心の変化')).toBeTruthy();
    expect(screen.getByText(/集中力や判断力が落ちる/)).toBeTruthy();
    // 病名は診断のように読めるので出さない。相談先だけ案内する
    expect(screen.queryByText(/PMDD|双極性障害|病名/)).toBeNull();
    expect(screen.getByText(/婦人科/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('10月27日（火）、生理2日目（予測）、予定と重なっています'));
    expect(screen.getByText('生理中に起こりやすい心の変化')).toBeTruthy();
    expect(screen.queryByText(/月経困難症|うつ状態/)).toBeNull();
    await fireEvent.press(screen.getByLabelText('10月1日（木）'));
    expect(screen.getByText('生理の終わりごろ〜直後に起こりやすい心の変化')).toBeTruthy();
    expect(screen.queryByText(/貧血|自律神経失調/)).toBeNull();
    await fireEvent.press(screen.getByLabelText('10月5日（月）'));
    expect(screen.queryByText(/起こりやすい心の変化/)).toBeNull();
  });

  it('lets Mia say something different each day in every phase, with a next step', async () => {
    await setup();
    await screen.findByText(/^そろそろPMSのころかな。/);
    const phases = [
      ['そろそろPMSのころかな。', ['10月18日（日）', '10月19日（月）', '10月20日（火）', '10月21日（水）']],
      ['生理のころかな。', ['10月25日（日）', '10月26日（月）', '10月27日（火）', '10月28日（水）']],
      ['生理あけのころかな。', ['10月1日（木）', '10月2日（金）', '10月3日（土）', '10月4日（日）']],
      ['おだやかなころかな。', ['10月5日（月）', '10月6日（火）', '10月7日（水）', '10月8日（木）']],
    ] as const;
    for (const [lead, days] of phases) {
      const said = new Set<string>();
      for (const day of days) {
        await fireEvent.press(screen.getByLabelText(new RegExp(`^${day}`)));
        const line = screen.getByText(new RegExp(`^${lead}`)).props.children as string;
        expect(line).not.toMatch(/無理しないで|つらいね|休んでね|過ごしてね/);
        // 「しよっ」「しちゃお」のような縮めた言い方はしない
        expect(line).not.toMatch(/(っ|しよ|ちゃお|とこ|みよ)$/);
        // ひと目で読める短さにする
        expect(line.length - lead.length).toBeLessThanOrEqual(18);
        said.add(line);
      }
      expect(said.size).toBe(4);
    }
  });

  it('can hide everything about periods, leaving a plain calendar of events', async () => {
    const { db } = await setup();
    await screen.findByText(/^そろそろPMSのころかな。/);
    await fireEvent.press(screen.getByLabelText('生理の表示をかくす'));
    expect(screen.queryAllByText(/生理|PMS|予測|ころかな/)).toEqual([]);
    expect(await isHideMode(db)).toBe(true);
    // 予定は今までどおり見られるが、重なりの説明は出さない
    await fireEvent.press(screen.getByLabelText('10月27日（火）'));
    expect(screen.getByText('福岡出張')).toBeTruthy();
    expect(screen.queryAllByText(/生理|PMS|重なる/)).toEqual([]);

    await fireEvent.press(screen.getByLabelText('生理の表示をもとに戻す'));
    expect(screen.getAllByText(/生理/).length).toBeGreaterThan(0);
    expect(await isHideMode(db)).toBe(false);
  });

  it('sums up the month at the top, and opens the day or the alerts from it', async () => {
    await setup();
    expect(await screen.findByText('今月の要注意 1件')).toBeTruthy();
    expect(screen.getByText('未確認 1件')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('「福岡出張」10月27日（火） A 要注意'));
    expect(screen.getByText('福岡出張')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('次の月'));
    expect(await screen.findByText('11月の要注意 1件')).toBeTruthy();
    await fireEvent.press(screen.getByText('お知らせで対処する'));
    expect(await screen.findByText('これから30日のお知らせ')).toBeTruthy();
  });

  it('says when this month has no clashes, and offers next month', async () => {
    await setup({ calendar: fakeCalendar(true, []) });
    expect(await screen.findByText('今月、重なる予定はありません')).toBeTruthy();
    await fireEvent.press(screen.getByText('来月を見る'));
    expect(await screen.findByText('2026年11月')).toBeTruthy();
  });

  it('shows the predicted window and how sure it is on predicted days', async () => {
    await setup();
    // 28日ずつの3周期 → 10/26 ごろ±1日
    expect(await screen.findByText('次の生理は10/25〜10/27ごろ（確信度：中）')).toBeTruthy();
    expect(screen.getByText('直近3周期のばらつきから計算した目安です。')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/^10月25日（日）、生理の時期（予測）/));
    expect(screen.getByText('次の生理は10/25〜10/27ごろ（確信度：中）')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('10月5日（月）'));
    expect(screen.queryByText(/次の生理は/)).toBeNull();
  });

  it('says a prediction from too few records is an assumption', async () => {
    await setup({ starts: ['2026-09-28'] });
    expect(await screen.findByText('次の生理は10/24〜10/28ごろ（確信度：低）')).toBeTruthy();
    expect(screen.getByText('記録がまだ少ないため、28日周期を仮定した目安です。')).toBeTruthy();
  });

  it('records and removes a past start date picked on the calendar', async () => {
    const { db } = await setup({ starts: [] });
    expect(await screen.findByText(/生理が始まった日を選んで記録すると/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('10月20日（火）'));
    await fireEvent.press(screen.getByText('この日を生理開始日として記録'));
    expect(await screen.findByText(/28日周期を仮定した仮の予測/)).toBeTruthy();
    expect(await listPeriodStarts(db)).toEqual(['2026-10-20']);
    await fireEvent.press(screen.getByText('この日の記録を消す'));
    expect(await screen.findByText('この日を生理開始日として記録')).toBeTruthy();
    expect(await listPeriodStarts(db)).toEqual([]);
  });

  it('asks for a review once, right after the third recorded start', async () => {
    const { askReview } = await setup({ starts: ['2026-08-31', '2026-09-28'] });
    await fireEvent.press(await screen.findByLabelText(/^10月20日（火）/));
    await fireEvent.press(screen.getByText('この日を生理開始日として記録'));
    expect(await screen.findByText('この日の記録を消す')).toBeTruthy();
    expect(askReview).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('この日の記録を消す'));
    await fireEvent.press(await screen.findByText('この日を生理開始日として記録'));
    expect(await screen.findByText('この日の記録を消す')).toBeTruthy();
    expect(askReview).toHaveBeenCalledTimes(1);
  });

  it('does not offer to record a future date', async () => {
    await setup();
    await fireEvent.press(await screen.findByLabelText('10月30日（金）'));
    expect(screen.queryByText('この日を生理開始日として記録')).toBeNull();
  });

  it('explains a denied calendar and links to Settings, still showing zones', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const calendar = fakeCalendar(false);
    await setup({ calendar });
    expect(await screen.findByText(/カレンダーへのアクセスが許可されていない/)).toBeTruthy();
    await fireEvent.press(screen.getByText('設定アプリで許可する'));
    expect(openSettings).toHaveBeenCalled();
    expect(calendar.getEvents).not.toHaveBeenCalled();
    expect(screen.getByLabelText('10月26日（月）、生理1日目（予測）')).toBeTruthy();
  });

  it('moves between months and loads that month', async () => {
    const { calendar } = await setup();
    await screen.findByText('2026年10月');
    await fireEvent.press(screen.getByLabelText('次の月'));
    expect(screen.getByText('2026年11月')).toBeTruthy();
    expect(calendar.getEvents).toHaveBeenLastCalledWith('2026-10-26', '2026-12-06');
  });
});

describe('alerts', () => {
  it('lists the next 30 days A first and hides dismissed alerts', async () => {
    await setup();
    await fireEvent.press(await screen.findByText('お知らせ（2）'));
    const titles = screen.getAllByText(/^(福岡出張|企画プレゼン)$/).map((node) => node.props.children);
    expect(titles).toEqual(['福岡出張', '企画プレゼン']);
    // 11-20 のプレゼンは PMS 期の重い予定なので A（2026-10-30 から）
    expect(screen.getAllByText('A 要注意')).toHaveLength(2);
    // 確認しても一覧に残り、数（未確認）だけ減る。何をしたかを選ぶと一覧から外れる
    await fireEvent.press(screen.getAllByText('確認した')[0]);
    expect(await screen.findByText('お知らせ（1）')).toBeTruthy();
    expect(screen.getByText('福岡出張')).toBeTruthy();
    expect(screen.getByText('確認済み')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('「福岡出張」は準備した'));
    await waitFor(() => expect(screen.queryByText('福岡出張')).toBeNull());
  });

  it('says on each card why, whether it can move, and what to do', async () => {
    const meeting = { id: 'meet', title: '定例会議', start: '2026-10-26', end: '2026-10-26', allDay: false };
    await setup({ calendar: fakeCalendar(true, [...EVENTS, meeting]) });
    await fireEvent.press(await screen.findByText('お知らせ（3）'));
    // 10-27 の出張（生理2日目）
    expect(screen.getByText('生理2日目と重なる見込みです。')).toBeTruthy();
    expect(screen.getAllByText('準備で軽くできる予定')).toHaveLength(2);
    expect(screen.getByText('10月24日までに準備を始めておくと安心です')).toBeTruthy();
    expect(screen.getAllByText('・鎮痛剤や着替えを用意しておく').length).toBeGreaterThan(0);
    // 10-26 の定例会議は動かせるので、落ち着いている近い日を出す
    expect(screen.getByText('日にちを動かせる予定')).toBeTruthy();
    expect(screen.getByText('ずらすなら：11月3日（火）、11月4日（水）、11月5日（木）')).toBeTruthy();
  });

  it('shows how hard each day of a run of events is, and plans around the hardest', async () => {
    const osaka = ['2026-10-25', '2026-10-26', '2026-10-27'].map((day, i) => ({
      id: `osaka${i}`,
      title: '大阪出張',
      start: day,
      end: day,
      allDay: false,
    }));
    await setup({ calendar: fakeCalendar(true, [...EVENTS, ...osaka]) });
    // カレンダーでは、いちばんきつい日だけでなく、注意したい日すべてに印を付ける
    expect(await screen.findByLabelText('10月25日（日）、生理の時期（予測）、予定と重なっています')).toBeTruthy();
    expect(screen.getByLabelText('10月26日（月）、生理1日目（予測）、予定と重なっています')).toBeTruthy();
    await fireEvent.press(await screen.findByText('お知らせ（3）'));
    expect(screen.getByText('10月25日（日）〜10月27日（火）')).toBeTruthy();
    expect(screen.getByText('3日間の予定で、いちばんきついのは10月26日（2日目）。生理1日目と重なる見込みです。')).toBeTruthy();
    expect(screen.getByText('日ごとのきつさ（色のついた日がいちばんきつい日）')).toBeTruthy();
    expect(screen.getByLabelText('10月26日（月） 生理1日目 いちばんきつい日')).toBeTruthy();
    expect(screen.getByLabelText('10月25日（日） 生理かも')).toBeTruthy();
    expect(screen.getByText('・いちばんきついのは2日目。予定は1日目に寄せて、2日目は移動や予定を少なめに')).toBeTruthy();
  });

  it('does not mark the days after a period, and explains each day of a trip on the calendar', async () => {
    // 生理は 10-25〜29（10-28 が3日目）。10-30 からは生理のあと
    const trip = { id: 'trip2', title: '旅行', start: '2026-10-28', end: '2026-10-31', allDay: true };
    await setup({ calendar: fakeCalendar(true, [trip]) });
    expect(await screen.findByLabelText('10月28日（水）、生理3日目（予測）、予定と重なっています')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('10月30日（金）'));
    expect(screen.getByText('生理のあとで、落ち着いてくる時期です。いちばんきついのは10月28日（水）です。')).toBeTruthy();
    expect(screen.queryByText('A 要注意')).toBeNull();
    await fireEvent.press(screen.getByLabelText('10月28日（水）、生理3日目（予測）、予定と重なっています'));
    expect(screen.getByText(/「旅行」は生理3日目と重なる見込みです/)).toBeTruthy();
  });

  it('sends a polite message to change plans, without health words', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await setup();
    await fireEvent.press(await screen.findByText('お知らせ（2）'));
    await fireEvent.press(screen.getAllByText('断りの文を送る')[0]);
    const { message } = share.mock.calls[0][0] as { message: string };
    expect(message).toMatch(/^申し訳ありません/);
    expect(message).not.toMatch(/生理|PMS|体調/);
    share.mockRestore();
  });

  it('reflects this month: what was done, and how many were steps taken', async () => {
    await setup({
      prepare: (db) =>
        saveConflictStatus(db, 'trip', '2026-10-27', { state: 'resolved', resolution: 'prepared' }, new Date(2026, 9, 20, 12)),
    });
    await fireEvent.press(await screen.findByText('お知らせ（1）'));
    expect(screen.getByText('10月のふりかえり')).toBeTruthy();
    expect(screen.getByText('準備した 1件')).toBeTruthy();
    expect(screen.getByText('段取りできた予定 1件')).toBeTruthy();
  });

  it('says this month has nothing reflected yet', async () => {
    await setup();
    await fireEvent.press(await screen.findByText('お知らせ（2）'));
    expect(screen.getByText(/今月はまだ、対応した予定はありません/)).toBeTruthy();
  });

  it('remembers what was done for an alert', async () => {
    const { db } = await setup();
    await fireEvent.press(await screen.findByText('お知らせ（2）'));
    await fireEvent.press(screen.getByLabelText('「企画プレゼン」はずらした'));
    await waitFor(async () =>
      expect((await getConflictStatuses(db)).get('talk|2026-11-20')).toEqual({
        state: 'resolved',
        resolution: 'shifted',
      }),
    );
    expect(await screen.findByText('お知らせ（1）')).toBeTruthy();
  });

  it('tells a partner in the picked template through the share sheet, without events', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await setup();
    await fireEvent.press(await screen.findByText('お知らせ（2）'));
    const draft = () => screen.getByLabelText('送る文').props.value as string;
    expect(draft()).toMatch(/^本日より省エネモード（生理）に入りました🔋/);
    await fireEvent.press(screen.getByText('HPほぼゼロ'));
    expect(draft()).toMatch(/^生理でHP（体力量）がほぼゼロです/);
    await fireEvent.press(screen.getByText('パートナーに伝える'));
    const { message } = share.mock.calls[0][0] as { message: string };
    expect(message).toMatch(/^生理でHP（体力量）がほぼゼロです/);
    expect(message).not.toMatch(/福岡出張|企画プレゼン/);
    share.mockRestore();
  });

  it('sends the message as edited, and goes back to the template when one is picked', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await setup();
    await fireEvent.press(await screen.findByText('お知らせ（2）'));
    await fireEvent.changeText(screen.getByLabelText('送る文'), '来週ちょっとしんどいかも🍵');
    await fireEvent.press(screen.getByText('パートナーに伝える'));
    expect(share).toHaveBeenCalledWith({ message: '来週ちょっとしんどいかも🍵' });
    await fireEvent.press(screen.getByText('マイペース'));
    expect(screen.getByLabelText('送る文').props.value).toBe(
      '今日から生理期間に入りました！\n今月も体調見ながらマイペースに過ごします〜！',
    );
    share.mockRestore();
  });

  it('says when nothing clashes', async () => {
    await setup({ calendar: fakeCalendar(true, []) });
    await fireEvent.press(await screen.findByText('お知らせ'));
    expect(screen.getByText('気をつけたい時期と重なる予定はありません。')).toBeTruthy();
  });
});

describe('notifications', () => {
  it('schedules reminders before clashing events', async () => {
    const { notifier } = await setup();
    await screen.findByText('お知らせ（2）');
    // 10-27の出張（A）は7日前が過ぎているので3日前の今日だけ、11-20のプレゼン（A）は7日前の11-13と3日前の11-17
    expect(lastPlanDates(notifier)).toEqual(['2026-10-24', '2026-11-13', '2026-11-17']);
  });

  it('drops the reminder of a dismissed alert', async () => {
    const { notifier } = await setup();
    await fireEvent.press(await screen.findByText('お知らせ（2）'));
    await fireEvent.press(screen.getAllByText('確認した')[0]);
    await screen.findByText('お知らせ（1）');
    expect(lastPlanDates(notifier)).toEqual(['2026-11-13', '2026-11-17']);
  });

  it('clears all reminders when turned off in settings', async () => {
    const { notifier } = await setup();
    await fireEvent.press(await screen.findByText('設定'));
    await fireEvent(screen.getByLabelText('重なる予定の前に通知する'), 'valueChange', false);
    expect(await screen.findByText('お知らせ（2）')).toBeTruthy();
    expect(lastPlanDates(notifier)).toEqual([]);
  });

  it('does not schedule when the device has notifications off, and says so', async () => {
    const notifier = fakeNotifier(false);
    await setup({ notifier });
    await fireEvent.press(await screen.findByText('設定'));
    expect(screen.getByText('端末の設定で通知がオフになっています。')).toBeTruthy();
    expect(notifier.replaceAll).not.toHaveBeenCalled();
  });
});

describe('asking how past events went', () => {
  // PMS期は 10-19〜25。今日は 10-24
  const PAST: CalendarEvent[] = [
    { id: 'old', title: '大阪出張', start: '2026-10-16', end: '2026-10-16', allDay: false },
    { id: 'r1', title: '役員会議', start: '2026-10-20', end: '2026-10-20', allDay: false },
    { id: 'r2', title: '役員会議', start: '2026-10-22', end: '2026-10-22', allDay: false },
    { id: 'r3', title: '飲み会', start: '2026-10-23', end: '2026-10-23', allDay: false },
    { id: 'buy', title: '買い物', start: '2026-10-23', end: '2026-10-23', allDay: false },
    ...EVENTS,
  ];

  it('asks about up to 3 recent heavy or normal events at home and learns from two hard answers', async () => {
    await setup({ calendar: fakeCalendar(true, PAST) });
    expect(await screen.findByText('予定、どうだった？')).toBeTruthy();
    expect(screen.getByText('10月23日（金）「飲み会」')).toBeTruthy();
    expect(screen.queryByText('10月23日（金）「買い物」')).toBeNull();
    expect(screen.queryByText('10月16日（金）「大阪出張」')).toBeNull();

    await fireEvent.press(screen.getByLabelText('10月22日（木）「役員会議」はきつかった'));
    await fireEvent.press(await screen.findByLabelText('10月20日（火）「役員会議」はきつかった'));
    await fireEvent.press(await screen.findByLabelText('10月23日（金）「飲み会」は答えない'));
    await waitFor(() => expect(screen.queryByText('予定、どうだった？')).toBeNull());

    await fireEvent.press(screen.getByText('設定'));
    expect(await screen.findByText('2回の答えから')).toBeTruthy();
    expect(screen.queryByText('飲み会')).toBeNull();
  });

  it('keeps an answer given with a notification button, and asks the next morning', async () => {
    const { db, notifier } = await setup({ calendar: fakeCalendar(true, PAST) });
    await screen.findByText('予定、どうだった？');
    const reviews = notifier.replaceAll.mock.calls.at(-1)![0].filter((plan) => plan.review);
    // 予定の次の朝に1件ずつ（今朝の分は時刻が過ぎていれば予約されない）
    expect(reviews.map((plan) => plan.date)).toEqual(['2026-10-24', '2026-10-28', '2026-11-21']);
    expect(reviews[1].title).toBe('昨日の「福岡出張」、実際どうでした？');

    const answer = notifier.onReviewAnswer.mock.calls.at(-1)![0];
    await act(async () => answer({ eventId: 'r3', title: '飲み会', date: '2026-10-23', phase: 'pms', risk: 'medium' }, 'easy'));
    await waitFor(() => expect(screen.queryByText('10月23日（金）「飲み会」')).toBeNull());
    expect(await listReviewed(db)).toEqual(new Set(['r3|2026-10-23']));
  });
});

describe('settings', () => {
  async function openSettings(options?: Parameters<typeof setup>[0]) {
    const result = await setup(options);
    await fireEvent.press(await screen.findByText('設定'));
    return result;
  }

  it('estimates the PMS length by default, and lets the user set it by hand', async () => {
    await openSettings();
    expect(screen.getByText('PMS は生理予定日の7日前から（記録がたまるまでの目安）')).toBeTruthy();
    expect(screen.getByText(/始まりが読めた周期：0／6/)).toBeTruthy();
    expect(screen.queryByText('7日前')).toBeNull();
    await fireEvent.press(screen.getByText('手動で指定'));
    expect(await screen.findByText('7日前')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('PMS警戒期（予定日の何日前から）を減らす'));
    expect(await screen.findByText('6日前')).toBeTruthy();
  });

  it('shows the PMS length estimated from six cycles of answers, and what it is based on', async () => {
    await openSettings({
      prepare: async (opened) => {
        for (const start of ['2026-05-04', '2026-06-01', '2026-06-29', '2026-07-27', '2026-08-24', '2026-09-21']) {
          await addPeriodStart(opened, start);
          for (const n of [2, 9]) {
            await answerReview(opened, { eventId: `${start}-${n}`, title: '会議', date: addDays(start, -n), phase: 'pms', risk: 'medium' }, 'hard');
          }
        }
      },
    });
    expect(screen.getByText('PMS は生理予定日の9日前から（あなたの記録から推定）')).toBeTruthy();
    expect(screen.getByText(/過去6周期の体調評価から推定/)).toBeTruthy();
  });

  it('adds and removes keywords, moving a word between levels', async () => {
    await openSettings();
    await fireEvent.changeText(screen.getByLabelText('重い予定に言葉を追加'), '会議');
    await fireEvent.press(screen.getByLabelText('重い予定に追加'));
    expect(await screen.findByLabelText('「会議」を重い予定から外す')).toBeTruthy();
    expect(screen.queryByLabelText('「会議」をふつうの予定から外す')).toBeNull();
    await fireEvent.press(screen.getByLabelText('「出張」を重い予定から外す'));
    expect(screen.queryByLabelText('「出張」を重い予定から外す')).toBeNull();
  });

  it('lists learned titles only once decided, lets the user flip the weight, and forgets one', async () => {
    const twice = learnWeight(learnWeight(undefined, '役員会議', 'hard', 'pms'), '役員会議', 'hard', 'pms');
    const { db } = await openSettings({
      prepare: async (opened) => {
        await saveTitleWeight(opened, twice);
        await saveTitleWeight(opened, learnWeight(undefined, '社員旅行', 'hard', 'pms'));
      },
    });
    expect(screen.getByText('2回の答えから')).toBeTruthy();
    expect(screen.queryByText('社員旅行')).toBeNull();
    await fireEvent.press(screen.getByLabelText('「役員会議」は重い。押すとふつうにする'));
    expect(await screen.findByText('自分で決めた')).toBeTruthy();
    expect((await listTitleWeights(db)).find((entry) => entry.term === '役員会議')).toMatchObject({ weight: 'normal', source: 'user' });
    await fireEvent.press(screen.getByLabelText('「役員会議」の重さを忘れる'));
    expect(await screen.findByText('まだありません。')).toBeTruthy();
  });

  it('lists records newest first and removes one', async () => {
    const { db } = await openSettings();
    expect(screen.getByText('9月28日（月）〜')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('9月28日（月）の記録を消す'));
    expect(await listPeriodStarts(db)).toEqual(REGULAR.slice(0, 3));
  });

  it('exports only an encrypted backup, locked with a passphrase typed twice', async () => {
    const { files } = await openSettings();
    expect(screen.queryByText('データを書き出す')).toBeNull();
    await fireEvent.press(screen.getByText('暗号化して書き出す'));
    await fireEvent.changeText(screen.getByLabelText('パスワード'), 'short');
    expect(screen.getByText('8文字以上にしてください')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('パスワード'), 'すみれ色の朝ごはん');
    await fireEvent.changeText(screen.getByLabelText('パスワード（もう一度）'), 'すみれ色の朝ごはん!');
    expect(screen.getByText('2回目が1回目と違います')).toBeTruthy();
    await fireEvent.press(screen.getByText('書き出す'));
    expect(files.share).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('パスワード（もう一度）'), 'すみれ色の朝ごはん');
    await fireEvent.press(screen.getByText('書き出す'));
    expect(await screen.findByText(/バックアップを作りました/)).toBeTruthy();
    const [file, name] = files.share.mock.calls[0];
    expect(name).toBe('cocomia-backup-2026-10-24.json');
    expect(file).not.toContain('2026-07-06');
    const opened = await openBackup(file, 'すみれ色の朝ごはん');
    expect(opened.ok && JSON.parse(opened.text).periodStarts).toEqual(REGULAR);
  });

  const locked = (starts: string[]) =>
    encryptBackup(
      JSON.stringify({
        app: 'karenda',
        schemaVersion: 1,
        exportedAt: '2026-10-01T00:00:00.000Z',
        periodStarts: starts,
        zoneSettings: { heavyDays: 5, pmsDays: 10 },
        keywords: { high: ['出張'], medium: [] },
      }),
      'pass-1234',
      { random: (n) => new Uint8Array(randomBytes(n)), iterations: 1_000 },
    );

  it('restores a backup only after the right passphrase and a look at what it holds', async () => {
    const { db } = await openSettings({ files: fakeFiles(await locked(['2026-05-01', '2026-05-29'])) });
    await fireEvent.press(screen.getByText('ファイルから戻す'));
    await fireEvent.changeText(await screen.findByLabelText('バックアップのパスワード'), 'pass-9999');
    await fireEvent.press(screen.getByText('開く'));
    expect(await screen.findByText('パスワードが違うか、ファイルが壊れています。')).toBeTruthy();
    expect(await listPeriodStarts(db)).toEqual(REGULAR);

    await fireEvent.changeText(screen.getByLabelText('バックアップのパスワード'), 'pass-1234');
    await fireEvent.press(screen.getByText('開く'));
    expect(await screen.findByText('記録 2件（2026年5月1日〜2026年5月29日）')).toBeTruthy();
    await fireEvent.press(screen.getByText('記録を足す（設定は今のまま）'));
    expect(await screen.findByText(/戻しました/)).toBeTruthy();
    expect(await listPeriodStarts(db)).toEqual(['2026-05-01', '2026-05-29', ...REGULAR]);
    expect(await getZoneSettings(db)).toEqual({ heavyDays: 3, pmsDays: 7 });
  });

  it('can replace everything with the backup, settings included', async () => {
    const { db } = await openSettings({ files: fakeFiles(await locked(['2026-05-01'])) });
    await fireEvent.press(screen.getByText('ファイルから戻す'));
    await fireEvent.changeText(await screen.findByLabelText('バックアップのパスワード'), 'pass-1234');
    await fireEvent.press(screen.getByText('開く'));
    await fireEvent.press(await screen.findByText('ファイルの内容に置き換える'));
    expect(await screen.findByText(/戻しました/)).toBeTruthy();
    expect(await listPeriodStarts(db)).toEqual(['2026-05-01']);
    expect(await getZoneSettings(db)).toEqual({ heavyDays: 5, pmsDays: 10 });
  });

  it('reads an old unencrypted export without asking for a passphrase', async () => {
    const other = createTestDatabase();
    await migrate(other);
    await addPeriodStart(other, '2026-04-02');
    const { db } = await openSettings({ starts: [], files: fakeFiles(JSON.stringify(await exportData(other))) });
    await fireEvent.press(screen.getByText('ファイルから戻す'));
    expect(await screen.findByText('記録 1件（2026年4月2日〜2026年4月2日）')).toBeTruthy();
    expect(screen.queryByLabelText('バックアップのパスワード')).toBeNull();
    await fireEvent.press(screen.getByText('記録を足す（設定はファイルのもの）'));
    await waitFor(async () => expect(await listPeriodStarts(db)).toEqual(['2026-04-02']));
  });

  it('says why a file cannot be read, and does nothing when picking is cancelled', async () => {
    const { files } = await openSettings({ files: fakeFiles('こんにちは') });
    await fireEvent.press(screen.getByText('ファイルから戻す'));
    expect(await screen.findByText('ファイルが壊れているため、読み込めませんでした。')).toBeTruthy();
    files.pick.mockResolvedValueOnce(null);
    await fireEvent.press(screen.getByText('ファイルから戻す'));
    expect(screen.queryByText('ファイルが壊れているため、読み込めませんでした。')).toBeNull();
    // 読み込みそのものに失敗した時も、黙らずに知らせる
    files.pick.mockRejectedValueOnce(new Error('denied'));
    await fireEvent.press(screen.getByText('ファイルから戻す'));
    expect(await screen.findByText('ファイルを読み込めませんでした。もう一度お試しください。')).toBeTruthy();
  });

  it('deletes everything only after confirming, then shows the first-run guide', async () => {
    const { db, notifier } = await openSettings();
    await fireEvent.press(screen.getByText('すべてのデータを削除'));
    await fireEvent.press(screen.getByText('やめる'));
    expect(await listPeriodStarts(db)).toEqual(REGULAR);
    expect(lastPlanDates(notifier)?.length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByText('すべてのデータを削除'));
    await fireEvent.press(screen.getByText('すべて削除する'));
    expect(await screen.findByText('はじめる')).toBeTruthy();
    expect(await listPeriodStarts(db)).toEqual([]);
    // 予定名の入った予約が、削除のあとに届かない
    expect(notifier.replaceAll).toHaveBeenLastCalledWith([]);
  });
});

describe('usage records', () => {
  it('counts a recorded period start on this phone', async () => {
    const { db } = await setup({ starts: [] });
    await fireEvent.press(await screen.findByLabelText(/^10月20日（火）/));
    await fireEvent.press(screen.getByText('この日を生理開始日として記録'));
    await waitFor(async () => expect((await listMetricEvents(db)).map((e) => e.name)).toContain('period_recorded'));
  });

  it('can be turned off in settings', async () => {
    const { db } = await setup();
    await fireEvent.press(await screen.findByText('設定'));
    await fireEvent(screen.getByLabelText('利用状況をこの iPhone に記録する'), 'valueChange', false);
    await waitFor(async () => expect(await isMetricsEnabled(db)).toBe(false));
  });
});

describe('app lock', () => {
  it('asks for Face ID when opened with the lock on, and shows nothing until it succeeds', async () => {
    const authenticator = fakeAuthenticator(true, [false, true]);
    await setup({ lock: true, authenticator });
    expect(await screen.findByText('ロックしています')).toBeTruthy();
    expect(screen.queryByText('2026年10月')).toBeNull();
    expect(authenticator.authenticate).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('ロックを解除'));
    expect(await screen.findByText('2026年10月')).toBeTruthy();
  });

  it('locks again when the app goes to the background, and asks when it comes back', async () => {
    const authenticator = fakeAuthenticator(true, [true, false]);
    await setup({ lock: true, authenticator });
    expect(await screen.findByText('2026年10月')).toBeTruthy();
    await sendAppState('background');
    expect(await screen.findByText('ロックしています')).toBeTruthy();
    await sendAppState('active');
    expect(authenticator.authenticate).toHaveBeenCalledTimes(2);
    expect(screen.getByText('ロックしています')).toBeTruthy();
  });

  it('lets you in when the iPhone no longer has a passcode, rather than locking you out', async () => {
    const authenticator = fakeAuthenticator(false);
    await setup({ lock: true, authenticator });
    expect(await screen.findByText('2026年10月')).toBeTruthy();
    expect(authenticator.authenticate).not.toHaveBeenCalled();
  });

  it('turns the lock on only after Face ID succeeds, and can turn it off', async () => {
    const authenticator = fakeAuthenticator(true, [false, true]);
    const { db } = await setup({ authenticator });
    await fireEvent.press(await screen.findByText('設定'));
    await fireEvent(screen.getByLabelText('Face ID でロックする'), 'valueChange', true);
    expect(await screen.findByText('Face ID で確かめられなかったため、ロックはオンにしていません。')).toBeTruthy();
    expect(await isLockEnabled(db)).toBe(false);
    await fireEvent(screen.getByLabelText('Face ID でロックする'), 'valueChange', true);
    await waitFor(async () => expect(await isLockEnabled(db)).toBe(true));
    // オンにした直後は、自分で開いているのでロックしない
    expect(screen.queryByText('ロックしています')).toBeNull();
    await fireEvent(screen.getByLabelText('Face ID でロックする'), 'valueChange', false);
    await waitFor(async () => expect(await isLockEnabled(db)).toBe(false));
  });

  it('cannot turn the lock on when the iPhone has no passcode', async () => {
    await setup({ authenticator: fakeAuthenticator(false) });
    await fireEvent.press(await screen.findByText('設定'));
    expect(await screen.findByText('この iPhone にパスコードが設定されていないため、ロックは使えません。')).toBeTruthy();
    expect(screen.getByLabelText('Face ID でロックする').props.disabled).toBe(true);
  });
});

describe('coming back to the app', () => {
  it('moves "today" forward after the date changed, so the real day can be recorded', async () => {
    let day = '2026-10-24';
    await setup({ today: () => day });
    await screen.findByText('2026年10月');
    day = '2026-10-26';
    await returnToApp();
    await fireEvent.press(screen.getByLabelText('10月26日（月）、生理1日目（予測）'));
    expect(screen.getByText('この日を生理開始日として記録')).toBeTruthy();
  });

  it('notices calendar access granted in the Settings app without asking again', async () => {
    const calendar = fakeCalendar(false);
    await setup({ calendar });
    expect(await screen.findByText(/カレンダーへのアクセスが許可されていない/)).toBeTruthy();
    calendar.hasAccess.mockResolvedValue(true);
    await returnToApp();
    expect(screen.queryByText(/カレンダーへのアクセスが許可されていない/)).toBeNull();
    expect(calendar.getEvents).toHaveBeenCalled();
    expect(calendar.requestAccess).toHaveBeenCalledTimes(1);
  });

  it('notices notifications turned on in the Settings app and schedules them', async () => {
    const notifier = fakeNotifier(false);
    await setup({ notifier });
    await fireEvent.press(await screen.findByText('設定'));
    expect(screen.getByText('端末の設定で通知がオフになっています。')).toBeTruthy();
    notifier.hasAccess.mockResolvedValue(true);
    await returnToApp();
    expect(screen.queryByText('端末の設定で通知がオフになっています。')).toBeNull();
    expect(notifier.replaceAll).toHaveBeenCalled();
    expect(notifier.requestAccess).toHaveBeenCalledTimes(1);
  });
});

it('explains when the data cannot be loaded', async () => {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <Main
        loadDatabase={() => Promise.reject(new Error('no'))}
        calendar={fakeCalendar(true)}
        notifier={fakeNotifier()}
        today={() => '2026-10-24'}
      />
    </SafeAreaProvider>,
  );
  expect(await screen.findByText('データを読み込めませんでした。アプリを開き直してください。')).toBeTruthy();
});
