import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useKeyboardState, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { ArrowUp, ChevronDown, MessageSquare, Plus, SlidersHorizontal, Square, X } from 'lucide-react-native'
import { chatItemKey, conversationAsking, conversationWaiting, conversationWorking, isSubagent, type ChatItem, type ChatOption, type Conversation } from '@antumi/protocol'
import {
  ApprovalDock, AssistantText, ChatImageView, ChatNotice, NoticeLine, ProjectRoots, QuestionDock, ReasoningLine, RequestLine, TodosCard, ToolGroup, TurnEnd, TurnHead, UsageLimitLine, UserMessage,
  WorkingLine, type Approval, type Question, type Tool
} from '../components/chat'
import { ChoiceList, Sheet } from '../components/sheet'
import { EmptyState, IconButton, Muted, Screen, confirmTap, tap } from '../components/ui'
import { t } from '../i18n'
import { agentName, effortName, modeName, where } from '../labels'
import { pop, push, useNavigation } from '../navigation'
import { canHandOff, canOperate, continueChat, EMPTY_DRAFT, interrupt, loadOlder, send, setDraft, setOption, unwatch, uploadImage, useSession, viewsOnly, watch } from '../session'
import { radius, space, type, useTheme } from '../theme'
import { handOffable } from './HandoffScreen'

type StateItem = Extract<ChatItem, { kind: 'state' }>

type Row =
  | { key: string; kind: 'item'; item: ChatItem }
  // solo: a call shown on its own, never joined by the next (one that changed files, a subagent).
  | { key: string; kind: 'tools'; tools: Tool[]; solo: boolean }
  | { key: string; kind: 'turn' }
  | { key: string; kind: 'working' }

// The stage's own state item says which modes, models and efforts it offers now.
function latestState(items: readonly ChatItem[]): StateItem | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!
    if (item.kind === 'state') return item
  }
  return null
}

function openRequest(items: readonly ChatItem[]): Approval | Question | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!
    if ((item.kind === 'approval' || (item.kind === 'question' && !item.async)) && item.resolution === null) return item
  }
  return null
}

// Chat items in reading order as rows: runs of tool calls become one, each turn opens with the
// agent's name, and the working line closes it while the agent is at it.
function rowsOf(items: readonly ChatItem[], working: boolean, docked: ChatItem | null): Row[] {
  const rows: Row[] = []
  let afterUser = true
  for (const item of items) {
    // The open request is answered in the dock; the stream keeps it once it is.
    if (item.kind === 'state' || item === docked) continue
    if (item.kind === 'user') {
      afterUser = true
      rows.push({ key: chatItemKey(item), kind: 'item', item })
      continue
    }
    if (afterUser) {
      rows.push({ key: `turn:${chatItemKey(item)}`, kind: 'turn' })
      afterUser = false
    }
    const last = rows[rows.length - 1]
    if (item.kind === 'tool') {
      // A call with changes, a subagent or pictures stands alone, where nothing folds it away.
      const solo = item.diffs.length > 0 || isSubagent(item.name) || Boolean(item.images?.length)
      if (last?.kind === 'tools' && !last.solo && !solo) last.tools.push(item)
      else rows.push({ key: `tools:${chatItemKey(item)}`, kind: 'tools', tools: [item], solo })
      continue
    }
    rows.push({ key: chatItemKey(item), kind: 'item', item })
  }
  if (working) {
    if (afterUser) rows.push({ key: 'turn:working', kind: 'turn' })
    rows.push({ key: 'working', kind: 'working' })
  }
  return rows
}

function ItemView({ item, conversation }: { item: ChatItem; conversation: Conversation }) {
  switch (item.kind) {
    case 'user': return <UserMessage item={item} agent={conversation.agent} />
    case 'assistant': return <AssistantText text={item.text} />
    case 'reasoning': return <ReasoningLine item={item} />
    case 'approval':
    case 'question': return <RequestLine item={item} />
    case 'notice': return <ChatNotice item={item} conversationId={conversation.id} />
    case 'usageLimit': return <UsageLimitLine item={item} />
    case 'turn': return <TurnEnd item={item} />
    case 'todos': return <TodosCard item={item} />
    default: return null
  }
}

