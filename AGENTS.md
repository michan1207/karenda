This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

Project rules (no network access, no definitive medical claims, one purpose per PR) are in `CLAUDE.md`; details are in `.claude/memory/`.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # use instead of npm/yarn/pnpm/bun add — then pin native expo-* to node_modules/expo/bundledNativeModules.json
npx expo start              # start the dev server
npm run check               # typecheck + lint + tests (same as CI)
npx expo-doctor             # diagnose dependency and config issues
```

Run `npm run check` before declaring any task done. `npx expo install` can pick a newer patch than Expo Go ships, which crashes iOS at launch ("DYLD Symbol missing"); `src/dependencies.test.ts` checks this for expo-font and expo-asset.

## Navigation & Layers

- This app does **not** use Expo Router (it is not installed). `src/ui/App.tsx` shows one of three screens (calendar, alerts, settings) from a `tab` state and draws its own bottom tab bar. Do not add `expo-router`, React Navigation, or a `src/app/` folder.
- Layers: `src/engine` (pure logic, no Expo imports) → `src/data` (SQLite, calendar, notifications) → `src/ui` (screens). Screens import only from `src/data/index.ts` and `src/engine/index.ts`.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- The owner tests in Expo Go, which only includes its bundled native modules. Use only those; do not add a library that needs a development build.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
