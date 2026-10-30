import { randomBytes } from 'node:crypto';

import { encryptBackup, isEncryptedBackup, ITERATIONS, openBackup } from './backup';

jest.mock('expo-crypto', () => ({}));

const random = (n: number) => new Uint8Array(randomBytes(n));
// テストを速くするため回数を減らす。実際のファイルは ITERATIONS 回
const fast = { random, iterations: 1_000 };
const text = JSON.stringify({ app: 'karenda', periodStarts: ['2026-09-01'], keywords: { high: ['出張'], medium: [] } });

describe('encrypted backup', () => {
  it('opens what it locked with the same passphrase', async () => {
    const file = await encryptBackup(text, 'すみれ色の朝', fast);
    expect(await openBackup(file, 'すみれ色の朝')).toEqual({ ok: true, text });
  });

  it('never writes the records or the passphrase in readable form', async () => {
    const file = await encryptBackup(text, 'すみれ色の朝', fast);
    expect(file).not.toContain('2026-09-01');
    expect(file).not.toContain('出張');
    expect(file).not.toContain('すみれ色の朝');
  });

  it('uses a new salt and nonce every time', async () => {
    expect(await encryptBackup(text, 'pass-1234', fast)).not.toBe(await encryptBackup(text, 'pass-1234', fast));
  });

  it('uses the full number of rounds by default', async () => {
    const file = await encryptBackup(text, 'pass-1234', { random });
    expect(JSON.parse(file).iterations).toBe(ITERATIONS);
    expect(await openBackup(file, 'pass-1234')).toEqual({ ok: true, text });
    // 本当の回数で鍵を2回作るので、遅いPCでは既定の5秒を超えることがある
  }, 20_000);

  it('treats full-width and half-width letters as the same passphrase', async () => {
    const file = await encryptBackup(text, 'ｐａｓｓ－１２３４', fast);
    expect(await openBackup(file, 'pass-1234')).toEqual({ ok: true, text });
  });

  it('refuses a wrong passphrase without throwing', async () => {
    const file = await encryptBackup(text, 'pass-1234', fast);
    expect(await openBackup(file, 'pass-1235')).toEqual({ ok: false, reason: 'wrongPassphrase' });
  });

  it('refuses a file whose contents were changed', async () => {
    const envelope = JSON.parse(await encryptBackup(text, 'pass-1234', fast));
    const flipped = (parseInt(envelope.ciphertext[0], 16) ^ 1).toString(16);
    const tampered = JSON.stringify({ ...envelope, ciphertext: flipped + envelope.ciphertext.slice(1) });
    expect(await openBackup(tampered, 'pass-1234')).toEqual({ ok: false, reason: 'wrongPassphrase' });
  });

  it('knows which files need a passphrase', async () => {
    expect(isEncryptedBackup(await encryptBackup(text, 'pass-1234', fast))).toBe(true);
    expect(isEncryptedBackup(text)).toBe(false);
    expect(isEncryptedBackup('こんにちは')).toBe(false);
  });

  it('tells an unencrypted export apart from a broken file', async () => {
    expect(await openBackup(text, 'pass-1234')).toEqual({ ok: false, reason: 'notEncrypted' });
  });

  it('says when a file comes from a newer app', async () => {
    const envelope = JSON.parse(await encryptBackup(text, 'pass-1234', fast));
    expect(await openBackup(JSON.stringify({ ...envelope, version: 2 }), 'pass-1234')).toEqual({ ok: false, reason: 'newer' });
  });

  it('says when a file belongs to another app', async () => {
    const envelope = JSON.parse(await encryptBackup(text, 'pass-1234', fast));
    expect(await openBackup(JSON.stringify({ ...envelope, app: 'other' }), 'pass-1234')).toEqual({ ok: false, reason: 'notCocomia' });
  });

  it.each([
    ['not JSON', () => 'こんにちは'],
    ['a missing part', (e: Record<string, unknown>) => ({ ...e, nonce: undefined })],
    ['letters that are not hex', (e: Record<string, unknown>) => ({ ...e, salt: 'zz'.repeat(16) })],
    ['a short nonce', (e: Record<string, unknown>) => ({ ...e, nonce: 'ab' })],
    ['far too many rounds', (e: Record<string, unknown>) => ({ ...e, iterations: 1e9 })],
  ])('refuses %s as broken', async (_, change) => {
    const envelope = JSON.parse(await encryptBackup(text, 'pass-1234', fast));
    const changed = change(envelope);
    const file = typeof changed === 'string' ? changed : JSON.stringify(changed);
    expect(await openBackup(file, 'pass-1234')).toEqual({ ok: false, reason: 'broken' });
  });
});
