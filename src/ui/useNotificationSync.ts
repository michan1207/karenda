import { useEffect } from 'react';

import { ConflictAlert, DateKey, planNotifications } from '../engine';
import type { Karenda } from './useKarenda';

/**
 * アプリを開くたび・予定や記録が変わるたびに、通知の予約を組み直す。
 * 通知を切っているときは予約をすべて消す。
 */
export function useNotificationSync(k: Karenda, alerts: ConflictAlert[], today: DateKey): void {
  const { status, onboarded, access, notifyEnabled, notifyAccess, notifier } = k;
  const ready = status === 'ready' && onboarded && access !== 'checking';
  const plans = JSON.stringify(notifyEnabled ? planNotifications(alerts, today) : []);

  useEffect(() => {
    if (!ready || notifyAccess !== 'granted') return;
    notifier.replaceAll(JSON.parse(plans)).catch(() => {});
  }, [ready, notifyAccess, notifier, plans]);
}
