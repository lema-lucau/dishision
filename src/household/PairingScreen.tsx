// §5.11 "Add person": QR primary, pairing code as fallback. This phone
// shows its own QR/code by default and listens for an incoming pairing
// attempt (§7.5 step 0) for as long as the screen is open; "Scan / enter
// address" switches to being the connecting side instead.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useDb } from '../db/DbContext';
import { logger } from '../debug/logStore';
import type { Profile } from '../profile/ensureProfile';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { formatAddress, parseAddress, SYNC_PORT } from './address';
import { getLocalAddress } from './localAddress';
import { upsertHouseholdMember } from './householdMutations';
import { initiatePairing, PairingRejectedError, type PairingSession } from './pairingProtocol';
import { mintSyncSecret } from './syncSecret';
import { QrScannerScreen } from '../sharing/QrScannerScreen';

interface PairingScreenProps {
  profile: Profile;
  onBack: () => void;
  onPaired: () => void;
}

interface QrPayload {
  personId: string;
  displayName: string;
  avatarEmoji: string;
  address: string;
  secret: string;
}

function randomSixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function PairingScreen({ profile, onBack, onPaired }: PairingScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const [mode, setMode] = useState<'show' | 'scan' | 'manual'>('show');
  const [session, setSession] = useState<PairingSession | null>(null);
  const [localAddress, setLocalAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [manualAddress, setManualAddress] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [connecting, setConnecting] = useState(false);

  // Mints a fresh secret + code and starts listening the moment this
  // screen opens; stops the moment it's left (§7.5 — "opened only while
  // its pairing/sync screen is visible").
  useEffect(() => {
    let listener: { close(): void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const secret = await mintSyncSecret();
        const code = randomSixDigitCode();
        const address = await getLocalAddress();
        if (cancelled) return;
        setSession({ secret, code });
        setLocalAddress(address);

        const { startListener } = await import('./tcpChannel');
        const { handleIncomingConnection } = await import('./pairingProtocol');
        listener = startListener(SYNC_PORT, (channel) => {
          handleIncomingConnection(db, channel, { personId: profile.person_id, displayName: profile.display_name, avatarEmoji: profile.avatar_emoji }, { secret, code }).catch(
            (err) => logger.warn('sync', 'Incoming pairing connection failed', { error: String(err) }),
          );
        });
      } catch (err) {
        logger.warn('sync', 'Could not start pairing listener', { error: String(err) });
        if (!cancelled) setError("Couldn't determine this device's network address. Check WiFi is connected.");
      }
    })();

    return () => {
      cancelled = true;
      listener?.close();
    };
  }, [db, profile]);

  const qrPayload: QrPayload | null =
    session && localAddress
      ? { personId: profile.person_id, displayName: profile.display_name, avatarEmoji: profile.avatar_emoji, address: localAddress, secret: session.secret }
      : null;

  async function connectAndPair(address: string, proof: { secret?: string; code?: string }) {
    setConnecting(true);
    setError(null);
    try {
      const { host, port } = parseAddress(address);
      const { connectToPeer } = await import('./tcpChannel');
      const channel = await connectToPeer(host, port);
      const result = await initiatePairing(
        channel,
        { personId: profile.person_id, displayName: profile.display_name, avatarEmoji: profile.avatar_emoji },
        proof,
      );
      await upsertHouseholdMember(db, {
        personId: result.personId,
        displayName: result.displayName,
        avatarEmoji: result.avatarEmoji,
        syncSecret: result.secret,
        lastKnownAddress: address,
      });
      onPaired();
    } catch (err) {
      logger.warn('sync', 'Pairing failed', { error: String(err) });
      setError(err instanceof PairingRejectedError ? err.message : "Couldn't reach that phone. Same WiFi?");
    } finally {
      setConnecting(false);
    }
  }

  function handleScanned(data: string) {
    setMode('show');
    try {
      const payload = JSON.parse(data) as QrPayload;
      connectAndPair(payload.address, { secret: payload.secret });
    } catch {
      setError("That QR code doesn't look like a Dishision pairing code.");
    }
  }

  if (mode === 'scan') {
    return <QrScannerScreen title="Scan their pairing QR" onBack={() => setMode('show')} onScanned={handleScanned} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Add person</Text>

      {mode === 'show' && (
        <>
          <Text style={styles.hint}>Have them scan this, or use the code below.</Text>
          {qrPayload ? (
            <View style={styles.qrWrap}>
              <QRCode value={JSON.stringify(qrPayload)} size={220} backgroundColor={theme.colors.surface} color={theme.colors.ink} />
            </View>
          ) : (
            <ActivityIndicator color={theme.colors.accent} style={{ marginVertical: theme.spacing.xl }} />
          )}
          {localAddress && session && (
            <Text style={styles.codeLine}>
              {localAddress.split(':')[0]} · code {session.code}
            </Text>
          )}
          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity style={styles.secondaryButton} onPress={() => setMode('scan')}>
            <Text style={styles.secondaryButtonText}>Scan their code instead</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setMode('manual')}>
            <Text style={styles.secondaryButtonText}>Enter address + code instead</Text>
          </TouchableOpacity>
        </>
      )}

      {mode === 'manual' && (
        <>
          <Text style={styles.hint}>Ask them to open Household → Add person and read out their address and code.</Text>
          <TextInput
            style={styles.input}
            value={manualAddress}
            onChangeText={setManualAddress}
            placeholder="192.168.1.24"
            placeholderTextColor={theme.colors.ink3}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={manualCode}
            onChangeText={setManualCode}
            placeholder="6-digit code"
            placeholderTextColor={theme.colors.ink3}
            keyboardType="number-pad"
            maxLength={6}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <TouchableOpacity
            style={styles.primaryButton}
            disabled={connecting || !manualAddress.trim() || manualCode.length !== 6}
            onPress={() => connectAndPair(formatAddress(manualAddress.trim(), SYNC_PORT), { code: manualCode })}
          >
            <Text style={styles.primaryButtonText}>{connecting ? 'Connecting…' : 'Pair'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setMode('show')}>
            <Text style={styles.secondaryButtonText}>Back to my code</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    content: { padding: theme.spacing.base, gap: theme.spacing.md, paddingBottom: theme.spacing.xxl, alignItems: 'center' },
    backButton: { alignSelf: 'flex-start' },
    back: { alignSelf: 'flex-start', fontFamily: theme.fonts.body.semiBold, color: theme.colors.accentText },
    title: { alignSelf: 'flex-start', fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink },
    hint: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.sm, color: theme.colors.ink3, textAlign: 'center' },
    qrWrap: { padding: theme.spacing.base, backgroundColor: theme.colors.surface, borderRadius: theme.radius.card },
    codeLine: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.md, color: theme.colors.ink },
    error: { fontFamily: theme.fonts.body.medium, fontSize: theme.fontSize.sm, color: theme.colors.red, textAlign: 'center' },
    secondaryButton: { backgroundColor: theme.colors.chipBg, borderRadius: theme.radius.pill, paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.lg },
    secondaryButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
    input: {
      width: '100%',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radius.card,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      fontFamily: theme.fonts.data.medium,
      fontSize: theme.fontSize.base,
      color: theme.colors.ink,
    },
    primaryButton: { width: '100%', backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingVertical: theme.spacing.md, alignItems: 'center' },
    primaryButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
  });
