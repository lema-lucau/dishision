// Keyboard avoidance without KeyboardAvoidingView (doesn't behave reliably
// across this app's screens). Tracks keyboard height via Keyboard events and
// exposes a ref-scroll helper: on a TextInput's onFocus, measure where it
// sits and scroll it above the keyboard if it would otherwise be covered.
//
// The keyboard height is read from a ref, not state: a focus handler fires
// before the keyboard has finished animating in (especially on Android,
// where keyboardDidShow can lag focus by hundreds of ms), so a value
// captured in a state-closure at focus time is reliably stale. Reading a
// ref inside the keyboardDidShow listener itself — re-running the same
// scroll math once the real height is known — is what makes this work for
// the "first tap opens the keyboard" case, not just tabbing between
// already-focused inputs.
import { useCallback, useEffect, useRef } from 'react';
import { Dimensions, Keyboard, Platform, ScrollView, type NativeScrollEvent, type NativeSyntheticEvent, type TextInput } from 'react-native';

const SHOW_EVENT = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE_EVENT = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
const BOTTOM_MARGIN = 24;

export function useKeyboardAwareScroll() {
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const focusedInputRef = useRef<TextInput | null>(null);

  const adjustForInput = useCallback((instance: TextInput | null) => {
    if (!scrollRef.current || !instance) return;
    instance.measureInWindow((_x, y, _width, height) => {
      const screenHeight = Dimensions.get('window').height;
      const visibleBottom = screenHeight - keyboardHeightRef.current;
      const overlap = y + height - visibleBottom + BOTTOM_MARGIN;
      if (overlap > 0) {
        scrollRef.current?.scrollTo({ y: scrollOffsetRef.current + overlap, animated: true });
      }
    });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener(SHOW_EVENT, (e) => {
      keyboardHeightRef.current = e.endCoordinates.height;
      adjustForInput(focusedInputRef.current);
    });
    const hide = Keyboard.addListener(HIDE_EVENT, () => {
      keyboardHeightRef.current = 0;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [adjustForInput]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  const scrollToInput = useCallback(
    (input: TextInput | React.RefObject<TextInput | null> | null) => {
      const instance = input != null && 'current' in input ? input.current : input;
      focusedInputRef.current = instance;
      // Covers the case where the keyboard is already up (tabbing between
      // fields) — keyboardDidShow won't refire, so this is the only trigger.
      // When the keyboard is opening for the first time, the listener above
      // re-runs this same adjustment with the real height once it lands.
      setTimeout(() => adjustForInput(instance), Platform.OS === 'ios' ? 50 : 100);
    },
    [adjustForInput],
  );

  return { scrollRef, scrollToInput, onScroll };
}
