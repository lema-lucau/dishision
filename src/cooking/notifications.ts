// §5.6/§1.2 local notifications — the ONLY place in the app permitted to
// schedule one. Thin side-effecting shell around expo-notifications; all
// the actual scheduling logic lives in the pure computeNotificationSchedule
// (sessionClock.ts) so this file only has to convert that desired set into
// real OS calls and reconcile against whatever's currently scheduled.
//
// Reconciliation strategy: cancel everything, then (re)schedule the full
// desired set. Simpler than diffing, and correct for every event this
// screen fires on — pause (desired=[]), resume/advance/drift (desired
// recomputed with the new drift/runtime), and complete/exit (desired=[]).
import * as Notifications from 'expo-notifications';
import type { DbClient } from '../db/DbClient';
import { logger } from '../debug/logStore';
import { getSettingWithDefault } from '../settings/getSetting';
import type { ScheduledNotification } from './sessionClock';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type NotificationPermissionOutcome = 'granted' | 'denied' | 'skipped';

// Requested once, on first Cooking Mode entry (§5.6). Never re-prompted —
// the app remembers it asked via the `notifications_prompted` setting, even
// if the user said no.
export async function ensureNotificationPermission(db: DbClient): Promise<NotificationPermissionOutcome> {
  const alreadyPrompted = (await getSettingWithDefault(db, 'notifications_prompted', '0')) === '1';
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (alreadyPrompted) return 'denied';

    const result = await Notifications.requestPermissionsAsync();
    await db.runAsync(
      `INSERT INTO setting (key, value) VALUES ('notifications_prompted', '1')
       ON CONFLICT(key) DO UPDATE SET value = '1'`,
    );
    return result.granted ? 'granted' : 'denied';
  } catch (error) {
    logger.warn('engine', 'Notification permission check failed — falling back to foreground-only alerts', { error: String(error) });
    return 'skipped';
  }
}

export async function cancelAllCookingNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    logger.warn('engine', 'Failed to cancel scheduled notifications', { error: String(error) });
  }
}

// Converts the pure desired-schedule into real OS notifications, anchored
// to the session's real start time. Past-due entries (fireAt already
// elapsed, e.g. right after a resume) are skipped — a notification that
// fires in the past is a notification that never fires.
export async function reconcileCookingNotifications(
  schedule: ScheduledNotification[],
  sessionStartedAt: string,
  stepLabel: (stepId: number) => string,
): Promise<void> {
  await cancelAllCookingNotifications();
  const startMs = new Date(sessionStartedAt).getTime();
  const now = Date.now();

  for (const entry of schedule) {
    const fireAtMs = startMs + entry.fireAtOffsetSeconds * 1000;
    const secondsFromNow = (fireAtMs - now) / 1000;
    if (secondsFromNow <= 0) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Next step',
          body: stepLabel(entry.stepId),
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: secondsFromNow,
          repeats: false,
        },
      });
    } catch (error) {
      logger.warn('engine', 'Failed to schedule a cooking notification', { stepId: entry.stepId, error: String(error) });
    }
  }
}
