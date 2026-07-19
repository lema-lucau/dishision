// §5.6 Cooking Mode. One master clock drives auto-advance off each step's
// (derived or authored) start_offset_seconds; manual ←/→ overrides it at
// any time. Persistence is event-driven only (§2.3) — nothing here writes
// on a per-second tick, the tick only forces a re-render so the on-screen
// clock and drift banner stay live.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon, ListIcon, PauseIcon, PlayIcon } from '../components/icons';
import { ConfirmModal } from '../components/ConfirmModal';
import { useConfirmModal } from '../components/useConfirmModal';
import {
  cancelAllCookingNotifications,
  ensureNotificationPermission,
  reconcileCookingNotifications,
} from '../cooking/notifications';
import {
  advanceToStep,
  checkpointSession,
  completeStep,
  finishSession,
  findUnfinishedSession,
  loadStepRuntime,
  pauseSession,
  resumeSession,
  setPhase,
  startSession,
  updateDrift,
  type CookingSessionRow,
} from '../cooking/session';
import {
  computeDriftSeconds,
  computeElapsedSeconds,
  computeEtaSeconds,
  computeNotificationSchedule,
  effectiveStartOffset,
  isSessionStale,
  type RecipeStepTiming,
  type StepRuntimeState,
} from '../cooking/sessionClock';
import { useDb } from '../db/DbContext';
import { formatClock, formatDuration } from '../lib/formatDuration';
import { useUiChromeStore } from '../navigation/uiChromeStore';
import { getSettingWithDefault } from '../settings/getSetting';
import { theme } from '../theme/tokens';
import type { EnrichedRecipe, EnrichedStep } from './loadRecipes';

interface CookingModeScreenProps {
  recipe: EnrichedRecipe;
  onExit: () => void;
  onComplete: () => void;
}

function toTiming(step: EnrichedStep): RecipeStepTiming {
  return {
    id: step.id,
    scheduledStartOffsetSeconds: step.startOffsetSeconds,
    durationSeconds: step.durationSeconds,
    effort: step.effort,
    important: step.important,
  };
}

