import { useMemo } from 'react';

import { addDays, computeGuard, DateKey, REVIEW_DAYS, ReviewTarget, reviewTargets } from '../engine';
import { useEvents } from './useEvents';
import type { Karenda } from './useKarenda';
import { UPCOMING_DAYS } from './useUpcomingAlerts';

/** 「どうだった？」と聞く予定。ホームで聞く7日前の分から、通知で聞く30日先の分まで */
export function useReviewTargets(k: Karenda, today: DateKey): ReviewTarget[] {
  const range = useMemo(() => ({ from: addDays(today, -REVIEW_DAYS), until: addDays(today, UPCOMING_DAYS) }), [today]);
  const events = useEvents(k.calendar, k.access, range.from, range.until, k.manualEvents);

  return useMemo(() => {
    const { zones } = computeGuard({ starts: k.starts, settings: k.settings, keywords: k.keywords, events, range });
    return reviewTargets({ events, zones, starts: k.starts, pmsDays: k.settings.pmsDays, keywords: k.keywords });
  }, [k.starts, k.settings, k.keywords, events, range]);
}
