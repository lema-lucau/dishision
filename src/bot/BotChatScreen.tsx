// The Dishision Bot container: its own small screen stack (chat · review · diff
// · history), same local-ViewState pattern as RecipesScreen. Owns the chat, its
// messages, and the working recipe draft, and routes turns through botTurn.
// Every chat is a 1:1 conversation ↔ recipe-draft pairing (§1).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useConfirmModal } from '../components/useConfirmModal';
import { useDb } from '../db/DbContext';
import { loadRecipeDraft } from '../recipes/loadRecipeForEdit';
import type { RecipeDraft } from '../recipes/recipeSave';
import { useTheme, type AppTheme } from '../theme/ThemeContext';
import { BotApiError } from './anthropicClient';
import { hasApiKey } from './apiKeyStore';
import { getBotSettings } from './botSettings';
import { saveBotRecipe, type SaveMode } from './botSave';
import { retryTurn, sendUserTurn } from './botTurn';
import { getUserName } from './botUser';
import { applyBotDiff, buildBotDiff, type BotDiffChange } from './botRecipeDiff';
import { BotChatView, type InputMode } from './BotChatView';
import { BotDiffReview } from './BotDiffReview';
import { BotHistoryScreen } from './BotHistoryScreen';
import { BotReviewScreen } from './BotReviewScreen';
import { BotSettingsScreen } from './BotSettingsScreen';
import { buildNewChat, getChat, getMessages, persistChat, setSourceUrl, updateDraft } from './chatRepo';
import { fetchAndExtract, linkMessage, LinkFetchError } from './linkFetch';
import { draftToProposed, proposedToDraft, resolveDraftIngredients } from './proposedToDraft';
import { buildCookRefineSeed, buildQuickStarts, type QuickStart } from './surfaceContext';
import type { BotChat, BotMessage } from './types';

type Phase = 'loading' | 'chat' | 'review' | 'diff' | 'history' | 'settings';

interface BotChatScreenProps {
  onExit: () => void;
  onOpenSavedRecipe: (recipeId: number) => void;
  /** Reopen an existing chat (from history). */
  initialChatId?: string | null;
  /** Refine an existing saved recipe (§2.2) — seeds a fresh chat from it. */
  seedRecipeId?: number | null;
  /** Prefill a fresh chat's input with a starter message (§A2.6 "I'm feeling"
   * fallback) — editable, not auto-sent. */
  seedMessage?: string | null;
  /** Scoped context to attach to that seeded first turn (pantry/leftovers). */
  seedContext?: string | null;
  /** Refine from a specific cook (§A2.3) — seeds the recipe + that cook's
   * feedback and auto-sends an opening turn so the bot proposes a change. */
  seedCookLogId?: number | null;
}

interface DiffState {
  base: RecipeDraft;
  next: RecipeDraft;
  changes: BotDiffChange[];
}

async function hydrateDraft(db: ReturnType<typeof useDb>, proposed: BotChat['draft']): Promise<{ draft: RecipeDraft; newIngredientNames: Set<string> } | null> {
  if (!proposed) return null;
  const draft = proposedToDraft(proposed);
  const { ingredients, newIngredientNames } = await resolveDraftIngredients(db, draft.ingredients);
  return { draft: { ...draft, ingredients }, newIngredientNames };
}

