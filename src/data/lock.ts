import { authenticateAsync, getEnrolledLevelAsync, SecurityLevel } from 'expo-local-authentication';

/** アプリのロックを開ける本人確認。顔や指紋は iPhone の中で確かめ、アプリには結果だけが届く。画面のテストでは偽物に差し替える */
export type Authenticator = {
  /** この iPhone に Face ID かパスコードが設定されていて、確かめられるか */
  isAvailable(): Promise<boolean>;
  authenticate(): Promise<boolean>;
};

export const deviceAuthenticator: Authenticator = {
  async isAvailable() {
    return (await getEnrolledLevelAsync()) !== SecurityLevel.NONE;
  },
  async authenticate() {
    // Face ID がうまくいかない時は、iPhone のパスコードでも開けるようにする
    const result = await authenticateAsync({ promptMessage: 'Cocomia のロックを解除', cancelLabel: 'キャンセル' });
    return result.success;
  },
};
