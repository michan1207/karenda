const { withAndroidManifest } = require('expo/config-plugins');

const PORTRAIT = 'android.hardware.screen.portrait';

// The portrait lock makes Play treat a portrait screen as required and drop some devices; mark it optional.
module.exports = (config) =>
  withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest['uses-feature'] = (manifest['uses-feature'] ?? []).filter((f) => f.$['android:name'] !== PORTRAIT);
    manifest['uses-feature'].push({ $: { 'android:name': PORTRAIT, 'android:required': 'false' } });
    return mod;
  });
