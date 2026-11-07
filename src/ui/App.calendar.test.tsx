import { fakeCalendar, setup } from './testApp';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { dismissConsult, isHideMode, listPeriodStarts, loadState } from '../data';
import { MASCOT_LINES } from './mascotLines';

describe('calendar', () => {
  it('colors the zones and marks days where events clash', async () => {
    const { calendar } = await setup();
    expect(await screen.findByLabelText('10月27日（火）、生理2日目（予測）、予定と重なっています')).toBeTruthy();
    expect(screen.getByLabelText('10月20日（火）、PMSの時期（予測）')).toBeTruthy();
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
    // 今日 10-24 は PMSの時期
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
        said.add(screen.getByText(new RegExp(`^${lead}`)).props.children as string);
      }
      expect(said.size).toBe(4);
    }
  });

  // 仕様 F18: ミアは段取り係。なぐさめだけの言葉は言わず、提案か問いかけにする
  it.each(Object.entries(MASCOT_LINES))('has Mia suggest or ask in the %s phase, never only comfort', (_, { lines }) => {
    for (const line of lines) {
      expect(line).not.toMatch(/無理しないで|つらいね|つらいよね|休んでね|過ごしてね|がんばってるね/);
      expect(line).toMatch(/(ね|？|よ|大丈夫|かも)$/);
      // 「しよっ」「しちゃお」のような縮めた言い方はしない
      expect(line).not.toMatch(/(っ|しよ|ちゃお|とこ|みよ)$/);
      // ひと目で読める短さにする
      expect(line.length).toBeLessThanOrEqual(18);
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
    expect(screen.getByText('10月20日（火）の記録を消します。予測も変わります。')).toBeTruthy();
    await fireEvent.press(screen.getByText('やめる'));
    expect(await listPeriodStarts(db)).toEqual(['2026-10-20']);
    await fireEvent.press(screen.getByText('この日の記録を消す'));
    await fireEvent.press(screen.getByText('記録を消す'));
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
    await fireEvent.press(screen.getByText('記録を消す'));
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

  it('says so when saving fails, and the message can be closed', async () => {
    await setup({
      calendar: fakeCalendar(false),
      prepare: async (db) => {
        const run = db.runAsync;
        db.runAsync = async (source, ...params) => {
          if (source.startsWith('INSERT INTO manual_events')) throw new Error('disk full');
          return run(source, ...params);
        };
      },
    });
    await fireEvent.press(await screen.findByLabelText('10月27日（火）、生理2日目（予測）'));
    await fireEvent.press(screen.getByText('この日に予定を入れる'));
    await fireEvent.changeText(screen.getByLabelText('10月27日（火）に入れる予定の名前'), '発表');
    await fireEvent.press(screen.getByText('入れる'));
    expect(await screen.findByText('保存できませんでした。もう一度お試しください。')).toBeTruthy();
    await fireEvent.press(screen.getByText('閉じる'));
    expect(screen.queryByText('保存できませんでした。もう一度お試しください。')).toBeNull();
  });

  it('lets the user put an event in this app only, and alerts on it without calendar access', async () => {
    const calendar = fakeCalendar(false);
    const { db } = await setup({ calendar });
    await fireEvent.press(await screen.findByLabelText('10月27日（火）、生理2日目（予測）'));
    expect(screen.getByText('カレンダーは使っていません。予定はこのアプリの中だけに入れられます。')).toBeTruthy();
    await fireEvent.press(screen.getByText('この日に予定を入れる'));
    await fireEvent.changeText(screen.getByLabelText('10月27日（火）に入れる予定の名前'), '発表');
    await fireEvent(screen.getByLabelText('時間を入れる'), 'valueChange', true);
    await fireEvent.changeText(screen.getByLabelText('開始'), '14:00');
    await fireEvent.changeText(screen.getByLabelText('終了'), '15:30');
    await fireEvent.press(screen.getByLabelText('色をみどりにする'));
    await fireEvent.press(screen.getByText('入れる'));
    expect(await screen.findByText('このアプリだけ')).toBeTruthy();
    expect(screen.getByText('14:00〜15:30')).toBeTruthy();
    expect(await screen.findByText('お知らせ（1）')).toBeTruthy();
    expect(calendar.getEvents).not.toHaveBeenCalled();
    expect((await loadState(db)).manualEvents).toMatchObject([{ title: '発表', color: 'green', startMinutes: 840, durationMinutes: 90 }]);

    await fireEvent.press(screen.getByText('「発表」を消す'));
    expect(screen.getByText('「発表」を消します。元に戻せません。')).toBeTruthy();
    await fireEvent.press(screen.getByText('やめる'));
    expect((await loadState(db)).manualEvents).toHaveLength(1);
    await fireEvent.press(screen.getByText('「発表」を消す'));
    await fireEvent.press(screen.getByText('予定を消す'));
    await waitFor(() => expect(screen.queryByText('このアプリだけ')).toBeNull());
    expect((await loadState(db)).manualEvents).toEqual([]);
  });

  it('closes the form without keeping what was typed when cancelled', async () => {
    const { db } = await setup({ calendar: fakeCalendar(false) });
    await fireEvent.press(await screen.findByLabelText('10月14日（水）'));
    await fireEvent.press(screen.getByText('この日に予定を入れる'));
    await fireEvent.changeText(screen.getByLabelText('10月14日（水）に入れる予定の名前'), '会議');
    await fireEvent.press(screen.getByText('やめる'));
    expect(screen.queryByLabelText('10月14日（水）に入れる予定の名前')).toBeNull();
    expect((await loadState(db)).manualEvents).toEqual([]);
    await fireEvent.press(screen.getByText('この日に予定を入れる'));
    expect(screen.getByLabelText('10月14日（水）に入れる予定の名前').props.value).toBe('');
  });

  it('shows the color of an event put in this app on the day, and reuses it for the same name', async () => {
    await setup({ calendar: fakeCalendar(false) });
    await fireEvent.press(await screen.findByLabelText('10月14日（水）'));
    await fireEvent.press(screen.getByText('この日に予定を入れる'));
    await fireEvent.changeText(screen.getByLabelText('10月14日（水）に入れる予定の名前'), '会議');
    await fireEvent.press(screen.getByText('ふつうの予定'));
    await fireEvent.press(screen.getByLabelText('色をむらさきにする'));
    await fireEvent.press(screen.getByText('入れる'));
    expect(await screen.findByLabelText('10月14日（水）、このアプリの予定あり')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('10月15日（木）'));
    await fireEvent.press(screen.getByText('この日に予定を入れる'));
    expect(screen.getByLabelText('色をあおにする').props.accessibilityState.selected).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('10月15日（木）に入れる予定の名前'), '会議');
    expect(screen.getByLabelText('色をむらさきにする').props.accessibilityState.selected).toBe(true);
  });

  it('moves between months and loads that month', async () => {
    const { calendar } = await setup();
    await screen.findByText('2026年10月');
    await fireEvent.press(screen.getByLabelText('次の月'));
    expect(screen.getByText('2026年11月')).toBeTruthy();
    expect(calendar.getEvents).toHaveBeenLastCalledWith('2026-10-26', '2026-12-06');
  });
});

