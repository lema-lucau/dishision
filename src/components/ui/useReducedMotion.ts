// Honours the OS "reduce motion" setting (redesign R3). Press-scale and layout
// animation are skipped when it's on; haptics are NOT — they're an
// accessibility aid, not motion.
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (!cancelled) setReduced(value);
      })
      .catch(() => {
        // A platform that can't answer is a platform without the setting.
      });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return reduced;
}
