import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

/** Start still; follow accessibility changes without requiring an app restart. */
export function useBloomMotion() {
  const [reduced, setReduced] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    let mounted = true;
    let changed = false;
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true;
      setReduced(value);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted && !changed) setReduced(value);
    }).catch(() => { /* Keep the accessible, still fallback. */ });
    const activity = AppState.addEventListener('change', value => setActive(value === 'active'));
    return () => { mounted = false; motion.remove(); activity.remove(); };
  }, []);
  return reduced || !active;
}
