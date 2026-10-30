import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking, Share } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { addPeriodStart, CalendarSource, Database, listPeriodStarts, migrate, Notifier, setOnboarded } from '../data';
import { createTestDatabase } from '../data/testDatabase';
import type { CalendarEvent, NotificationPlan } from '../engine';
import { Main } from './App';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('expo-calendar/legacy', () => ({}));
jest.mock('expo-store-review', () => ({}));
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
    getEvents: jest.fn(async (from: string, until: string) =>
      events.filter((event) => event.end >= from && event.start <= until),
    ),
  } satisfies CalendarSource;
}

function fakeNotifier(granted = true) {
  return {
    requestAccess: jest.fn(async () => granted),
    replaceAll: jest.fn(async (_plans: NotificationPlan[]) => {}),
  } satisfies Notifier;
}

const lastPlanDates = (notifier: ReturnType<typeof fakeNotifier>) =>
  notifier.replaceAll.mock.calls.at(-1)?.[0].map((plan) => plan.date);

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function setup({
  starts = REGULAR,
  onboarded = true,
  calendar = fakeCalendar(true),
  notifier = fakeNotifier(),
  askReview = jest.fn(async () => {}),
}: {
  starts?: string[];
  onboarded?: boolean;
  calendar?: ReturnType<typeof fakeCalendar>;
  notifier?: ReturnType<typeof fakeNotifier>;
  askReview?: jest.Mock;
} = {}) {
  const db: Database = createTestDatabase();
  await migrate(db);
  if (onboarded) await setOnboarded(db);
  for (const start of starts) await addPeriodStart(db, start);
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <Main
        loadDatabase={async () => db}
        calendar={calendar}
        notifier={notifier}
        askReview={askReview}
        today={() => '2026-10-24'}
      />
    </SafeAreaProvider>,
  );
  return { db, calendar, notifier, askReview };
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
  it('lists the next 30 days red first and hides dismissed alerts', async () => {
    await setup();
    await fireEvent.press(await screen.findByText('お知らせ（2）'));
    const titles = screen.getAllByText(/^(福岡出張|企画プレゼン)$/).map((node) => node.props.children);
    expect(titles).toEqual(['福岡出張', '企画プレゼン']);
    expect(screen.getByText('しっかり注意')).toBeTruthy();
    await fireEvent.press(screen.getAllByText('わかった')[0]);
    expect(await screen.findByText('お知らせ（1）')).toBeTruthy();
    expect(screen.queryByText('福岡出張')).toBeNull();
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
    // 10-27の出張（レッド）は3日前の今日、11-20のプレゼン（イエロー）は3日前の11-17
    expect(lastPlanDates(notifier)).toEqual(['2026-10-24', '2026-11-17']);
  });

  it('drops the reminder of a dismissed alert', async () => {
    const { notifier } = await setup();
    await fireEvent.press(await screen.findByText('お知らせ（2）'));
    await fireEvent.press(screen.getAllByText('わかった')[0]);
    await screen.findByText('お知らせ（1）');
    expect(lastPlanDates(notifier)).toEqual(['2026-11-17']);
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

describe('settings', () => {
  async function openSettings(options?: Parameters<typeof setup>[0]) {
    const result = await setup(options);
    await fireEvent.press(await screen.findByText('設定'));
    return result;
  }

  it('changes the PMS length within its range', async () => {
    await openSettings();
    expect(screen.getByText('7日前')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('PMS警戒期（予定日の何日前から）を減らす'));
    expect(await screen.findByText('6日前')).toBeTruthy();
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

  it('lists records newest first and removes one', async () => {
    const { db } = await openSettings();
    expect(screen.getByText('9月28日（月）〜')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('9月28日（月）の記録を消す'));
    expect(await listPeriodStarts(db)).toEqual(REGULAR.slice(0, 3));
  });

  it('exports data through the share sheet', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await openSettings();
    await fireEvent.press(screen.getByText('データを書き出す'));
    const message = share.mock.calls[0][0] as { message: string };
    expect(JSON.parse(message.message)).toMatchObject({ app: 'karenda', periodStarts: REGULAR });
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
