// 夏時間のある地域でテストを動かす。チリは切り替えの日に0時が存在しない（0時→1時）ので、日付の計算のずれが表に出る
module.exports = () => {
  process.env.TZ = 'America/Santiago';
};
