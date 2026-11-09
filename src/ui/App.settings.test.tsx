import { REGULAR, fakeFiles, lastPlanDates, setup } from './testApp';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { randomBytes } from 'node:crypto';
import {
  addManualEvent,
  addPeriodStart,
  answerReview,
  encryptBackup,
  exportData,
  getZoneSettings,
  listPeriodStarts,
  migrate,
  openBackup,
  listTitleWeights,
  loadState,
  recordPeriodStart,
  saveTitleWeight,
} from '../data';
import { createTestDatabase } from '../data/testDatabase';
import { addDays, learnWeight } from '../engine';

describe('settings', () => {
  async function openSettings(options?: Parameters<typeof setup>[0]) {
    const result = await setup(options);
    await fireEvent.press(await screen.findByText('設定'));
    return result;
  }

  // 数字は判定のしくみの値から作る。値を変えたら、この文も合わせて書き換える
  it('explains when notices come and how titles are learned, with the numbers the app uses', async () => {
    await openSettings();
    expect(
      screen.getByText(
        '重なる予定は、要注意（A）なら7日前と3日前、注意（B）なら3日前、どちらも決める目安の日にも、朝9時にこの端末から通知します。1つの予定の通知は3回まで、同じ日の通知は1件にまとめます。「今日は決めない」を押すと、次の日にもう一度だけ知らせます。重い予定・ふつうの予定のあとは、次の朝9時に「どうだった？」と1件だけ聞きます。時刻のある予定がある日は、朝7時（8時より前に始まる日はその1時間前）に「今日の予定」を知らせます。',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/^予定のあとの「どうだった？」で同じ答えが2回続くと、その予定の重さを覚えて/)).toBeTruthy();
    expect(screen.getByText('予定の30分前にも知らせる')).toBeTruthy();
    expect(screen.getByText(/^時刻のある予定が始まる30分前に、もう一度知らせます。/)).toBeTruthy();
  });

  it('estimates the PMS length by default, and lets the user set it by hand', async () => {
    await openSettings();
    expect(screen.getByText('PMS は生理予定日の7日前から（記録がたまるまでの目安）')).toBeTruthy();
    expect(screen.getByText(/始まりが読めた周期：0／6/)).toBeTruthy();
    expect(screen.queryByText('7日前')).toBeNull();
    await fireEvent.press(screen.getByText('手動で指定'));
    expect(await screen.findByText('7日前')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('PMSの時期（予定日の何日前から）を減らす'));
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

  it('shows the privacy facts: nothing sent, no SDKs, and what is kept on the phone', async () => {
    await openSettings();
    expect(screen.getByText('外部への送信')).toBeTruthy();
    expect(screen.getByText('0件')).toBeTruthy();
    expect(screen.getByText('外部のSDK')).toBeTruthy();
    expect(screen.getByText('なし')).toBeTruthy();
    expect(screen.getByText('この端末の中だけ')).toBeTruthy();
    expect(screen.getByText('・生理開始日と終わりの日、薬で時期をずらした印：次の生理と、気をつける時期を予測するため')).toBeTruthy();
  });

  it('says there is not enough data yet instead of showing numbers', async () => {
    await openSettings();
    expect(screen.getByText(/まだ評価できるデータが足りません（n=0）/)).toBeTruthy();
    expect(screen.queryByText('平均のズレ')).toBeNull();
  });

  it('shows how far off the last predictions were, with n', async () => {
    await openSettings({
      starts: [],
      prepare: async (opened) => {
        // 予測 6/29・7/27・8/25 に対して、実際は 6/29・7/28・8/24
        for (const start of ['2026-06-01', '2026-06-29', '2026-07-28', '2026-08-24']) {
          await recordPeriodStart(opened, start);
          await loadState(opened, new Date(`${start}T12:00`));
        }
      },
    });
    expect(screen.getByText('前回の予測は1日ズレました（予測 8/25 → 実際 8/24）。')).toBeTruthy();
    expect(screen.getByText('平均のズレ')).toBeTruthy();
    expect(screen.getByText('0.7日')).toBeTruthy();
    expect(screen.getByText('±1日以内')).toBeTruthy();
    expect(screen.getByText('3回中3回')).toBeTruthy();
    expect(screen.getByText(/n=3/)).toBeTruthy();
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

  it('records when the pill was started and stopped, notes it on the calendar, and forgets a period', async () => {
    const { db } = await openSettings();
    await fireEvent.changeText(screen.getByLabelText('飲みはじめた日'), '2026-10-01');
    await fireEvent.press(screen.getByText('この日からピルを飲んでいる'));
    expect(await screen.findByText('2026年10月1日から飲んでいます')).toBeTruthy();
    expect((await loadState(db)).notes.pill).toEqual([{ start: '2026-10-01', end: null }]);
    // やめた日は、選び直さなければ今日（10-24）。飲みはじめた日のままにしない
    await fireEvent.press(screen.getByText('この日でピルをやめた'));
    expect(await screen.findByText('2026年10月1日〜2026年10月24日')).toBeTruthy();
    expect((await loadState(db)).notes.pill).toEqual([{ start: '2026-10-01', end: '2026-10-24' }]);
    // 前の期間に重なる日からは始められない
    expect(screen.getByText('2026年10月24日より後の日を選んでください。')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('2026年10月1日からのピルの記録を消す'));
    await waitFor(async () => expect((await loadState(db)).notes.pill).toEqual([]));

    await fireEvent.press(await screen.findByText('この日からピルを飲んでいる'));
    await fireEvent.press(screen.getByRole('tab', { name: 'カレンダー' }));
    expect(await screen.findByText('ピルを飲んでいる間は、生理やPMSの時期の目安が合わないことがあります。')).toBeTruthy();
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
    await addManualEvent(other, { title: '発表', date: '2026-04-20', weight: 'heavy', color: 'orange' });
    const { db } = await openSettings({ starts: [], files: fakeFiles(JSON.stringify(await exportData(other))) });
    await fireEvent.press(screen.getByText('ファイルから戻す'));
    expect(await screen.findByText('記録 1件（2026年4月2日〜2026年4月2日）・このアプリの予定 1件')).toBeTruthy();
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
