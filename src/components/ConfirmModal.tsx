// Themed replacement for the OS-native Alert.alert — keeps confirmations
// and notices consistent with the rest of the app instead of dropping into
// a system dialog that ignores the Ember palette entirely.
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme/tokens';

export interface ConfirmModalButton {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'cancel' | 'destructive';
}

export interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons: ConfirmModalButton[];
  onRequestClose: () => void;
}

const VARIANT_STYLES: Record<NonNullable<ConfirmModalButton['variant']>, { bg: string; fg: string }> = {
  default: { bg: theme.colors.accent, fg: theme.colors.accentFg },
  cancel: { bg: theme.colors.chipBg, fg: theme.colors.ink2 },
  destructive: { bg: theme.colors.redTint, fg: theme.colors.red },
};

export function ConfirmModal({ visible, title, message, buttons, onRequestClose }: ConfirmModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.buttonRow}>
            {buttons.map((button, index) => {
              const { bg, fg } = VARIANT_STYLES[button.variant ?? 'default'];
              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.button, { backgroundColor: bg }]}
                  onPress={button.onPress}
                >
                  <Text style={[styles.buttonText, { color: fg }]}>{button.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(42,31,23,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.card,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  title: {
    fontFamily: theme.fonts.display.semiBold,
    fontSize: theme.fontSize.lg,
    color: theme.colors.ink,
  },
  message: {
    fontFamily: theme.fonts.body.regular,
    fontSize: theme.fontSize.base,
    color: theme.colors.ink2,
  },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, justifyContent: 'flex-end' },
  button: {
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
  },
  buttonText: {
    fontFamily: theme.fonts.body.semiBold,
    fontSize: theme.fontSize.sm,
  },
});