export function CookingModeScreen({ recipe, onExit, onComplete }: CookingModeScreenProps) {
  useKeepAwake();
  const db = useDb();
  const insets = useSafeAreaInsets();
  const { modal: infoModal, notice } = useConfirmModal();
  const setTabBarHidden = useUiChromeStore((s) => s.setTabBarHidden);

  // Cooking Mode is the one screen in the app that wants every pixel of
  // vertical space it can get — the tab bar comes back the moment we leave.
  useEffect(() => {
    setTabBarHidden(true);
    return () => setTabBarHidden(false);
  }, [setTabBarHidden]);

  const prepSteps = useMemo(() => recipe.steps.filter((s) => s.phase === 'prep'), [recipe.steps]);
  const cookSteps = useMemo(() => recipe.steps.filter((s) => s.phase === 'cook'), [recipe.steps]);
  const prepIsTimed = prepSteps.some((s) => s.durationSeconds != null);
  // When prep is untimed it's a pre-session checklist, not part of the
  // master clock (§5.6) — the clocked timeline is cook-only in that case.
  const timelineSteps = prepIsTimed ? recipe.steps : cookSteps;
  const stepTimings = useMemo(() => timelineSteps.map(toTiming), [timelineSteps]);
  const stepById = useMemo(() => new Map(recipe.steps.map((s) => [s.id, s])), [recipe.steps]);

  const [stage, setStage] = useState<'loading' | 'entryChoice' | 'prepChecklist' | 'active'>('loading');
  const [staleFound, setStaleFound] = useState(false);
  const [pendingSession, setPendingSession] = useState<CookingSessionRow | null>(null);
  const [prepTicked, setPrepTicked] = useState<Set<number>>(new Set());
  const [session, setSession] = useState<CookingSessionRow | null>(null);
  const [stepRuntime, setStepRuntime] = useState<Map<number, StepRuntimeState>>(new Map());
  const [tickNow, setTickNow] = useState(() => Date.now());
  const [showStepList, setShowStepList] = useState(false);
  const [takeoverStep, setTakeoverStep] = useState<EnrichedStep | null>(null);
  // Non-null while the cook is peeking at a step other than the live one
  // (§ manual nav must not be auto-corrected — see the effect below).
  const [viewingStepId, setViewingStepId] = useState<number | null>(null);
  const lastAlertedStepId = useRef<number | null>(null);
  const deniedNoticeShown = useRef(false);

  useEffect(() => {
    findUnfinishedSession(db, recipe.id).then((existing) => {
      if (existing) {
        setPendingSession(existing);
        setStaleFound(isSessionStale(existing, Date.now()));
        setStage('entryChoice');
      } else if (!prepIsTimed && prepSteps.length > 0) {
        setStage('prepChecklist');
      } else {
        beginSession();
      }
    });
    // Only run once on mount — this is a one-time entry decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reloadSession(id: number) {
    const fresh = await findUnfinishedSession(db, recipe.id);
    if (fresh && fresh.id === id) {
      setSession(fresh);
      setStepRuntime(await loadStepRuntime(db, fresh.id, fresh.startedAt));
      return fresh;
    }
    return fresh;
  }

  async function reconcileNotificationsFor(current: CookingSessionRow, runtime: Map<number, StepRuntimeState>) {
    const schedule = computeNotificationSchedule(stepTimings, runtime, current.driftSeconds, current.pausedAt != null);
    await reconcileCookingNotifications(schedule, current.startedAt, (stepId) => stepById.get(stepId)?.instruction ?? 'Next step');
  }

  async function beginSession(resumeExisting?: CookingSessionRow) {
    const permission = await ensureNotificationPermission(db);
    if (permission === 'denied' && !deniedNoticeShown.current) {
      deniedNoticeShown.current = true;
      notice('Foreground alerts only', "Notifications were declined — you'll still get on-screen alerts while the app is open.");
    }

    if (resumeExisting) {
      const runtime = await loadStepRuntime(db, resumeExisting.id, resumeExisting.startedAt);
      setSession(resumeExisting);
      setStepRuntime(runtime);
      setStage('active');
      await reconcileNotificationsFor(resumeExisting, runtime);
      return;
    }

    const firstStepId = timelineSteps[0]?.id ?? null;
    const initialPhase: 'prep' | 'cook' = firstStepId != null && stepById.get(firstStepId)?.phase === 'prep' ? 'prep' : 'cook';
    const now = new Date().toISOString();
    const id = await startSession(db, recipe.id, recipe.baseServings, initialPhase, firstStepId, now);
    if (firstStepId != null) {
      await advanceToStep(db, { id, recipeId: recipe.id, servings: recipe.baseServings, phase: initialPhase, startedAt: now, elapsedSeconds: 0, pausedAt: null, driftSeconds: 0, currentStepId: firstStepId, updatedAt: now }, firstStepId, now);
    }
    const fresh = await reloadSession(id);
    setStage('active');
    if (fresh) await reconcileNotificationsFor(fresh, await loadStepRuntime(db, fresh.id, fresh.startedAt));
  }

  async function handleStartOver() {
    if (pendingSession) await finishSession(db, pendingSession.id);
    setPendingSession(null);
    if (!prepIsTimed && prepSteps.length > 0) setStage('prepChecklist');
    else await beginSession();
  }

  async function handleResume() {
    if (pendingSession) await beginSession(pendingSession);
  }

  function toggleTick(stepId: number) {
    setPrepTicked((s) => {
      const next = new Set(s);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }

  // §5.6: the tick only forces a re-render for the live clock display —
  // it never writes to the DB. Auto-advance below is the one thing a tick
  // can trigger, and that itself is an event-driven write.
  useEffect(() => {
    if (stage !== 'active' || !session || session.pausedAt != null) return;
    const interval = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [stage, session?.id, session?.pausedAt]);

  const elapsedSeconds = session ? computeElapsedSeconds(session, tickNow) : 0;

  // Auto-advance is purely time-driven and always keeps the LIVE step
  // (session.currentStepId) marching forward — it never looks at what the
  // cook is currently viewing. Peeking backward with ← must never be
  // fought by this effect.
  useEffect(() => {
    if (stage !== 'active' || !session || session.pausedAt != null) return;
    const currentIndex = timelineSteps.findIndex((s) => s.id === session.currentStepId);
    const next = timelineSteps[currentIndex + 1];
    if (!next) return;
    const nextTiming = stepTimings.find((s) => s.id === next.id)!;
    const nextStart = effectiveStartOffset(nextTiming, stepRuntime.get(next.id), session.driftSeconds);
    if (elapsedSeconds >= nextStart) handleAdvance(next.id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedSeconds, stage, session?.pausedAt, session?.currentStepId]);

  async function handleAdvance(newStepId: number, auto: boolean) {
    if (!session) return;
    const oldStepId = session.currentStepId;
    const oldIndex = timelineSteps.findIndex((s) => s.id === oldStepId);
    const newIndex = timelineSteps.findIndex((s) => s.id === newStepId);
    const now = new Date().toISOString();

    if (oldStepId != null && newIndex > oldIndex) {
      await completeStep(db, session.id, oldStepId, now);
    }
    await advanceToStep(db, session, newStepId, now);

    const newStep = stepById.get(newStepId);
    if (newStep && newStep.phase !== session.phase) {
      await setPhase(db, session, newStep.phase, now);
    }

    let updated = await reloadSession(session.id);
    if (!updated) return;

    if (auto) {
      const newTiming = stepTimings.find((s) => s.id === newStepId);
      if (newTiming) {
        const drift = Math.max(0, computeDriftSeconds(newTiming, computeElapsedSeconds(updated, Date.now())));
        if (drift !== updated.driftSeconds) {
          await updateDrift(db, updated, drift, now);
          updated = await reloadSession(session.id);
        }
      }
    }

    if (!updated) return;
    const runtime = await loadStepRuntime(db, updated.id, updated.startedAt);
    setStepRuntime(runtime);
    await reconcileNotificationsFor(updated, runtime);

    const oldStep = oldStepId != null ? stepById.get(oldStepId) : null;
    const shouldAlert = newIndex > oldIndex && ((oldStep?.effort === 'passive' && oldStep.durationSeconds != null) || newStep?.important);
    if (shouldAlert && lastAlertedStepId.current !== newStepId) {
      lastAlertedStepId.current = newStepId;
      const vibrateOn = (await getSettingWithDefault(db, 'alert_vibrate', '1')) === '1';
      const takeoverOn = (await getSettingWithDefault(db, 'alert_takeover', '1')) === '1';
      if (vibrateOn) Vibration.vibrate(400);
      if (takeoverOn && newStep) setTakeoverStep(newStep);
    }
  }

  async function handlePause() {
    if (!session) return;
    await pauseSession(db, session);
    const updated = await reloadSession(session.id);
    if (updated) await reconcileNotificationsFor(updated, stepRuntime);
  }

  async function handleResumeRunning() {
    if (!session) return;
    await resumeSession(db, session);
    const updated = await reloadSession(session.id);
    if (updated) await reconcileNotificationsFor(updated, stepRuntime);
  }

  const displayedStepId = viewingStepId ?? session?.currentStepId ?? null;

  function neighbourOf(stepId: number | null, delta: number): number | null {
    const index = timelineSteps.findIndex((s) => s.id === stepId);
    const target = index + delta;
    if (target < 0 || target >= timelineSteps.length) return null;
    return timelineSteps[target].id;
  }

  // ← is a pure local "peek" — it never touches the session, never
  // completes a step, never nudges drift. → either continues catching the
  // view back up to the live step (also local) or, once past it, becomes a
  // real manual advance exactly as before.
  function handlePeekBack() {
    const prev = neighbourOf(displayedStepId, -1);
    if (prev != null) setViewingStepId(prev);
  }

  function handlePeekForward() {
    if (!session) return;
    const next = neighbourOf(displayedStepId, 1);
    if (next == null) return;
    const liveIndex = timelineSteps.findIndex((s) => s.id === session.currentStepId);
    const nextIndex = timelineSteps.findIndex((s) => s.id === next);
    if (nextIndex <= liveIndex) {
      setViewingStepId(nextIndex === liveIndex ? null : next);
    } else {
      handleAdvance(next, false);
      setViewingStepId(null);
    }
  }

  function handleGoToCurrentStep() {
    setViewingStepId(null);
  }

  async function handleExit() {
    if (session) await checkpointSession(db, session);
    onExit();
  }

  async function handleComplete() {
    if (session) {
      await cancelAllCookingNotifications();
      await finishSession(db, session.id);
    }
    onComplete();
  }

  async function handlePrepDone() {
    await beginSession();
  }

  function handleSkipPrep() {
    setPrepTicked(new Set(prepSteps.map((s) => s.id)));
    beginSession();
  }

  const edgeStyle = { paddingTop: theme.spacing.base + insets.top, paddingBottom: theme.spacing.base + insets.bottom };

  if (stage === 'loading') {
    return (
      <View style={[styles.container, edgeStyle]}>
        <Text style={styles.loadingText}>Getting things ready…</Text>
      </View>
    );
  }

  if (stage === 'entryChoice') {
    return (
      <View style={[styles.container, edgeStyle]}>
        <ConfirmModal
          visible
          title="Unfinished cook in progress"
          message={
            staleFound
              ? "This session is more than 12 hours old — let's start fresh."
              : 'Pick up where you left off, or start over from the beginning?'
          }
          buttons={[
            ...(!staleFound ? [{ label: 'Resume', onPress: handleResume }] : []),
            { label: 'Start over', onPress: handleStartOver, variant: 'destructive' as const },
          ]}
          onRequestClose={() => {}}
        />
      </View>
    );
  }

  if (stage === 'prepChecklist') {
    const tickedCount = prepSteps.filter((s) => prepTicked.has(s.id)).length;
    const allTicked = tickedCount === prepSteps.length;
    return (
      <View style={[styles.container, edgeStyle]}>
        <View style={styles.prepHeaderRow}>
          <Text style={styles.title}>Prep · {recipe.name}</Text>
          <Text style={styles.stepCounter}>
            {tickedCount} / {prepSteps.length} steps
          </Text>
        </View>
        <ScrollView contentContainerStyle={styles.checklist}>
          {prepSteps.map((step) => (
            <TouchableOpacity key={step.id} style={styles.checklistRow} onPress={() => toggleTick(step.id)}>
              <Text style={styles.checklistCheck}>{prepTicked.has(step.id) ? '☑' : '☐'}</Text>
              <Text style={[styles.checklistText, prepTicked.has(step.id) && styles.checklistTextDone]}>{step.instruction}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={[styles.primaryButton, !allTicked && styles.primaryButtonInProgress]} onPress={handlePrepDone} disabled={!allTicked}>
          <Text style={[styles.primaryButtonText, !allTicked && styles.primaryButtonTextInProgress]}>
            {allTicked ? 'Start cooking' : `${tickedCount}/${prepSteps.length} done`}
          </Text>
        </TouchableOpacity>
        <View style={styles.prepFooterRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleSkipPrep}>
            <Text style={styles.secondaryButtonText}>Skip prep</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={onExit}>
            <Text style={styles.secondaryButtonText}>Exit</Text>
          </TouchableOpacity>
        </View>
        {infoModal}
      </View>
    );
  }

  if (!session) return null;

  const currentStep = stepById.get(displayedStepId ?? -1) ?? null;
  const isViewingLive = displayedStepId == null || displayedStepId === session.currentStepId;
  const nextStepId = neighbourOf(displayedStepId, 1);
  const nextStep = nextStepId != null ? stepById.get(nextStepId) : null;
  const totalScheduled = stepTimings.reduce((acc, s) => acc + (s.durationSeconds ?? 0), 0);
  const eta = computeEtaSeconds(totalScheduled, session.driftSeconds);
  const currentTiming = currentStep ? stepTimings.find((s) => s.id === currentStep.id) : null;
  const currentStart = currentTiming ? effectiveStartOffset(currentTiming, stepRuntime.get(currentStep!.id), session.driftSeconds) : 0;
  const stepElapsed = Math.max(0, elapsedSeconds - currentStart);
  const liveStepRemaining = currentTiming?.durationSeconds != null ? Math.max(0, currentTiming.durationSeconds - stepElapsed) : null;
  const isPaused = session.pausedAt != null;
  const stepIndex = timelineSteps.findIndex((s) => s.id === displayedStepId);

  return (
    <View style={[styles.container, edgeStyle]}>
      <View style={styles.clockRow}>
        <Text style={styles.clockSubtext}>
          {formatDuration(elapsedSeconds)} / {formatDuration(eta)}
        </Text>
        <Text style={styles.clockTimer}>{formatClock(elapsedSeconds)}</Text>
      </View>
      {session.driftSeconds > 30 && <Text style={styles.driftText}>⚠ {Math.round(session.driftSeconds / 60)} min behind</Text>}

      <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.body}>
        <Text style={styles.phaseLabel}>
          {currentStep?.phase === 'prep' ? 'PREP' : 'COOK'}
          {currentStep?.laneName ? ` · ${currentStep.laneName}` : ''}
          {stepIndex >= 0 ? ` · Step ${stepIndex + 1} of ${timelineSteps.length}` : ''}
        </Text>
        <Text style={styles.instruction}>{currentStep?.instruction ?? 'All done'}</Text>
        {currentTiming?.durationSeconds != null && (
          <View style={styles.stepTimerRow}>
            <ClockIcon size={22} color={theme.colors.accentText} />
            <Text style={styles.stepTimer}>{formatDuration(isViewingLive ? liveStepRemaining ?? 0 : currentTiming.durationSeconds)}</Text>
          </View>
        )}

        {!isViewingLive && (
          <TouchableOpacity style={styles.goToLiveButton} onPress={handleGoToCurrentStep}>
            <Text style={styles.goToLiveButtonText}>Go to current step</Text>
          </TouchableOpacity>
        )}

        <View style={styles.divider} />
        {nextStep ? (
          <Text style={styles.nextPeek}>NEXT · {nextStep.instruction}</Text>
        ) : (
          <Text style={styles.nextPeek}>Last step</Text>
        )}
      </ScrollView>

      <View style={styles.controlsRow}>
        <TouchableOpacity onPress={isPaused ? handleResumeRunning : handlePause} style={styles.controlButton}>
          {isPaused ? <PlayIcon size={22} color={theme.colors.accentText} /> : <PauseIcon size={22} color={theme.colors.accentText} />}
        </TouchableOpacity>
        <TouchableOpacity onPress={handlePeekBack} style={styles.controlButton}>
          <ChevronLeftIcon size={26} color={theme.colors.accentText} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handlePeekForward} style={styles.controlButton}>
          <ChevronRightIcon size={26} color={theme.colors.accentText} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowStepList(true)} style={styles.controlButton}>
          <ListIcon size={22} color={theme.colors.accentText} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.completeButton} onPress={handleComplete}>
        <Text style={styles.completeButtonText}>Complete</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
        <Text style={styles.exitButtonText}>Exit (keeps your progress)</Text>
      </TouchableOpacity>

      <StepListModal
        visible={showStepList}
        steps={recipe.steps}
        currentStepId={session.currentStepId}
        onClose={() => setShowStepList(false)}
      />

      <ConfirmModal
        visible={takeoverStep != null}
        title="Next step"
        message={takeoverStep?.instruction}
        buttons={[{ label: 'Got it', onPress: () => setTakeoverStep(null) }]}
        onRequestClose={() => setTakeoverStep(null)}
      />
      {infoModal}
    </View>
  );
}

function StepListModal({
  visible,
  steps,
  currentStepId,
  onClose,
}: {
  visible: boolean;
  steps: EnrichedStep[];
  currentStepId: number | null;
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <View style={styles.stepListBackdrop}>
      <TouchableOpacity style={styles.stepListBackdropTouchable} activeOpacity={1} onPress={onClose} />
      <View style={styles.stepListSheet}>
        <Text style={styles.stepListTitle}>All steps</Text>
        <ScrollView contentContainerStyle={styles.stepListContent}>
          {steps.map((step, index) => (
            <View key={step.id} style={[styles.stepListRow, step.id === currentStepId && styles.stepListRowActive]}>
              <Text style={[styles.stepListNumber, step.id === currentStepId && styles.stepListNumberActive]}>{index + 1}</Text>
              <Text style={[styles.stepListText, step.id === currentStepId && styles.stepListTextActive]}>{step.instruction}</Text>
            </View>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.stepListCloseButton} onPress={onClose}>
          <Text style={styles.stepListCloseButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing.base, gap: theme.spacing.base },
  loadingText: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink2, textAlign: 'center', marginTop: theme.spacing.xxl },
  title: { fontFamily: theme.fonts.display.bold, fontSize: theme.fontSize.xl, color: theme.colors.ink, flexShrink: 1 },
  prepHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  stepCounter: {
    fontFamily: theme.fonts.data.semiBold,
    fontSize: theme.fontSize.sm,
    color: theme.colors.ink2,
    backgroundColor: theme.colors.chipBg,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
  },
  checklist: { gap: theme.spacing.sm, paddingVertical: theme.spacing.base },
  checklistRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.sm },
  checklistCheck: { fontSize: theme.fontSize.lg, color: theme.colors.accentText },
  checklistText: { flex: 1, fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink },
  checklistTextDone: { color: theme.colors.ink3, textDecorationLine: 'line-through' },
  prepFooterRow: { flexDirection: 'row', gap: theme.spacing.sm },
  clockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md },
  clockSubtext: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.base, color: theme.colors.ink2 },
  clockTimer: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.base, color: theme.colors.ink2 },
  driftText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.amberText, textAlign: 'center' },
  bodyScroll: { flex: 1 },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.base },
  phaseLabel: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink3, letterSpacing: 1 },
  instruction: {
    fontFamily: theme.fonts.display.bold,
    fontSize: theme.fontSize.cookingMode,
    color: theme.colors.ink,
    textAlign: 'center',
  },
  stepTimerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  stepTimer: { fontFamily: theme.fonts.data.semiBold, fontSize: theme.fontSize.xl, color: theme.colors.accentText },
  goToLiveButton: {
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accentTint,
  },
  goToLiveButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  divider: { height: 1, width: '100%', backgroundColor: theme.colors.border },
  nextPeek: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink2 },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.card, paddingVertical: theme.spacing.base, alignItems: 'center' },
  completeButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
  exitButton: {
    backgroundColor: theme.colors.chipBg,
    borderRadius: theme.radius.card,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    marginBottom: theme.spacing.base,
  },
  exitButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  primaryButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.card, paddingVertical: theme.spacing.base, alignItems: 'center' },
  primaryButtonInProgress: { backgroundColor: theme.colors.accentTint },
  primaryButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
  primaryButtonTextInProgress: { color: theme.colors.accentText },
  secondaryButton: {
    flex: 1,
    backgroundColor: theme.colors.chipBg,
    borderRadius: theme.radius.card,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  stepListBackdrop: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  stepListBackdropTouchable: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(42,31,23,0.4)' },
  stepListSheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '75%',
    minHeight: '40%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.card,
    padding: theme.spacing.lg,
    gap: theme.spacing.base,
  },
  stepListTitle: { fontFamily: theme.fonts.display.semiBold, fontSize: theme.fontSize.lg, color: theme.colors.ink },
  stepListContent: { gap: theme.spacing.md, paddingBottom: theme.spacing.base },
  stepListRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surfaceWarm,
  },
  stepListRowActive: { backgroundColor: theme.colors.accentTint },
  stepListNumber: {
    fontFamily: theme.fonts.data.semiBold,
    fontSize: theme.fontSize.sm,
    color: theme.colors.ink3,
    width: 24,
    textAlign: 'center',
  },
  stepListNumberActive: { color: theme.colors.accentText },
  stepListText: { flex: 1, fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.base, color: theme.colors.ink, lineHeight: theme.fontSize.base + 6 },
  stepListTextActive: { fontFamily: theme.fonts.body.semiBold },
  stepListCloseButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.card, paddingVertical: theme.spacing.sm, alignItems: 'center' },
  stepListCloseButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
});
