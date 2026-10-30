import { gcm } from '@noble/ciphers/aes.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/ciphers/utils.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { getRandomBytes } from 'expo-crypto';

/** パスワードから鍵を作る回数。ファイルに書くので、あとで変えても古いファイルは開ける */
// shortcut: OWASP の目安は 60万回だが、JavaScript だけの計算は PC の Node でも 60万回で約1.7秒かかり、iPhone ではその数倍になる。実機で測ってから上げる
export const ITERATIONS = 100_000;
const MIN_ITERATIONS = 1_000;
// 細工したファイルで何分も固まらないよう、読むときの上限を決めておく
const MAX_ITERATIONS = 5_000_000;
const VERSION = 1;

type Envelope = {
  app: 'karenda';
  kind: 'encrypted-backup';
  version: number;
  kdf: 'pbkdf2-sha256';
  iterations: number;
  salt: string;
  nonce: string;
  ciphertext: string;
};

export type OpenBackup =
  | { ok: true; text: string }
  | { ok: false; reason: 'broken' | 'notCocomia' | 'notEncrypted' | 'newer' | 'wrongPassphrase' };

// 全角と半角の違いで開けなくならないよう、そろえてから鍵にする
const deriveKey = (passphrase: string, salt: Uint8Array, iterations: number) =>
  pbkdf2Async(sha256, utf8ToBytes(passphrase.normalize('NFKC')), salt, { c: iterations, dkLen: 32 });

// Hermes に TextDecoder が無い版でも動くよう、UTF-8 は decodeURIComponent で戻す
const bytesToUtf8 = (bytes: Uint8Array) => decodeURIComponent(Array.from(bytes, (b) => `%${b.toString(16).padStart(2, '0')}`).join(''));

/** 書き出す中身をパスワードで暗号化した、ファイルの中身（JSON）を返す。平文のまま書き出す道は作らない */
export async function encryptBackup(
  text: string,
  passphrase: string,
  { random = getRandomBytes, iterations = ITERATIONS }: { random?: (n: number) => Uint8Array; iterations?: number } = {},
): Promise<string> {
  const salt = random(16);
  const nonce = random(12);
  const key = await deriveKey(passphrase, salt, iterations);
  const envelope: Envelope = {
    app: 'karenda',
    kind: 'encrypted-backup',
    version: VERSION,
    kdf: 'pbkdf2-sha256',
    iterations,
    salt: bytesToHex(salt),
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(gcm(key, nonce).encrypt(utf8ToBytes(text))),
  };
  return JSON.stringify(envelope);
}

const isHex = (value: unknown, bytes?: number): value is string =>
  typeof value === 'string' && /^([0-9a-f]{2})+$/.test(value) && (bytes === undefined || value.length === bytes * 2);

/** 暗号化したファイルを開く。外から来た中身なので形を確かめ、開けない時は理由を返す（例外は投げない） */
export async function openBackup(fileText: string, passphrase: string): Promise<OpenBackup> {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fileText);
  } catch {
    return { ok: false, reason: 'broken' };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'broken' };
  if (raw.app !== 'karenda') return { ok: false, reason: 'notCocomia' };
  if (raw.kind !== 'encrypted-backup') return { ok: false, reason: 'notEncrypted' };
  if (typeof raw.version === 'number' && raw.version > VERSION) return { ok: false, reason: 'newer' };
  const { version, kdf, iterations, salt, nonce, ciphertext } = raw;
  if (
    version !== VERSION ||
    kdf !== 'pbkdf2-sha256' ||
    !Number.isInteger(iterations) ||
    (iterations as number) < MIN_ITERATIONS ||
    (iterations as number) > MAX_ITERATIONS ||
    !isHex(salt, 16) ||
    !isHex(nonce, 12) ||
    !isHex(ciphertext)
  ) {
    return { ok: false, reason: 'broken' };
  }
  const key = await deriveKey(passphrase, hexToBytes(salt), iterations as number);
  try {
    return { ok: true, text: bytesToUtf8(gcm(key, hexToBytes(nonce)).decrypt(hexToBytes(ciphertext))) };
  } catch {
    // 鍵が違っても中身が書き換えられても、確かめの印が合わずにここに来る。どちらかは区別できない
    return { ok: false, reason: 'wrongPassphrase' };
  }
}