export function BotChatScreen({
  onExit,
  onOpenSavedRecipe,
  initialChatId,
  seedRecipeId,
  seedMessage,
  seedContext,
  seedCookLogId,
}: BotChatScreenProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const db = useDb();
  const { modal, notice } = useConfirmModal();

  const [phase, setPhase] = useState<Phase>('loading');
  const [mode, setMode] = useState<InputMode>('chat');
  const [chat, setChat] = useState<BotChat | null>(null);
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [workingDraft, setWorkingDraft] = useState<RecipeDraft | null>(null);
  const [newIngredientNames, setNewIngredientNames] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [refineNote, setRefineNote] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pendingDiff, setPendingDiff] = useState<DiffState | null>(null);
  const [diffAccepted, setDiffAccepted] = useState<Set<string>>(new Set());
  const [dishisionAssisted, setDishisionAssistedState] = useState(false);
  const [saving, setSaving] = useState(false);
  const [noApiKey, setNoApiKey] = useState(false);
  const [quickStarts, setQuickStarts] = useState<QuickStart[]>([]);

  const userNameRef = useRef('you');
  // §A2.2: a quick-start chip attaches its scoped context (pantry, leftovers) to
  // the next sent turn only. Held in a ref so it survives input edits and is
  // consumed once.
  const pendingContextRef = useRef<string | null>(null);
  // §A2.3: a cook-log refine auto-sends one opening turn once the chat is ready,
  // so the bot proposes a change straight into diff review. Fired once.
  const autoSendRef = useRef<string | null>(null);
  const retryContextRef = useRef<{ fromReview: boolean } | null>(null);
  // Latest workingDraft for async turn handlers that need the pre-refinement
  // baseline without a stale closure.
  const workingDraftRef = useRef<RecipeDraft | null>(null);
  workingDraftRef.current = workingDraft;
  // Whether this chat's row exists on disk yet (§B7). New/seed chats start in
  // memory only and are written the first time they earn it — see
  // ensurePersisted. Reopened chats (from history) start persisted.
  const persistedRef = useRef(false);

  const applyChat = useCallback(
    async (c: BotChat) => {
      setChat(c);
      setMessages(await getMessages(db, c.id));
      const hydrated = await hydrateDraft(db, c.draft);
      setWorkingDraft(hydrated?.draft ?? null);
      setNewIngredientNames(hydrated?.newIngredientNames ?? new Set());
      setDishisionAssistedState(c.dishisionAssisted);
    },
    [db],
  );

  // Bootstrap: reopen a chat, seed from an existing recipe, or start fresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      userNameRef.current = await getUserName(db);
      setNoApiKey(!(await hasApiKey()));
      buildQuickStarts(db).then((qs) => {
        if (!cancelled) setQuickStarts(qs);
      });
      const settings = await getBotSettings(db);
      if (seedCookLogId != null) {
        // §A2.3 cook-log refine: seed the recipe + that cook's feedback, then
        // queue an opening turn so the bot proposes a concrete change.
        const seed = await buildCookRefineSeed(db, seedCookLogId);
        if (seed && !cancelled) {
          const loaded = await loadRecipeDraft(db, seed.recipeId);
          const proposed = draftToProposed(loaded);
          const c = buildNewChat({
            source: 'cook_log',
            settings,
            originalRecipeId: seed.recipeId,
            originCookLogId: seedCookLogId,
            draft: proposed,
          });
          persistedRef.current = false;
          pendingContextRef.current = seed.contextFragment;
          autoSendRef.current = seed.autoMessage;
          setChat(c);
          setMessages([]);
          setWorkingDraft(loaded);
          setNewIngredientNames(new Set());
          setDishisionAssistedState(false);
        }
      } else if (initialChatId) {
        const c = await getChat(db, initialChatId);
        // Reopened from history — already on disk.
        if (c && !cancelled) {
          persistedRef.current = true;
          await applyChat(c);
        }
      } else if (seedRecipeId != null) {
        const loaded = await loadRecipeDraft(db, seedRecipeId);
        const proposed = draftToProposed(loaded);
        // In memory only — an existing-recipe refine that's opened and
        // abandoned without a single instruction must leave no trace (§B7),
        // even though it carries a pre-seeded draft.
        const c = buildNewChat({ source: 'existing_recipe', settings, originalRecipeId: seedRecipeId, draft: proposed });
        if (cancelled) return;
        persistedRef.current = false;
        setChat(c);
        setMessages([]);
        setWorkingDraft(loaded); // already resolved, no auto-created ingredients
        setNewIngredientNames(new Set());
        setDishisionAssistedState(false);
      } else {
        // Fresh from-scratch chat, in memory only until the first message (§B7).
        const c = buildNewChat({ source: 'chat', settings });
        if (!cancelled) {
          persistedRef.current = false;
          // A §A2.6 seeded chat attaches its criteria context to the first turn.
          pendingContextRef.current = seedMessage ? (seedContext ?? null) : null;
          setChat(c);
          setMessages([]);
          setWorkingDraft(null);
          setNewIngredientNames(new Set());
          setDishisionAssistedState(false);
        }
      }
      if (!cancelled) setPhase('chat');
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // §A2.3: once the seeded cook-log chat is ready, auto-send the opening turn.
  // fromReview=true routes the bot's proposal straight into diff review, so the
  // user lands on the proposed changes rather than an empty chat.
  useEffect(() => {
    if (chat && autoSendRef.current && phase === 'chat' && !sending) {
      const msg = autoSendRef.current;
      autoSendRef.current = null;
      runSend(msg, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat?.id, phase]);

  async function reloadChat(): Promise<BotChat | null> {
    if (!chat) return null;
    const updated = await getChat(db, chat.id);
    if (updated) setChat(updated);
    return updated;
  }

  // §B7: write the chat to disk the first time it earns its keep — a sent
  // message, a fetched link, or a save. Must run before any bot_chat-referencing
  // write (messages, usage, draft updates all FK to bot_chat). Idempotent.
  async function ensurePersisted(target: BotChat): Promise<void> {
    if (persistedRef.current) return;
    await persistChat(db, target);
    persistedRef.current = true;
  }

  function toErrorMessage(e: unknown): string {
    return e instanceof BotApiError || e instanceof Error ? e.message : String(e);
  }

  // Shared post-turn handling.
  async function processResult(
    result: Awaited<ReturnType<typeof sendUserTurn>>,
    fromReview: boolean,
  ): Promise<void> {
    if (!chat) return;
    setMessages(await getMessages(db, chat.id));
    await reloadChat();
    if (!result.proposal) {
      // Pure clarifying reply — surface it where the user is.
      if (fromReview) setRefineNote(result.assistantMessage.content);
      return;
    }
    const p = result.proposal;
    setNewIngredientNames((prev) => new Set([...prev, ...p.newIngredientNames]));
    const base = workingDraftRef.current;
    if (fromReview && base) {
      const changes = buildBotDiff(base, p.draft);
      if (changes.length > 0) {
        setPendingDiff({ base, next: p.draft, changes });
        setDiffAccepted(new Set(changes.map((c) => c.id)));
        setPhase('diff');
        return;
      }
    }
    setWorkingDraft(p.draft);
  }

  async function runSend(text: string, fromReview: boolean): Promise<void> {
    if (!chat || sending) return;
    setSending(true);
    setError(null);
    if (fromReview) {
      setRefineError(null);
      setRefineNote(null);
    }
    try {
      // First real content — write the chat to disk before anything FKs to it (§B7).
      await ensurePersisted(chat);
      // Sync manual on-screen edits into the chat draft so the model's CURRENT
      // RECIPE STATE reflects them (§7.3).
      let currentChat = chat;
      if (workingDraftRef.current) {
        const proposed = draftToProposed(workingDraftRef.current);
        await updateDraft(db, chat.id, proposed);
        currentChat = { ...chat, draft: proposed };
      }
      // Consume any pending quick-start context on this turn only (§A2.2).
      const contextFragment = pendingContextRef.current;
      pendingContextRef.current = null;
      const result = await sendUserTurn(db, currentChat, text, userNameRef.current, { contextFragment });
      retryContextRef.current = null;
      await processResult(result, fromReview);
    } catch (e) {
      retryContextRef.current = { fromReview };
      const msg = toErrorMessage(e);
      if (fromReview) setRefineError(msg);
      else setError(msg);
    } finally {
      setSending(false);
    }
  }

  async function handleRetry(): Promise<void> {
    if (!chat || sending) return;
    const ctx = retryContextRef.current;
    if (!ctx) return;
    setSending(true);
    setError(null);
    if (ctx.fromReview) setRefineError(null);
    try {
      const result = await retryTurn(db, chat, userNameRef.current);
      retryContextRef.current = null;
      await processResult(result, ctx.fromReview);
    } catch (e) {
      const msg = toErrorMessage(e);
      if (ctx.fromReview) setRefineError(msg);
      else setError(msg);
    } finally {
      setSending(false);
    }
  }

  async function handleSubmitLink(url: string): Promise<void> {
    if (!chat) return;
    setLinkError(null);
    setLinkLoading(true);
    try {
      const extracted = await fetchAndExtract(url);
      // A fetched link is real content — persist before stamping source_url (§B7).
      await ensurePersisted(chat);
      await setSourceUrl(db, chat.id, /^https?:\/\//i.test(url) ? url : `https://${url}`);
      await reloadChat();
      setMode('chat');
      setLinkLoading(false);
      await runSend(linkMessage(url, extracted), false);
    } catch (e) {
      setLinkLoading(false);
      setLinkError(e instanceof LinkFetchError ? e.message : toErrorMessage(e));
    }
  }

  async function startNewChat(): Promise<void> {
    // An unpersisted current chat simply evaporates (§B7); a persisted one is
    // left in history untouched. Either way the new chat starts in memory.
    const settings = await getBotSettings(db);
    const c = buildNewChat({ source: 'chat', settings });
    persistedRef.current = false;
    pendingContextRef.current = null;
    buildQuickStarts(db).then(setQuickStarts); // fresh pantry/leftover snapshot
    setChat(c);
    setMessages([]);
    setWorkingDraft(null);
    setNewIngredientNames(new Set());
    setDishisionAssistedState(false);
    setMode('chat');
    setError(null);
    setRefineError(null);
    setRefineNote(null);
    setPendingDiff(null);
    setPhase('chat');
    setNoApiKey(!(await hasApiKey()));
  }

  // Diff review actions (§9).
  function toggleDiff(id: string) {
    setDiffAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function acceptAllDiff() {
    if (pendingDiff) setDiffAccepted(new Set(pendingDiff.changes.map((c) => c.id)));
  }
  async function applyDiff() {
    if (!pendingDiff || !chat) return;
    const merged = applyBotDiff(pendingDiff.base, pendingDiff.next, diffAccepted);
    setWorkingDraft(merged);
    await updateDraft(db, chat.id, draftToProposed(merged));
    setPendingDiff(null);
    setPhase('review');
  }
  async function discardDiff() {
    if (!pendingDiff || !chat) return;
    setWorkingDraft(pendingDiff.base);
    await updateDraft(db, chat.id, draftToProposed(pendingDiff.base));
    setPendingDiff(null);
    setPhase('review');
  }

  async function handleDraftChange(next: RecipeDraft) {
    setWorkingDraft(next);
  }

  // Persist manual on-screen edits into the chat draft when leaving the review
  // screen, so nothing is lost on reopen or crash (§4). Only meaningful once the
  // chat is on disk (§B7) — an unpersisted refine draft is discarded on leave.
  async function leaveReview(target: Phase) {
    if (persistedRef.current && chat && workingDraftRef.current) {
      await updateDraft(db, chat.id, draftToProposed(workingDraftRef.current));
    }
    setPhase(target);
  }

  async function handleExit() {
    // Only flush the draft if the chat actually exists on disk; an abandoned,
    // never-sent chat leaves no trace at all (§B7).
    if (persistedRef.current && chat && workingDraftRef.current) {
      await updateDraft(db, chat.id, draftToProposed(workingDraftRef.current));
    }
    onExit();
  }

  async function handleSave(mode: SaveMode): Promise<void> {
    if (!chat || !workingDraft || saving) return;
    if (!workingDraft.name.trim()) {
      notice('Name required', 'Give the recipe a name before saving.');
      return;
    }
    setSaving(true);
    try {
      // Saving is a keep — persist the chat so saved_recipe_id has a row to
      // attach to, even if not a single message was ever sent (§B7).
      await ensurePersisted(chat);
      const recipeId = await saveBotRecipe(db, { draft: workingDraft, chat, mode, dishisionAssisted });
      onOpenSavedRecipe(recipeId);
    } catch (e) {
      notice("Couldn't save", toErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleAssisted(on: boolean) {
    setDishisionAssistedState(on);
  }

  if (phase === 'loading' || !chat) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (phase === 'settings') {
    return (
      <BotSettingsScreen
        onBack={async () => {
          setNoApiKey(!(await hasApiKey()));
          setPhase('chat');
        }}
      />
    );
  }

  if (phase === 'history') {
    return (
      <BotHistoryScreen
        onBack={() => setPhase('chat')}
        onOpenChat={async (chatId) => {
          const c = await getChat(db, chatId);
          if (c) {
            persistedRef.current = true; // came from history — already on disk
            await applyChat(c);
            setMode('chat');
            setError(null);
            setPhase('chat');
          }
        }}
      />
    );
  }

  if (phase === 'diff' && pendingDiff) {
    return (
      <BotDiffReview
        changes={pendingDiff.changes}
        accepted={diffAccepted}
        onToggle={toggleDiff}
        onAcceptAll={acceptAllDiff}
        onApply={applyDiff}
        onCancel={discardDiff}
      />
    );
  }

  if (phase === 'review' && workingDraft) {
    return (
      <>
        <BotReviewScreen
          draft={workingDraft}
          onDraftChange={handleDraftChange}
          newIngredientNames={newIngredientNames}
          onBack={() => leaveReview('chat')}
          onOpenChat={() => leaveReview('chat')}
          onRefine={(instruction) => runSend(instruction, true)}
          refining={sending}
          refineError={refineError}
          refineNote={refineNote}
          isExistingRecipe={chat.originalRecipeId != null}
          dishisionAssisted={dishisionAssisted}
          onToggleAssisted={toggleAssisted}
          onSaveNew={() => handleSave('new')}
          onSaveOverwrite={() => handleSave('overwrite')}
          saving={saving}
        />
        {modal}
      </>
    );
  }

  return (
    <>
      <BotChatView
        messages={messages}
        sending={sending}
        error={error}
        onRetry={handleRetry}
        mode={mode}
        onModeChange={setMode}
        onSend={(text) => runSend(text, false)}
        onSubmitPaste={(text) => {
          setMode('chat');
          runSend(text, false);
        }}
        onSubmitLink={handleSubmitLink}
        linkLoading={linkLoading}
        linkError={linkError}
        hasCandidate={workingDraft != null}
        onViewRecipe={() => setPhase('review')}
        onNewChat={startNewChat}
        onOpenHistory={() => setPhase('history')}
        onExit={handleExit}
        noApiKey={noApiKey}
        onOpenSettings={() => setPhase('settings')}
        source={chat.source}
        sourceUrl={chat.sourceUrl}
        quickStarts={quickStarts}
        onQuickStartContext={(ctx) => {
          pendingContextRef.current = ctx;
        }}
        initialInput={seedMessage ?? undefined}
      />
      {modal}
    </>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg },
  });
