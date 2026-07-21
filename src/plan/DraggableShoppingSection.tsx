// Long-press-then-drag reordering, constrained to one shopping list section
// at a time (§5.8 — replaces the old up/down arrows). Built on
// react-native-gesture-handler's Pan gesture with `activateAfterLongPress`
// (so a plain tap or the surrounding ScrollView's scroll still work
// normally until the hold threshold fires) and Reanimated shared values so
// the whole drag runs on the UI thread — no per-frame JS state updates.
//
// Reordering is committed OPTIMISTICALLY: on drop, the parent's `items`
// array is expected to update synchronously (same tick) via `onReorder`,
// which resets this component's internal slot mapping back to identity.
// That's what avoids a visible snap-back while the DB write is still in
// flight — the UI thread's rendered position and the new React order agree
// from the same instant.
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';

// Must match ShoppingListScreen's row height (50) plus its own marginBottom
// (theme.spacing.xs, 4) — these rows are absolutely positioned during drag,
// so that gap has to be baked into the slot height itself rather than
// coming from margin (which position:absolute ignores for layout purposes).
export const DRAG_ROW_HEIGHT = 54;

interface DraggableShoppingSectionProps<T extends { id: number }> {
  items: T[];
  renderRow: (item: T) => ReactNode;
  onReorder: (orderedIds: number[]) => void;
}

export function DraggableShoppingSection<T extends { id: number }>({ items, renderRow, onReorder }: DraggableShoppingSectionProps<T>) {
  const positions = useSharedValue<number[]>(items.map((_, i) => i));
  const idsKey = items.map((i) => i.id).join(',');

  useEffect(() => {
    positions.value = items.map((_, i) => i);
    // positions is a stable SharedValue identity; only the id sequence matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  function commit(newPositions: number[]) {
    const ordered = new Array<number>(items.length);
    newPositions.forEach((slot, originalIndex) => {
      ordered[slot] = items[originalIndex].id;
    });
    onReorder(ordered);
  }

  return (
    <View style={{ height: items.length * DRAG_ROW_HEIGHT }}>
      {items.map((item, index) => (
        <DraggableRow key={item.id} index={index} count={items.length} positions={positions} onDrop={commit}>
          {renderRow(item)}
        </DraggableRow>
      ))}
    </View>
  );
}

function DraggableRow({
  index,
  count,
  positions,
  onDrop,
  children,
}: {
  index: number;
  count: number;
  positions: SharedValue<number[]>;
  onDrop: (positions: number[]) => void;
  children: ReactNode;
}) {
  const dragging = useSharedValue(false);
  const dragTranslateY = useSharedValue(0);
  // The slot this row occupied at the instant the drag began — fixed for
  // the whole gesture, since e.translationY is always relative to gesture
  // start too (never re-derived from positions.value, which mutates live
  // as neighbours get displaced).
  const dragStartSlot = useSharedValue(0);
  // The slot this row is currently hovering over — read at gesture end to
  // know the final drop target without re-deriving it from translateY.
  const currentTargetSlot = useSharedValue(0);

  const pan = Gesture.Pan()
    .activateAfterLongPress(350)
    .onStart(() => {
      dragging.value = true;
      dragTranslateY.value = 0;
      dragStartSlot.value = positions.value[index];
      currentTargetSlot.value = positions.value[index];
    })
    .onUpdate((e) => {
      dragTranslateY.value = e.translationY;
      const rawTarget = dragStartSlot.value + Math.round(e.translationY / DRAG_ROW_HEIGHT);
      const targetSlot = Math.min(Math.max(rawTarget, 0), count - 1);
      if (targetSlot !== currentTargetSlot.value) {
        const next = positions.value.slice();
        const displacedIndex = next.findIndex((slot) => slot === targetSlot);
        if (displacedIndex !== -1) {
          next[displacedIndex] = currentTargetSlot.value;
          next[index] = targetSlot;
          positions.value = next;
          currentTargetSlot.value = targetSlot;
        }
      }
    })
    .onEnd(() => {
      dragging.value = false;
      runOnJS(onDrop)(positions.value);
    });

  const style = useAnimatedStyle(() => {
    if (dragging.value) {
      // Direct 1:1 finger tracking while dragging — no spring lag.
      return {
        transform: [{ translateY: dragStartSlot.value * DRAG_ROW_HEIGHT + dragTranslateY.value }],
        zIndex: 10,
        shadowOpacity: 0.18,
        shadowRadius: 8,
        elevation: 6,
      };
    }
    return {
      transform: [{ translateY: withSpring(positions.value[index] * DRAG_ROW_HEIGHT, { damping: 20, stiffness: 200 }) }],
      zIndex: 1,
      shadowOpacity: 0,
      elevation: 0,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.row, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: DRAG_ROW_HEIGHT,
    justifyContent: 'center',
  },
});
