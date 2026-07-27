// Haptics (redesign R3). One module so the rule — *haptics commit, never
// narrate* (R7) — is enforceable by grep: fire on deliberate actions only,
// never on scroll, tab change, or auto-navigation.
//
// Every call is fire-and-forget and swallows its own failure; a device with no
// haptic motor must not take a screen down with it.
import * as Haptics from 'expo-haptics';
import { logger } from '../../debug/logStore';

function safely(run: () => Promise<void>) {
  run().catch((error) => logger.debug('ui', 'Haptic failed', { error: String(error) }));
}

/** Committing a big action: Start cooking. */
export function hapticCommit() {
  safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** A smaller commit: Eat/Bin a leftover, apply a theme. */
export function hapticLight() {
  safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Discrete choice: rating stars, picking an option that writes. */
export function hapticSelection() {
  safely(() => Haptics.selectionAsync());
}

/** Completing a cook. */
export function hapticSuccess() {
  safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}
