import { getDocumentAsync } from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';

/** バックアップのファイルを渡す口と受け取る口。画面のテストでは偽物に差し替える */
export type BackupFiles = {
  /** 共有メニューで渡す。どこに保存するかは使う人が選ぶ */
  share(text: string, name: string): Promise<void>;
  /** ファイルを選んでもらい、中身を返す。やめた時は null */
  pick(): Promise<string | null>;
};

export const deviceBackupFiles: BackupFiles = {
  async share(text, name) {
    const file = new File(Paths.cache, name);
    file.create({ overwrite: true });
    try {
      await file.write(text);
      await shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'バックアップを保存' });
    } finally {
      // 渡し終えたら、端末の一時置き場には残さない
      if (file.exists) file.delete();
    }
  },
  async pick() {
    // 種類で絞ると iPhone で選べないことがあるので、何でも選べるようにして中身で確かめる
    const result = await getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled) return null;
    const file = new File(result.assets[0].uri);
    try {
      return await file.text();
    } finally {
      if (file.exists) file.delete();
    }
  },
};