// The agent leads, for a handoff where the chat's agent is the user's to change; what the stage
// offers follows, once it has said.
function OptionsSheet({ conversation, state, handoff, onClose }: { conversation: Conversation; state: StateItem | null; handoff: boolean; onClose: () => void }) {
  const { id, agent } = conversation
  const model = state?.models.find((each) => each.id === state.model)
  const pick = (option: ChatOption) => (value: string) => void setOption(id, option, value)
  return (
    <Sheet title={t('options')} onClose={onClose}>
      {handoff ? (
        <ChoiceList title={t('agent')} choices={[{ value: agent, label: agentName(agent), detail: t('handOffAction') }]} current={null}
          onPick={() => { onClose(); push({ name: 'handoff', id }) }} />
      ) : null}
      {state ? (
        <>
          <ChoiceList title={t('permissionMode')} choices={state.permissionModes.map((mode) => ({ value: mode, label: modeName(agent, mode) }))} current={state.permissionMode} onPick={pick('permissionMode')} />
          <ChoiceList title={t('model')} choices={state.models.map((each) => ({ value: each.id, label: each.label, detail: each.description }))} current={state.model} onPick={pick('model')} />
          <ChoiceList title={t('effort')} choices={(model?.efforts ?? []).map((effort) => ({ value: effort, label: effortName(effort) }))} current={state.effort} onPick={pick('effort')} />
        </>
      ) : null}
    </Sheet>
  )
}

