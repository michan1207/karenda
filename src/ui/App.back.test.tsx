import { act, fireEvent, screen } from '@testing-library/react-native';
import { BackHandler } from 'react-native';

import { fakeCalendar, setup } from './testApp';

// Jest は iPhone 扱いで BackHandler が何もしないので、Android と同じく後から足したものを先に呼ぶ偽物を使う
let handlers: (() => boolean | null | undefined)[] = [];
const pressBack = () => act(async () => void [...handlers].reverse().some((handler) => handler()));

beforeEach(() => {
  handlers = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, handler) => {
    const listener = handler as (typeof handlers)[number];
    handlers.push(listener);
    return { remove: () => void (handlers = handlers.filter((other) => other !== listener)) };
  });
});

afterEach(() => jest.restoreAllMocks());

describe('Android back button', () => {
  it('returns to the calendar tab from alerts and settings, then leaves the app to the system', async () => {
    await setup();
    await fireEvent.press(await screen.findByText('設定'));
    expect(screen.getByRole('tab', { name: '設定', selected: true })).toBeTruthy();
    await pressBack();
    expect(screen.getByRole('tab', { name: 'カレンダー', selected: true })).toBeTruthy();
    expect(handlers).toHaveLength(0);
  });

  it('goes back one step in the first-run guide', async () => {
    await setup({ onboarded: false, starts: [] });
    await fireEvent.press(await screen.findByText('はじめる'));
    expect(screen.getByText('2 / 5')).toBeTruthy();
    await pressBack();
    expect(screen.getByText('1 / 5')).toBeTruthy();
    expect(handlers).toHaveLength(0);
  });

  it('closes the event form first and stays on the calendar', async () => {
    await setup({ calendar: fakeCalendar(false) });
    await fireEvent.press(await screen.findByLabelText('10月14日（水）'));
    await fireEvent.press(screen.getByText('この日に予定を入れる'));
    await pressBack();
    expect(screen.queryByLabelText('10月14日（水）に入れる予定の名前')).toBeNull();
    expect(screen.getByText('この日に予定を入れる')).toBeTruthy();
  });

  it('closes the backup screen before leaving settings', async () => {
    await setup();
    await fireEvent.press(await screen.findByText('設定'));
    await fireEvent.press(screen.getByText('暗号化して書き出す'));
    await pressBack();
    expect(screen.queryByLabelText('パスワード')).toBeNull();
    expect(screen.getByRole('tab', { name: '設定', selected: true })).toBeTruthy();
    await pressBack();
    expect(screen.getByRole('tab', { name: 'カレンダー', selected: true })).toBeTruthy();
  });
});