describe('records that look irregular', () => {
  // 間隔 28・60・28・10日。60日と10日は予測に使わない
  const IRREGULAR = ['2026-05-01', '2026-05-29', '2026-07-28', '2026-08-25', '2026-09-04'];
  const CONSULT = /婦人科に相談するという目安もあります。判断は医師にご相談ください。/;

  it('shows a neutral card on the calendar until it is closed for the month', async () => {
    const { db } = await setup({ starts: IRREGULAR });
    expect(await screen.findByText(CONSULT)).toBeTruthy();
    expect(screen.getByText(/15日より短い・45日より長い間隔が何度かあります。/)).toBeTruthy();
    await fireEvent.press(screen.getByText('今月はもう出さない'));
    await waitFor(() => expect(screen.queryByText(CONSULT)).toBeNull());
    expect((await loadState(db)).consultDismissed).toBe('2026-10');
  });

  it('shows the card again in a later month, but not in hide mode', async () => {
    await setup({ starts: IRREGULAR, prepare: (db) => dismissConsult(db, '2026-09') });
    expect(await screen.findByText(CONSULT)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('生理の表示をかくす'));
    await waitFor(() => expect(screen.queryByText(CONSULT)).toBeNull());
  });

  it('lists the intervals left out of the prediction, while keeping the records', async () => {
    await setup({ starts: IRREGULAR });
    await fireEvent.press(await screen.findByText('設定'));
    expect(screen.getByText('予測に使っていない間隔')).toBeTruthy();
    expect(screen.getByText(/2件を予測の計算から外しました（間隔が長すぎる／間隔が短すぎる）/)).toBeTruthy();
    expect(screen.getByText(/。15日より短い・45日より長い間隔は、記録の抜けや重なりかもしれないので使っていません。/)).toBeTruthy();
    expect(screen.getByText('2026年5月29日〜2026年7月28日　60日（間隔が長すぎる）')).toBeTruthy();
    expect(screen.getByText('2026年8月25日〜2026年9月4日　10日（間隔が短すぎる）')).toBeTruthy();
    expect(screen.getByText('9月4日（金）〜')).toBeTruthy();
  });

  it('has no such section when nothing was left out', async () => {
    await setup();
    await fireEvent.press(await screen.findByText('設定'));
    expect(screen.queryByText('予測に使っていない間隔')).toBeNull();
  });
});
