// https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// .claude/worktrees の古い作業用コピー（node_modules ごと）まで読むと、起動が止まるほど遅くなる
config.resolver.blockList = [...[].concat(config.resolver.blockList ?? []), /[\\/]\.claude[\\/].*/];

module.exports = config;
