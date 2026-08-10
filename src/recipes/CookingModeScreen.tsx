// §5.6 Cooking Mode. One master clock drives auto-advance off each step's
// (derived or authored) start_offset_seconds; manual ←/→ overrides it at
// any time. Persistence is event-driven only (§2.3) — nothing here writes
// on a per-second tick, the tick only forces a re-render so the on-screen
// clock and drift banner stay live.
//
// Two things the clock does NOT do (§5.6, spec v1.7):
//   1. Start on entry. The session opens in the ready state — paused at zero,
//      nothing scheduled — until the cook taps Start cooking.
//   2. Get duplicated per lane. Lane tabs, lane timers, and auto-switching are
//      all projections of this one clock (src/cooking/lanes.ts), which is why
//      parallel cooking needed no schema change.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon, ListIcon, PauseIcon, PlayIcon } from '../components/icons';
import { ConfirmModal } from '../components/ConfirmModal';
import { PillButton, SectionLabel, Sheet } from '../components/ui';
import { useConfirmModal } from '../components/useConfirmModal';
import {
  cancelAllCookingNotifications,
  ensureNotificationPermission,
  isAlertSoundEnabled,
  reconcileCookingNotifications,
} from '../cooking/notifications';
import {
  MAIN_LANE_KEY,
  buildLanes,
  laneBannerTarget,
  laneStatuses,
  lanesReadyToAdvance,
  resolveVisibleLane,
  shouldShowLaneTabs,
  visibleLaneWindow,
  type LaneStatus,
} from '../cooking/lanes';
import {
  advanceToStep,
  beginClock,
  checkpointSession,
  completeStep,
  discardSession,
  finishSession,
  findUnfinishedSession,
  isReadySession,
  loadStepRuntime,
  pauseSession,
  resetToStep,
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
import { getSurfaceEnabled } from '../bot/botSurfaceSettings';
import { CookingQuickAskSheet } from '../bot/CookingQuickAskSheet';
import { useBackHandler } from '../navigation/backStore';
import { useDb } from '../db/DbContext';
import { formatClock, formatDuration, formatDurationPrecise } from '../lib/formatDuration';
import { useUiChromeStore } from '../navigation/uiChromeStore';
import { getCookAutoAdvance, getSettingWithDefault } from '../settings/getSetting';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
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

function laneKeyOf(step: EnrichedStep | null | undefined): string {
  return step?.laneName ?? MAIN_LANE_KEY;
}

// Colour is never the only signal (redesign R7) — every lane state carries a
// glyph, because this screen is read at arm's length in bad light.
const LANE_GLYPH: Record<LaneStatus['state'], string> = {
  running: '●',
  overdue: '⚠',
  done: '✓',
  waiting: '○',
};

export function CookingModeScreen({ recipe, onExit, onComplete }: CookingModeScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  useKeepAwake();
  const db = useDb();
  const insets = useSafeAreaInsets();
  const { modal: infoModal, notice, confirm } = useConfirmModal();
  const setTabBarHidden = useUiChromeStore((s) => s.setTabBarHidden);

  // Cooking Mode is the one screen in the app that wants every pixel of
  // vertical space it can get — the tab bar comes back the moment we leave.
  useEffect(() => {
    setTabBarHidden(true);
    return () => setTabBarHidden(false);
  }, [setTabBarHidden]);

  useEffect(() => {
    getSurfaceEnabled(db, 'cooking_quick_ask').then(setQuickAskEnabled);
    getCookAutoAdvance(db).then(setAutoAdvance);
  }, [db]);

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
  // §A2.4: the mid-cook quick-ask sheet, gated on its surface toggle.
  const [showQuickAsk, setShowQuickAsk] = useState(false);
  const [quickAskEnabled, setQuickAskEnabled] = useState(false);
  // §C1: a non-blocking replacement for the retired full-screen takeover — the
  // lane that just alerted pulses briefly in the strip instead of stealing the
  // screen. Cleared ~2.5s later so it never lingers.
  const [flashLaneKey, setFlashLaneKey] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // §C3: parallel lanes the cook dismissed the "start it now" banner for. Reset
  // when the cook moves to a new step so a still-idle lane can reappear.
  const [dismissedLaneKeys, setDismissedLaneKeys] = useState<Set<string>>(new Set());
  // Non-null while the cook is peeking at a step other than the live one
  // (§ manual nav must not be auto-corrected — see the effect below).
  const [viewingStepId, setViewingStepId] = useState<number | null>(null);
  // Which lane's timeline is on screen, and whether the cook put it there by
  // hand. A hand-picked lane is pinned: the app won't pull it away (§5.6).
  const [visibleLaneKey, setVisibleLaneKey] = useState<string>(MAIN_LANE_KEY);
  const [pinnedLaneKey, setPinnedLaneKey] = useState<string | null>(null);
  const lastAlertedStepId = useRef<number | null>(null);
  const deniedNoticeShown = useRef(false);
  // §D1 auto-advance setting + guard. `advancing` prevents overlapping async
  // advances when several ticks land during one write.
  const [autoAdvance, setAutoAdvance] = useState(true);
  const advancing = useRef(false);

  // §C1: flash a lane tab briefly, replacing the old blocking takeover alert.
  function flashLane(key: string) {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlashLaneKey(key);
    flashTimer.current = setTimeout(() => setFlashLaneKey(null), 2500);
  }
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  // §F: hardware back checkpoints and leaves Cooking Mode, matching the on-screen
  // exit — never falls through to close the app. (Open sheets/takeover are RN
  // Modals, which intercept back themselves before this runs.)
  useBackHandler(stage !== 'loading', () => {
    void handleExit();
    return true;
  });

  const lanes = useMemo(() => buildLanes(timelineSteps), [timelineSteps]);
  const showLaneTabs = shouldShowLaneTabs(lanes);
  const timingById = useMemo(() => new Map(stepTimings.map((t) => [t.id, t])), [stepTimings]);

  // The visible lane always has to exist — a recipe with one lane pins itself
  // to it, and the first render happens before any lane has been chosen.
  useEffect(() => {
    if (!lanes.some((l) => l.key === visibleLaneKey)) {
      setVisibleLaneKey(lanes[0]?.key ?? MAIN_LANE_KEY);
      setPinnedLaneKey(null);
    }
  }, [lanes, visibleLaneKey]);

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
    const playSound = await isAlertSoundEnabled(db);
    await reconcileCookingNotifications(schedule, current.startedAt, (stepId) => stepById.get(stepId)?.instruction ?? 'Next step', playSound);
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
    // Ready, not running (§5.6): created paused at zero so entry is a moment
    // to read the first step, not a clock you're already losing to.
    const id = await startSession(db, recipe.id, recipe.baseServings, initialPhase, firstStepId, now, true);
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
      // §C1: haptic nudge + a non-blocking lane flash — no full-screen takeover,
      // so a parallel lane never loses the screen out from under the cook.
      const vibrateOn = (await getSettingWithDefault(db, 'alert_vibrate', '1')) === '1';
      if (vibrateOn) Vibration.vibrate(400);
      if (newStep) flashLane(laneKeyOf(newStep));
    }
  }

  // §D1 auto-advance within a lane: complete an overdue live step and start the
  // next step *in the same lane*. This is what makes intra-lane steps progress
  // reliably from the master clock, independent of the merged timeline order.
  // A backward peek (viewingStepId) is never disturbed — this only writes step
  // completion + starts the next; the displayed step follows the visible lane.
  async function advanceLaneStep(overdueStepId: number) {
    if (!session || advancing.current) return;
    const lane = lanes.find((l) => l.stepIds.includes(overdueStepId));
    if (!lane) return;
    const idx = lane.stepIds.indexOf(overdueStepId);
    const nextInLane = lane.stepIds[idx + 1] ?? null;
    const now = new Date().toISOString();
    advancing.current = true;
    try {
      await completeStep(db, session.id, overdueStepId, now);
      if (nextInLane != null) {
        // Move the session pointer + start the next step so it gets a real
        // actualStartOffset (drift/phase track the most recently started step).
        await advanceToStep(db, session, nextInLane, now);
        const nextStep = stepById.get(nextInLane);
        if (nextStep && nextStep.phase !== session.phase) await setPhase(db, session, nextStep.phase, now);
      }

      let updated = await reloadSession(session.id);
      if (!updated) return;
      if (nextInLane != null) {
        const nextTiming = stepTimings.find((s) => s.id === nextInLane);
        if (nextTiming) {
          const drift = Math.max(0, computeDriftSeconds(nextTiming, computeElapsedSeconds(updated, Date.now())));
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

      // Alert on the completed step's timer (passive/important), same rule as a
      // manual advance — the timer that just ran out is exactly the moment the
      // takeover/vibrate was asked for.
      const completedStep = stepById.get(overdueStepId);
      const nextStep = nextInLane != null ? stepById.get(nextInLane) : null;
      const shouldAlert = (completedStep?.effort === 'passive' && completedStep.durationSeconds != null) || nextStep?.important;
      if (shouldAlert && lastAlertedStepId.current !== overdueStepId) {
        lastAlertedStepId.current = overdueStepId;
        // §C1: vibrate + flash the lane, never a screen-stealing takeover.
        const vibrateOn = (await getSettingWithDefault(db, 'alert_vibrate', '1')) === '1';
        if (vibrateOn) Vibration.vibrate(400);
        flashLane(laneKeyOf(nextStep ?? completedStep));
      }
    } finally {
      advancing.current = false;
    }
  }

  // Ready → running (§5.6). Rebasing the clock here is what keeps drift
  // honest: the minutes spent reading the first step are not "behind".
  async function handleStartClock() {
    if (!session) return;
    await beginClock(db, session);
    const updated = await reloadSession(session.id);
    if (updated) {
      const runtime = await loadStepRuntime(db, updated.id, updated.startedAt);
      setStepRuntime(runtime);
      await reconcileNotificationsFor(updated, runtime);
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

  const isReady = session != null && isReadySession(session);
  const statuses = useMemo(
    () => (session ? laneStatuses(lanes, timingById, stepRuntime, elapsedSeconds, session.driftSeconds) : []),
    [lanes, timingById, stepRuntime, elapsedSeconds, session?.driftSeconds],
  );
  const visibleStatus = statuses.find((s) => s.key === visibleLaneKey) ?? statuses[0] ?? null;
  const visibleLaneStepIds = lanes.find((l) => l.key === visibleLaneKey)?.stepIds ?? timelineSteps.map((s) => s.id);

  // The app moves between lanes so the cook doesn't have to (§5.6). A pinned
  // lane holds; only a takeover-class alert overrides it, and that path runs
  // in handleAdvance below.
  useEffect(() => {
    if (stage !== 'active' || !session || isReady || statuses.length < 2) return;
    const { key } = resolveVisibleLane({ statuses, pinnedKey: pinnedLaneKey, currentKey: visibleLaneKey });
    if (key !== visibleLaneKey) {
      setVisibleLaneKey(key);
      setViewingStepId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, pinnedLaneKey, visibleLaneKey, stage, isReady]);

  // The displayed step follows the VISIBLE lane, not the global live step —
  // otherwise switching to the rice tab would show you the curry.
  const laneLiveStepId = visibleStatus?.liveStepId ?? visibleLaneStepIds[visibleLaneStepIds.length - 1] ?? null;
  const displayedStepId = viewingStepId ?? laneLiveStepId ?? session?.currentStepId ?? null;

  // §D1/§C2: drive auto-advance off the per-lane statuses. When ON, any lane
  // whose timed live step has elapsed advances itself. When OFF, do nothing — the
  // due step stays live, its timer keeps counting, and drift accrues (the "N min
  // behind" banner communicates pacing). No confirm dialog: the cook advances by
  // hand with the forward arrow, which now completes instantly (§C2).
  useEffect(() => {
    if (stage !== 'active' || !session || session.pausedAt != null || isReady) return;
    if (!autoAdvance) return;
    const dueStepIds = lanesReadyToAdvance(statuses);
    if (dueStepIds.length === 0) return;
    advanceLaneStep(dueStepIds[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, autoAdvance, stage, session?.pausedAt, isReady]);

  // §C3: a fresh step re-evaluates every lane banner — a lane the cook dismissed
  // while on the previous step may legitimately need starting now.
  useEffect(() => {
    setDismissedLaneKeys(new Set());
  }, [session?.currentStepId]);

  // §C3: the parallel lane the cook should be nudged to start now, if any. Only
  // meaningful with auto-advance OFF (lanes don't self-advance) and >1 lane.
  const bannerLane = useMemo(() => {
    if (autoAdvance || !showLaneTabs) return null;
    return laneBannerTarget(statuses, visibleLaneKey, Array.from(dismissedLaneKeys));
  }, [autoAdvance, showLaneTabs, statuses, visibleLaneKey, dismissedLaneKeys]);

  function selectLane(key: string) {
    if (key === visibleLaneKey) return;
    setVisibleLaneKey(key);
    setPinnedLaneKey(key); // deliberate navigation pins (§5.6)
    setViewingStepId(null);
  }

  // ←/→ walk the visible lane's steps, not the merged timeline.
  function neighbourOf(stepId: number | null, delta: number): number | null {
    const index = visibleLaneStepIds.indexOf(stepId ?? -1);
    if (index < 0) return null;
    const target = index + delta;
    if (target < 0 || target >= visibleLaneStepIds.length) return null;
    return visibleLaneStepIds[target];
  }

  // ← is a pure local "peek" — it never touches the session, never
  // completes a step, never nudges drift. → either continues catching the
  // view back up to the live step (also local) or, once past it, becomes a
  // real manual advance exactly as before.
  function handlePeekBack() {
    const prev = neighbourOf(displayedStepId, -1);
    if (prev == null) return;
    setViewingStepId(prev);
    setPinnedLaneKey(visibleLaneKey); // peeking is deliberate too — hold the lane
  }

  function handlePeekForward() {
    if (!session) return;
    const next = neighbourOf(displayedStepId, 1);
    if (next == null) return;
    // Whether this is a peek or a real advance is still decided on the GLOBAL
    // timeline: passing the live step is what completes steps and nudges drift.
    const liveIndex = timelineSteps.findIndex((s) => s.id === session.currentStepId);
    const nextIndex = timelineSteps.findIndex((s) => s.id === next);
    if (nextIndex <= liveIndex) {
      setViewingStepId(next === laneLiveStepId ? null : next);
      setPinnedLaneKey(visibleLaneKey);
      return;
    }

    // Past the live step, → marks the current step done and moves the timeline
    // on. This is now instant with no confirm (§C2/§C5) — the blocking dialogs
    // that broke parallel lanes are gone. The "Reset step timer" control (shown
    // once you've peeked ← back to a completed step) is the undo for an
    // accidental tap, since a completed step has no other way back.
    handleAdvance(next, false);
    setViewingStepId(null);
  }

  // "Back to live" (§5.6) — drops both the step peek and the lane pin, so the
  // app resumes moving the cook along on its own.
  function handleGoToCurrentStep() {
    setViewingStepId(null);
    setPinnedLaneKey(null);
  }

  // §C2: recover from an accidental instant-advance. The cook peeks ← back to an
  // already-completed step; this makes it live again and restarts its timer.
  function handleResetStepTimer() {
    if (!session || displayedStepId == null) return;
    const target = displayedStepId;
    confirm(
      "Reset this step's timer?",
      'Marks it the current step again and restarts its timer from now.',
      'Reset timer',
      async () => {
        await resetToStep(db, session, target, visibleLaneStepIds);
        const updated = await reloadSession(session.id);
        if (updated) {
          const runtime = await loadStepRuntime(db, updated.id, updated.startedAt);
          setStepRuntime(runtime);
          await reconcileNotificationsFor(updated, runtime);
        }
        lastAlertedStepId.current = null;
        setViewingStepId(null);
      },
    );
  }

  // §C4: "Cancel cook" — throw the session away (logs nothing), distinct from
  // Complete (logs the cook) and Exit (keeps it resumable). Confirmed first.
  function handleCancelCook() {
    confirm(
      'Cancel this cook?',
      'Your progress for this session is discarded. Nothing is logged.',
      'Cancel cook',
      async () => {
        if (session) {
          await cancelAllCookingNotifications();
          await discardSession(db, session.id);
        }
        onExit();
      },
      true,
    );
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
  // "Live" now means the visible lane's live step with no pin held — the two
  // things "Back to live" undoes.
  const isViewingLive =
    (viewingStepId == null || viewingStepId === laneLiveStepId) && pinnedLaneKey == null;
  const nextStepId = neighbourOf(displayedStepId, 1);
  const nextStep = nextStepId != null ? stepById.get(nextStepId) : null;
  const totalScheduled = stepTimings.reduce((acc, s) => acc + (s.durationSeconds ?? 0), 0);
  const eta = computeEtaSeconds(totalScheduled, session.driftSeconds);
  const currentTiming = currentStep ? stepTimings.find((s) => s.id === currentStep.id) : null;
  const currentStart = currentTiming ? effectiveStartOffset(currentTiming, stepRuntime.get(currentStep!.id), session.driftSeconds) : 0;
  const stepElapsed = Math.max(0, elapsedSeconds - currentStart);
  const liveStepRemaining = currentTiming?.durationSeconds != null ? Math.max(0, currentTiming.durationSeconds - stepElapsed) : null;
  const isPaused = session.pausedAt != null;
  const stepIndex = visibleLaneStepIds.indexOf(displayedStepId ?? -1);
  // §C2: the cook has peeked ← back to an already-completed step (behind the
  // visible lane's live step) — offer to reset its timer / make it live again.
  const liveIndexInLane = laneLiveStepId != null ? visibleLaneStepIds.indexOf(laneLiveStepId) : -1;
  const displayedBehindLive = !isReady && stepIndex >= 0 && liveIndexInLane >= 0 && stepIndex < liveIndexInLane;

  return (
    <View style={[styles.container, edgeStyle]}>
      <View style={styles.clockRow}>
        <Text style={[styles.clockSubtext, isReady && styles.clockResting]}>
          {formatDuration(elapsedSeconds)} / {formatDuration(eta)}
        </Text>
        <Text style={[styles.clockTimer, isReady && styles.clockResting]}>{formatClock(elapsedSeconds)}</Text>
      </View>
      {!isReady && session.driftSeconds > 30 && (
        <>
          <Text style={styles.driftText}>⚠ {Math.round(session.driftSeconds / 60)} min behind</Text>
          {/* The drift-aware nuance, said out loud once at the right moment
              (product review §3): a passive step that's already running doesn't
              care that you're behind, so don't let the warning read as panic. */}
          {currentStep?.effort === 'passive' && (
            <Text style={styles.driftReassure}>…but this step's already going — it'll keep cooking regardless.</Text>
          )}
        </>
      )}

      {showLaneTabs && (
        // §D2: a bounded, horizontally-scrollable strip with fixed-width tabs —
        // ~3 fit per screen so the strip never grows vertically or eats the step
        // area. The 3 most relevant lanes (visible + attention-needing) are
        // ordered first so they show without scrolling; the rest scroll into view.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.laneTabs}
          contentContainerStyle={styles.laneTabsContent}
          testID="lane-tabs"
        >
          {visibleLaneWindow(statuses, visibleLaneKey, statuses.length).map((status) => {
            const active = status.key === visibleLaneKey;
            return (
              <Pressable
                key={status.key}
                onPress={() => selectLane(status.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                testID={`lane-tab-${status.key}`}
                style={[styles.laneTab, active && styles.laneTabActive, status.key === flashLaneKey && styles.laneTabFlash]}
              >
                <Text
                  style={[
                    styles.laneTabName,
                    active && styles.laneTabNameActive,
                    status.state === 'overdue' && styles.laneTabOverdue,
                  ]}
                  numberOfLines={1}
                >
                  {LANE_GLYPH[status.state]} {status.name}
                </Text>
                <Text style={[styles.laneTabTimer, status.state === 'overdue' && styles.laneTabOverdue]}>
                  {laneTimerLabel(status)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {bannerLane && (
        // §C3: a gentle, dismissable nudge to get a second lane going. Tapping
        // the body switches to that lane; ✕ dismisses it until the next step.
        <View style={styles.laneBanner}>
          <TouchableOpacity style={styles.laneBannerBody} onPress={() => selectLane(bannerLane.key)} accessibilityRole="button">
            <Text style={styles.laneBannerText} numberOfLines={2}>
              ⏱ Start “{bannerLane.name}” now — you'll want it going too.
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setDismissedLaneKeys((prev) => new Set(prev).add(bannerLane.key))}
            hitSlop={8}
            accessibilityLabel={`Dismiss start ${bannerLane.name}`}
          >
            <Text style={styles.laneBannerDismiss}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.body}>
        <Text style={styles.phaseLabel}>
          {currentStep?.phase === 'prep' ? 'PREP' : 'COOK'}
          {currentStep?.laneName ? ` · ${currentStep.laneName}` : ''}
          {stepIndex >= 0 ? ` · Step ${stepIndex + 1} of ${visibleLaneStepIds.length}` : ''}
        </Text>
        <Text style={styles.instruction}>{currentStep?.instruction ?? 'All done'}</Text>
        {currentTiming?.durationSeconds != null && (
          <View style={styles.stepTimerRow}>
            <ClockIcon size={22} color={theme.colors.accentText} />
            <Text style={styles.stepTimer}>
              {formatDurationPrecise(
                !isReady && displayedStepId === laneLiveStepId
                  ? liveStepRemaining ?? 0
                  : currentTiming.durationSeconds,
              )}
            </Text>
          </View>
        )}

        {!isViewingLive && !isReady && (
          <View style={styles.peekActionsRow}>
            <TouchableOpacity style={styles.goToLiveButton} onPress={handleGoToCurrentStep} testID="back-to-live">
              <Text style={styles.goToLiveButtonText}>Back to live</Text>
            </TouchableOpacity>
            {displayedBehindLive && (
              <TouchableOpacity style={styles.resetStepButton} onPress={handleResetStepTimer} testID="reset-step-timer">
                <Text style={styles.resetStepButtonText}>Reset step timer</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.divider} />
        {nextStep ? (
          <Text style={styles.nextPeek}>NEXT · {nextStep.instruction}</Text>
        ) : (
          <Text style={styles.nextPeek}>Last step</Text>
        )}
      </ScrollView>

      <View style={styles.controlsRow}>
        {!isReady && (
          <>
            <TouchableOpacity onPress={isPaused ? handleResumeRunning : handlePause} style={styles.controlButton} testID="pause-toggle">
              {isPaused ? <PlayIcon size={22} color={theme.colors.accentText} /> : <PauseIcon size={22} color={theme.colors.accentText} />}
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePeekBack} style={styles.controlButton} testID="step-back">
              <ChevronLeftIcon size={26} color={theme.colors.accentText} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePeekForward} style={styles.controlButton} testID="step-forward">
              <ChevronRightIcon size={26} color={theme.colors.accentText} />
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity onPress={() => setShowStepList(true)} style={styles.controlButton}>
          <ListIcon size={22} color={theme.colors.accentText} />
        </TouchableOpacity>
        {quickAskEnabled && (
          <TouchableOpacity onPress={() => setShowQuickAsk(true)} style={styles.controlButton} accessibilityLabel="Ask Dishision Bot">
            <Text style={styles.quickAskGlyph}>✨</Text>
          </TouchableOpacity>
        )}
      </View>

      {isReady ? (
        // §5.6 ready state: one gate, the same accent pill that got you here
        // from Recipe detail, so the gesture repeats rather than surprises.
        <PillButton
          label="Start cooking"
          onPress={handleStartClock}
          variant="accent"
          haptic="commit"
          fullWidth
          testID="start-cooking"
        />
      ) : (
        <TouchableOpacity style={styles.completeButton} onPress={handleComplete}>
          <Text style={styles.completeButtonText}>Complete</Text>
        </TouchableOpacity>
      )}
      <View style={styles.exitRow}>
        <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
          <Text style={styles.exitButtonText}>{isReady ? 'Exit' : 'Exit (keeps your progress)'}</Text>
        </TouchableOpacity>
        {!isReady && (
          <TouchableOpacity style={styles.cancelCookButton} onPress={handleCancelCook} testID="cancel-cook">
            <Text style={styles.cancelCookButtonText}>Cancel cook</Text>
          </TouchableOpacity>
        )}
      </View>

      <CookingQuickAskSheet
        visible={showQuickAsk}
        onClose={() => setShowQuickAsk(false)}
        recipeId={recipe.id}
        recipeName={recipe.name}
        ingredientNames={recipe.ingredients.map((i) => i.displayName)}
        currentStepInstruction={currentStep?.instruction ?? null}
      />

      <StepListModal
        visible={showStepList}
        steps={recipe.steps}
        currentStepId={session.currentStepId}
        runtime={stepRuntime}
        onClose={() => setShowStepList(false)}
      />

      {infoModal}
    </View>
  );
}

// The ☰ sheet keeps the WHOLE recipe (the tabs are the per-lane view), now
// grouped by lane and carrying the same done/live markers as the tabs.
function StepListModal({
  visible,
  steps,
  currentStepId,
  runtime,
  onClose,
}: {
  visible: boolean;
  steps: EnrichedStep[];
  currentStepId: number | null;
  runtime: Map<number, StepRuntimeState>;
  onClose: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const grouped = useMemo(() => buildLanes(steps), [steps]);
  const stepById = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps]);
  const numberOf = useMemo(() => new Map(steps.map((s, i) => [s.id, i + 1])), [steps]);

  return (
    <Sheet visible={visible} onRequestClose={onClose} title="All steps" testID="all-steps-sheet">
      {grouped.map((lane) => (
        <View key={lane.key} style={styles.stepListGroup}>
          {grouped.length > 1 ? <SectionLabel>{lane.name}</SectionLabel> : null}
          {lane.stepIds.map((stepId) => {
            const step = stepById.get(stepId);
            if (!step) return null;
            const done = runtime.get(stepId)?.completed ?? false;
            const active = stepId === currentStepId;
            return (
              <View key={stepId} style={[styles.stepListRow, active && styles.stepListRowActive]}>
                <Text style={[styles.stepListNumber, active && styles.stepListNumberActive]}>
                  {done ? '✓' : numberOf.get(stepId)}
                </Text>
                <Text
                  style={[
                    styles.stepListText,
                    active && styles.stepListTextActive,
                    done && styles.stepListTextDone,
                  ]}
                >
                  {step.instruction}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </Sheet>
  );
}

function laneTimerLabel(status: LaneStatus): string {
  if (status.state === 'done') return 'done';
  if (status.seconds == null) return `${status.completedCount}/${status.totalCount}`;
  if (status.state === 'waiting') return `in ${formatDurationPrecise(status.seconds)}`;
  if (status.state === 'overdue') return 'now';
  return formatDurationPrecise(status.seconds);
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
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
  // A resting clock reads ink-3 and no lighter — at three feet in bad light
  // that contrast IS the "not started yet" affordance (redesign R6.8.1).
  clockResting: { color: theme.colors.ink3 },
  // §D2: a single, non-growing row. Fixed-width tabs keep sizing consistent
  // whatever the lane count; ~3 fit per screen and the rest scroll horizontally.
  laneTabs: { flexGrow: 0 },
  laneTabsContent: { flexDirection: 'row', gap: theme.spacing.sm, paddingRight: theme.spacing.base },
  laneTab: {
    minHeight: 44,
    width: 112,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  laneTabActive: { backgroundColor: theme.colors.accentTint },
  // §C1: the transient pulse that replaces the old takeover — an accent ring so
  // the cook's eye is drawn to the lane without the screen being stolen.
  laneTabFlash: { borderWidth: 2, borderColor: theme.colors.amberText, backgroundColor: theme.colors.amberTint },
  laneTabName: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  laneTabNameActive: { color: theme.colors.accentText },
  laneTabTimer: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.xs, color: theme.colors.ink3 },
  laneTabOverdue: { color: theme.colors.amberText },
  clockTimer: { fontFamily: theme.fonts.data.medium, fontSize: theme.fontSize.base, color: theme.colors.ink2 },
  driftText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.amberText, textAlign: 'center' },
  driftReassure: { fontFamily: theme.fonts.body.regular, fontSize: theme.fontSize.xs, color: theme.colors.ink3, textAlign: 'center', fontStyle: 'italic' },
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
  peekActionsRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  goToLiveButton: {
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accentTint,
  },
  goToLiveButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.accentText },
  // §C2: recovery control for an accidental instant-advance. Amber (a caution,
  // not a destructive red) — it restarts a timer, it doesn't delete anything.
  resetStepButton: {
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.amberTint,
  },
  resetStepButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.amberText },
  // §C3: the "start the other lane" nudge — an amber info banner, dismissable.
  laneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.amberTint,
    borderRadius: theme.radius.tile,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
  },
  laneBannerBody: { flex: 1 },
  laneBannerText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.amberText },
  laneBannerDismiss: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.amberText, paddingHorizontal: theme.spacing.xs },
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
  quickAskGlyph: { fontSize: 22 },
  completeButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.card, paddingVertical: theme.spacing.base, alignItems: 'center' },
  completeButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
  exitRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.base },
  exitButton: {
    flex: 1,
    backgroundColor: theme.colors.chipBg,
    borderRadius: theme.radius.card,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  exitButtonText: { fontFamily: theme.fonts.body.semiBold, fontSize: theme.fontSize.sm, color: theme.colors.ink2 },
  // §C4: destructive discard, visually distinct from Complete (accent) and Exit.
  cancelCookButton: {
    backgroundColor: theme.colors.redTint,
    borderRadius: theme.radius.card,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelCookButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.sm, color: theme.colors.red },
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
  stepListBackdropTouchable: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.scrim },
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
  stepListTextDone: { color: theme.colors.ink3, textDecorationLine: 'line-through' },
  stepListGroup: { gap: theme.spacing.sm },
  stepListCloseButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.card, paddingVertical: theme.spacing.sm, alignItems: 'center' },
  stepListCloseButtonText: { fontFamily: theme.fonts.body.bold, fontSize: theme.fontSize.base, color: theme.colors.accentFg },
});
