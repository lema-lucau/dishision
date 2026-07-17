// Small ergonomic wrapper around ConfirmModal so call sites read like the
// Alert.alert calls they replace, without dropping into a native dialog.
import { useCallback, useState } from 'react';
import { ConfirmModal, type ConfirmModalButton } from './ConfirmModal';

interface ModalState {
  title: string;
  message?: string;
  buttons: ConfirmModalButton[];
}

export function useConfirmModal() {
  const [state, setState] = useState<ModalState | null>(null);

  const close = useCallback(() => setState(null), []);

  const notice = useCallback(
    (title: string, message?: string, buttonLabel = 'OK') => {
      setState({ title, message, buttons: [{ label: buttonLabel, onPress: close, variant: 'default' }] });
    },
    [close],
  );

  const confirm = useCallback(
    (title: string, message: string | undefined, confirmLabel: string, onConfirm: () => void, destructive = false) => {
      setState({
        title,
        message,
        buttons: [
          { label: 'Cancel', onPress: close, variant: 'cancel' },
          {
            label: confirmLabel,
            onPress: () => {
              close();
              onConfirm();
            },
            variant: destructive ? 'destructive' : 'default',
          },
        ],
      });
    },
    [close],
  );

  const modal = (
    <ConfirmModal
      visible={state != null}
      title={state?.title ?? ''}
      message={state?.message}
      buttons={state?.buttons ?? []}
      onRequestClose={close}
    />
  );

  return { modal, notice, confirm };
}
