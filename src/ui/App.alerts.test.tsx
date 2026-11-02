import { EVENTS, fakeCalendar, setup } from './testApp';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';
import { getConflictStatuses, listReviewed, saveConflictStatus } from '../data';
import { type CalendarEvent } from '../engine';

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
      expect((await getConflictStatuses(db)).get('talk')).toEqual({
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
    expect(await listReviewed(db)).toEqual(new Set(['r3']));
  });
});
