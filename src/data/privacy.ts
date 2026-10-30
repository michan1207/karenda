/** 設定の「プライバシー」に出す事実。言い切りの強い言葉（絶対・100%など）は使わない（テストで確かめる） */
export const PRIVACY_FACTS: { label: string; value: string; note: string }[] = [
  { label: '外部のSDK', value: 'なし', note: '解析・広告・クラッシュレポートのしくみは入れていません。' },
  { label: '保存場所', value: 'この端末の中だけ', note: 'このアプリにはサーバーがありません。' },
  { label: 'アカウント', value: 'いりません', note: '名前やメールアドレスは聞きません。' },
];

/** この端末に残すもの。表ごとに、何をなぜ残すか。表を足したらここにも足す（実際の表と一致するかテストで確かめる） */
export const STORED_DATA: { table: string; what: string; why: string }[] = [
  { table: 'period_starts', what: '生理開始日', why: '次の生理と、気をつける時期を予測するため' },
  { table: 'settings', what: '設定（気をつける時期の日数、通知、ロック、隠すモードなど）', why: 'アプリの動きをあなたに合わせるため' },
  { table: 'keywords', what: '予定の重さを決める言葉', why: '予定が重いかを判定するため' },
  { table: 'conflict_states', what: 'お知らせを確認・対応したか（予定のIDと日付）', why: '同じお知らせをくり返さないため' },
  { table: 'metric_events', what: '利用状況の記録（設定でオフにできます）', why: '今月のふりかえりを出すため' },
  { table: 'title_weights', what: '覚えた予定の名前と重さ', why: '予定の重さの判定をあなたに合わせるため' },
  { table: 'event_reviews', what: '予定のあとの「どうだった？」の答え（予定のIDと日付）', why: '予定の重さと、気をつける時期の日数を推定するため' },
  { table: 'prediction_records', what: '出した予測と、実際の開始日', why: '予測の当たり具合を出すため' },
  { table: 'deferred_alerts', what: '通知で「今日は決めない」を押した予定（予定のIDと日付）', why: '次の日に一度だけ知らせ直すため' },
];

export const CALENDAR_NOTE =
  'カレンダーの予定は読むだけで、書き換えません。残すのは、上の一覧にある予定のIDと日付、覚えた予定の名前だけです。バックアップは、あなたが作った時だけ、パスワードで鍵をかけたファイルにします。';
