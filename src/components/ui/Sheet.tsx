// The universal modal ground (redesign R5, R6.16.2). Every modal and bottom
// sheet in the app mounts inside one of these — no screen hand-rolls a
// backdrop, radius, or safe-area inset again.
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type AppTheme } from '../../theme/ThemeContext';

interface SheetProps {
  visible: boolean;
  onRequestClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Content is already scrollable (a FlatList, say) — skip the inner one. */
  scrollable?: boolean;
  /** Fraction of the viewport the sheet may grow to. */
  maxHeight?: `${number}%`;
  footer?: React.ReactNode;
  testID?: string;
}

export function Sheet({
  visible,
  onRequestClose,
  title,
  children,
  scrollable = true,
  maxHeight = '80%',
  footer,
  testID,
}: SheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onRequestClose} testID={testID}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onRequestClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, theme.elevation.e3, { maxHeight, paddingBottom: theme.spacing.base + insets.bottom }]}>
          <View style={styles.grabber} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {scrollable ? (
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          ) : (
            <View style={styles.content}>{children}</View>
          )}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.scrim },
    sheet: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: theme.radius.hero,
      borderTopRightRadius: theme.radius.hero,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      gap: theme.spacing.md,
    },
    grabber: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.ink4,
      alignSelf: 'center',
    },
    title: {
      fontFamily: theme.fonts.display.semiBold,
      fontSize: theme.fontSize.lg,
      color: theme.colors.ink,
    },
    content: { gap: theme.spacing.sm, paddingBottom: theme.spacing.xs },
    footer: { gap: theme.spacing.sm },
  });