function Composer({ conversation, state, onOptions }: { conversation: Conversation; state: StateItem | null; onOptions: () => void }) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  // Over the keyboard, the navigation bar's inset is the keyboard's own.
  const keyboardOpen = useKeyboardState((state) => state.isVisible)
  const { text, images } = useSession((s) => s.drafts[conversation.id]) ?? EMPTY_DRAFT
  const setText = (next: string) => setDraft(conversation.id, (draft) => ({ ...draft, text: next }))
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  // Only background work left running: the turn is over and a message starts the next one.
  const running = conversationWorking(conversation) && !conversation.chat?.betweenTurns
  const stopped = conversation.sessionId === null
  const empty = !text.trim() && images.length === 0
  const modelLabel = state ? state.models.find((each) => each.id === state.model)?.label ?? state.model : null
  const chip = [modelLabel, state?.permissionMode ? modeName(conversation.agent, state.permissionMode) : null].filter(Boolean).join(' · ')
  const pickImage = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.8 })
    const asset = picked.canceled ? null : picked.assets[0]
    if (!asset?.base64) return
    setUploading(true)
    const uploaded = await uploadImage(asset.base64)
    setUploading(false)
    if (uploaded) setDraft(conversation.id, (draft) => ({ ...draft, images: [...draft.images, { id: uploaded, width: asset.width, height: asset.height }] }))
  }
  const submit = async () => {
    if (empty) return
    confirmTap()
    setSending(true)
    if (stopped) await continueChat(conversation.id)
    if (await send(conversation.id, text.trim(), images.map((image) => image.id), running)) setDraft(conversation.id, () => EMPTY_DRAFT)
    setSending(false)
  }
  return (
    <View style={[styles.composerWrap, { paddingBottom: keyboardOpen ? space.sm : Math.max(insets.bottom, space.sm) }]}>
      <View style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {images.length > 0 || uploading ? (
          <View style={styles.attachments}>
            {images.map((image) => (
              <View key={image.id}>
                <ChatImageView image={image} size={56} />
                <Pressable accessibilityLabel={t('close')} onPress={() => setDraft(conversation.id, (draft) => ({ ...draft, images: draft.images.filter((each) => each.id !== image.id) }))} style={[styles.remove, { backgroundColor: theme.text }]}>
                  <X size={11} color={theme.bg} strokeWidth={3} />
                </Pressable>
              </View>
            ))}
            {uploading ? <View style={[styles.uploading, { backgroundColor: theme.raised }]}><Muted>…</Muted></View> : null}
          </View>
        ) : null}
        <TextInput
          style={[type.body, styles.input, { color: theme.text }]}
          placeholder={running ? t('queuePlaceholder') : t('messagePlaceholder')}
          placeholderTextColor={theme.text3}
          value={text}
          onChangeText={setText}
          multiline
        />
        <View style={styles.composerBar}>
          <Pressable accessibilityLabel={t('addImage')} onPress={() => void pickImage()} style={({ pressed }) => [styles.round, { backgroundColor: theme.raised, opacity: pressed ? 0.7 : 1 }]}>
            <Plus size={19} color={theme.text} />
          </Pressable>
          {state ? (
            <Pressable onPress={onOptions} style={({ pressed }) => [styles.modelChip, { backgroundColor: theme.raised, opacity: pressed ? 0.7 : 1 }]}>
              <SlidersHorizontal size={14} color={theme.textMuted} />
              <Text style={[type.caption, styles.chipText, { color: theme.text }]} numberOfLines={1}>{chip || t('options')}</Text>
              <ChevronDown size={14} color={theme.textMuted} />
            </Pressable>
          ) : null}
          {running && empty ? (
            <Pressable accessibilityLabel={t('interrupt')} onPress={() => { confirmTap(); void interrupt(conversation.id) }} style={({ pressed }) => [styles.send, { backgroundColor: theme.text, opacity: pressed ? 0.7 : 1 }]}>
              <Square size={13} color={theme.bg} fill={theme.bg} />
            </Pressable>
          ) : (
            <Pressable accessibilityLabel={t('send')} disabled={empty || sending} onPress={() => void submit()} style={({ pressed }) => [styles.send, { backgroundColor: empty ? theme.sunken : theme.accent, opacity: pressed ? 0.75 : 1 }]}>
              <ArrowUp size={19} color={empty ? theme.text3 : theme.accentText} strokeWidth={2.5} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  )
}

// Padded by the keyboard's height as it is now, the chat reaching the window's bottom edge. The
// library's KeyboardAvoidingView scales the height an opening set out with instead, so a keyboard
// that grows a toolbar while it opens (WeChat's, on some phones) ends up over the composer.
function KeyboardLift({ children }: { children: ReactNode }) {
  const { height } = useReanimatedKeyboardAnimation()
  const lift = useAnimatedStyle(() => ({ paddingBottom: Math.max(0, -height.value) }))
  return <Animated.View style={[styles.flex, lift]}>{children}</Animated.View>
}

// Back the way the user came when that was the caller's chat, rather than stacking it again.
function openCaller(id: string): void {
  const { stack } = useNavigation.getState()
  const below = stack[stack.length - 2]
  if (below?.name === 'chat' && below.id === id) pop()
  else push({ name: 'chat', id })
}

// Members this conversation delegated to that wait on the user, each a way into its chat to answer.
function DelegatesWaiting({ id }: { id: string }) {
  const theme = useTheme()
  const conversations = useSession((s) => s.conversations)
  const waiting = useMemo(() => Object.values(conversations).filter((each) => each.parentConversationId === id && (conversationWaiting(each) || conversationAsking(each))), [conversations, id])
  if (waiting.length === 0) return null
  return (
    <View style={[styles.delegates, { borderTopColor: theme.border }]}>
      {waiting.map((each) => (
        <Pressable key={each.id} accessibilityRole="button" onPress={() => { tap(); push({ name: 'chat', id: each.id }) }}>
          <NoticeLine tone="warning" more text={t(each.chat?.request?.kind === 'question' ? 'delegateAsks' : 'delegateNeedsApproval', { name: each.title || where(each) })} />
        </Pressable>
      ))}
    </View>
  )
}

export function ChatScreen({ id }: { id: string }) {
  const theme = useTheme()
  const conversation = useSession((s) => s.conversations[id])
  const chat = useSession((s) => s.chats[id])
  const status = useSession((s) => s.status)
  const [options, setOptions] = useState(false)
  useEffect(() => {
    if (status === 'online') void watch(id)
    return () => unwatch(id)
  }, [id, status])
  const items = chat?.items ?? []
  const request = useMemo(() => openRequest(items), [items])
  const state = useMemo(() => latestState(items), [items])
  const working = conversation ? conversationWorking(conversation) && !request : false
  const rows = useMemo(() => rowsOf(items, working, request).reverse(), [items, working, request])
  if (!conversation) {
    return <Screen title={t('appName')} onBack={() => pop()}><Muted>{t('noConversations')}</Muted></Screen>
  }
  // A delegated member's chat is driven by its caller: here it is only read and its requests answered.
  const caller = conversation.parentConversationId ?? null
  const operate = canOperate()
  const handoff = canHandOff() && handOffable(conversation)
  return (
    <Screen
      title={conversation.title || where(conversation)}
      subtitle={where(conversation)}
      onBack={() => pop()}
      scroll={false}
      actions={operate && !caller && (state || handoff) ? <IconButton icon={SlidersHorizontal} label={t('options')} onPress={() => setOptions(true)} /> : null}
    >
      <ProjectRoots.Provider value={conversation.projectPaths}>
      <KeyboardLift>
        <FlatList
          inverted
          data={rows}
          keyExtractor={(row) => row.key}
          contentContainerStyle={[styles.list, rows.length === 0 && styles.grow]}
          ListEmptyComponent={chat ? <View style={styles.flipped}><EmptyState icon={MessageSquare} title={t('noMessages')} /></View> : undefined}
          renderItem={({ item: row }) => (
            <View style={styles.rowGap}>
              {row.kind === 'turn' ? <TurnHead agent={conversation.agent} />
                : row.kind === 'tools' ? <ToolGroup tools={row.tools} />
                : row.kind === 'working' ? <WorkingLine doing={conversation.chat?.doing?.title ?? null} />
                : <ItemView item={row.item} conversation={conversation} />}
            </View>
          )}
          ListFooterComponent={chat?.before || chat?.truncated ? (
            <View style={styles.top}>
              {chat.before ? <Pressable onPress={() => void loadOlder(id)} style={[styles.older, { backgroundColor: theme.raised }]}><Text style={[type.caption, { color: theme.text, fontWeight: '600' }]}>{t('loadOlder')}</Text></Pressable> : null}
              {chat.truncated ? <NoticeLine text={t('truncated')} tone="info" /> : null}
            </View>
          ) : undefined}
        />
        <DelegatesWaiting id={conversation.id} />
        {request && request.kind === 'approval' ? <ApprovalDock key={request.requestId} item={request} conversation={conversation} /> : null}
        {request && request.kind === 'question' ? <QuestionDock key={request.requestId} item={request} conversation={conversation} /> : null}
        {caller ? (
          <Pressable accessibilityRole="button" onPress={() => { tap(); openCaller(caller) }} style={[styles.viewOnly, { borderTopColor: theme.border }]}>
            <Text style={[type.secondary, styles.link, { color: theme.accent }]}>{t('backToCaller')}</Text>
          </Pressable>
        ) : operate ? <Composer conversation={conversation} state={state} onOptions={() => setOptions(true)} /> : viewsOnly() ? (
          <View style={[styles.viewOnly, { borderTopColor: theme.border }]}><Muted center>{t('viewOnly')}</Muted></View>
        ) : null}
      </KeyboardLift>
      </ProjectRoots.Provider>
      {options && !caller && (state || handoff) ? <OptionsSheet conversation={conversation} state={state} handoff={handoff} onClose={() => setOptions(false)} /> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Undoes the list's inversion, which on Android flips both axes (see VirtualizedList).
  flipped: { flex: 1, justifyContent: 'center', transform: Platform.OS === 'android' ? [{ scale: -1 }] : [{ scaleY: -1 }] },
  grow: { flexGrow: 1 },
  list: { paddingHorizontal: space.lg, paddingVertical: space.md },
  rowGap: { paddingVertical: 6 },
  top: { gap: space.sm, paddingBottom: space.md, alignItems: 'center' },
  older: { borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm },
  composerWrap: { paddingHorizontal: space.md, paddingTop: space.xs },
  composer: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.sm, gap: space.sm },
  attachments: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  remove: { position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  uploading: { width: 56, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  input: { maxHeight: 150, paddingHorizontal: space.xs, paddingVertical: 0 },
  composerBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  round: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  modelChip: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: radius.pill, paddingHorizontal: space.md },
  chipText: { flexShrink: 1, fontWeight: '600' },
  send: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  viewOnly: { borderTopWidth: StyleSheet.hairlineWidth, padding: space.lg },
  link: { textAlign: 'center', fontWeight: '600' },
  delegates: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm }
})
