import { useEffect, useEffectEvent } from 'react';
import { BackHandler } from 'react-native';

/**
 * Android の戻るボタン。active の間は onBack を呼び、アプリを閉じない。iPhone では何も起きない。
 * 後から active になったものが先に呼ばれるので、開いたフォームがタブより先に閉じる
 */
export function useBackButton(active: boolean, onBack: () => void) {
  const handle = useEffectEvent(onBack);
  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handle();
      return true;
    });
    return () => subscription.remove();
  }, [active]);
}
