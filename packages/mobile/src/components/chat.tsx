import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  Brain, ChevronDown, ChevronRight, CircleAlert, CircleCheck, CircleX, FilePen, FileText, Globe, Hand, Info, ListChecks, Search, ShieldQuestion, Terminal, Wrench, type LucideIcon
} from 'lucide-react-native'
import { isPlanApproval, type AgentKind, type ChatDecision, type ChatImage, type ChatItem, type ChatPermissionMode, type Conversation } from '@antumi/protocol'
import { t } from '../i18n'
import { agentName, isCommandTool, modeName, relativePath } from '../labels'
import { canOperate, imageUri, respond, viewsOnly } from '../session'
import { mono, radius, space, type, useTheme } from '../theme'
import { AgentMark } from './agent-mark'
import { Markdown } from './markdown'
import { Button, confirmTap } from './ui'

// The conversation's project folders, so paths in the chat read from there.
export const ProjectRoots = createContext<readonly string[]>([])

function useRelative(): (text: string) => string {
  const roots = useContext(ProjectRoots)
  return (text) => relativePath(text, roots)
}

export type Approval = Extract<ChatItem, { kind: 'approval' }>
export type Question = Extract<ChatItem, { kind: 'question' }>
export type Tool = Extract<ChatItem, { kind: 'tool' }>

export function ChatImageView({ image, size }: { image: ChatImage; size?: number }) {
  const theme = useTheme()
  const [uri, setUri] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void imageUri(image.id).then((loaded) => { if (live) setUri(loaded) })
    return () => { live = false }
  }, [image.id])
  const width = size ?? Math.min(220, image.width)
  const height = size ?? (width * image.height) / image.width
  return (
    <View style={[styles.image, { width, height, backgroundColor: theme.raised }]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <ActivityIndicator color={theme.text3} />}
    </View>
  )
}

export function UserMessage({ item }: { item: Extract<ChatItem, { kind: 'user' }> }) {
  const theme = useTheme()
  return (
    <View style={styles.userRow}>
      {item.images.length > 0 ? <View style={styles.userImages}>{item.images.map((image) => <ChatImageView key={image.id} image={image} />)}</View> : null}
      {item.text ? (
        <View style={[styles.bubble, { backgroundColor: theme.userBubble }]}>
          <Text selectable style={[type.body, { color: theme.text }]}>{item.text}</Text>
        </View>
      ) : null}
    </View>
  )
}

export function TurnHead({ agent }: { agent: AgentKind }) {
  const theme = useTheme()
  return (
    <View style={styles.turnHead}>
      <View style={[styles.turnMark, { backgroundColor: theme.raised }]}><AgentMark agent={agent} size={13} color={theme.text} /></View>
      <Text style={[type.caption, styles.turnName, { color: theme.textMuted }]}>{agentName(agent)}</Text>
    </View>
  )
}

function toolIcon(tool: Tool): LucideIcon {
  const name = tool.name.toLowerCase()
  if (/bash|command|shell|terminal|exec/.test(name)) return Terminal
  if (/edit|write|patch|filechange|multiedit/.test(name)) return FilePen
  if (/read|view|open/.test(name)) return FileText
  if (/grep|glob|search|find|ls/.test(name)) return Search
  if (/web|fetch|browser|navigate/.test(name)) return Globe
  if (/todo/.test(name)) return ListChecks
  return Wrench
}

function ToolLine({ tool }: { tool: Tool }) {
  const theme = useTheme()
  const relative = useRelative()
  const [open, setOpen] = useState(false)
  const Icon = toolIcon(tool)
  const failed = tool.status === 'failed'
  const running = tool.status === 'running'
  return (
    <View>
      <Pressable onPress={() => setOpen(!open)} style={styles.stepRow}>
        <Icon size={15} color={failed ? theme.danger : theme.textMuted} strokeWidth={2} />
        <Text style={[type.secondary, styles.stepName, { color: theme.text }]} numberOfLines={1}>{tool.display?.name ?? tool.name}</Text>
        <Text style={[type.secondary, styles.stepDetail, { color: theme.textMuted }]} numberOfLines={1}>{relative(tool.description ?? tool.title)}</Text>
        {running ? <ActivityIndicator size="small" color={theme.text3} /> : failed ? <CircleX size={15} color={theme.danger} /> : null}
      </Pressable>
      {open && (tool.output || tool.input) ? (
        <View style={[styles.output, { backgroundColor: theme.codeBg }]}>
          <Text selectable style={[styles.outputText, { color: theme.textMuted }]} numberOfLines={40}>{tool.output ?? tool.input}</Text>
        </View>
      ) : null}
      {tool.images?.length ? <View style={styles.userImages}>{tool.images.map((image) => <ChatImageView key={image.id} image={image} />)}</View> : null}
    </View>
  )
}

// A run of tool calls: one line each, or "N steps" folded when there are several.
export function ToolGroup({ tools }: { tools: readonly Tool[] }) {
  const theme = useTheme()
  const relative = useRelative()
  const running = tools.some((tool) => tool.status === 'running')
  const [open, setOpen] = useState(false)
  if (tools.length === 1) return <View style={[styles.steps, { borderColor: theme.border }]}><ToolLine tool={tools[0]!} /></View>
  const last = tools[tools.length - 1]!
  return (
    <View style={[styles.steps, { borderColor: theme.border }]}>
      <Pressable onPress={() => setOpen(!open)} style={styles.stepRow}>
        {open ? <ChevronDown size={15} color={theme.textMuted} /> : <ChevronRight size={15} color={theme.textMuted} />}
        <Text style={[type.secondary, styles.stepName, { color: theme.text }]}>{t('steps', { count: tools.length })}</Text>
        {!open ? <Text style={[type.secondary, styles.stepDetail, { color: theme.textMuted }]} numberOfLines={1}>{relative(last.description ?? last.title)}</Text> : <View style={styles.flex} />}
        {running ? <ActivityIndicator size="small" color={theme.text3} /> : null}
      </Pressable>
      {open ? tools.map((tool) => <ToolLine key={`${tool.stageId}/${tool.id}`} tool={tool} />) : null}
    </View>
  )
}

export function ReasoningLine({ item }: { item: Extract<ChatItem, { kind: 'reasoning' }> }) {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  return (
    <Pressable onPress={() => setOpen(!open)} style={styles.reasoning}>
      <View style={styles.reasoningHead}>
        <Brain size={14} color={theme.text3} />
        <Text style={[type.caption, { color: theme.text3 }]}>{t('thinking')}</Text>
        {open ? <ChevronDown size={14} color={theme.text3} /> : <ChevronRight size={14} color={theme.text3} />}
      </View>
      {open ? <Text selectable style={[type.secondary, { color: theme.textMuted }]}>{item.text}</Text> : null}
    </Pressable>
  )
}

function resolutionText(resolution: Approval['resolution'] | Question['resolution']): string {
  return resolution === 'allowed' ? t('allowed') : resolution === 'allowedForSession' ? t('allowForSession') : resolution === 'denied' ? t('denied') : resolution === 'answered' ? t('answered') : t('cancelled')
}

// Where a request sits in the stream: one line; the card to answer it is docked above the composer.
export function RequestLine({ item }: { item: Approval | Question }) {
  const theme = useTheme()
  const relative = useRelative()
  const open = item.resolution === null
  const title = relative(item.kind === 'approval' ? item.title : item.questions[0]?.question ?? '')
  const Icon = open ? Hand : item.resolution === 'denied' || item.resolution === 'cancelled' ? CircleX : CircleCheck
  const color = open ? theme.waiting : item.resolution === 'denied' || item.resolution === 'cancelled' ? theme.textMuted : theme.success
  return (
    <View style={[styles.requestLine, { backgroundColor: open ? theme.waitingSoft : 'transparent', borderColor: open ? 'transparent' : theme.border }]}>
      <Icon size={15} color={color} />
      <Text style={[type.secondary, styles.flex, { color: open ? theme.text : theme.textMuted }]} numberOfLines={2}>{title}</Text>
      <Text style={[type.micro, { color }]}>{open ? t('waitingShort') : resolutionText(item.resolution)}</Text>
    </View>
  )
}

function decisionText(decision: ChatDecision): string {
  return decision === 'allow' ? t('allow') : decision === 'allowForSession' ? t('allowForSession') : t('deny')
}

// The open approval, docked above the composer: what is asked, then its answers.
export function ApprovalDock({ item, conversation }: { item: Approval; conversation: Conversation }) {
  const theme = useTheme()
  const relative = useRelative()
  const command = isCommandTool(item.tool)
  // A command reads as code under what the agent says it does; a file approval's detail is
  // often the file's name again.
  const title = command && item.detail ? item.detail : relative(item.title)
  const code = command ? relative(item.title) : item.detail && !title.endsWith(item.detail.trim()) ? relative(item.detail) : null
  const [busy, setBusy] = useState<string | null>(null)
  const plan = isPlanApproval(item)
  const modes = (item.runModes ?? []).filter((mode): mode is ChatPermissionMode => typeof mode === 'string')
  const [mode, setMode] = useState<ChatPermissionMode | null>(modes[0] ?? null)
  const options = item.choices?.length
    ? item.choices.map((choice) => ({ key: choice.id, label: choice.label ?? decisionText(choice.decision), decision: choice.decision, choice: choice.id }))
    : item.decisions.map((decision) => ({ key: decision, label: decisionText(decision), decision, choice: undefined }))
  // The plain allow leads; a lasting one is offered beside it, and deny stays quiet.
  const allows = options.filter((option) => option.decision !== 'deny')
  const denies = options.filter((option) => option.decision === 'deny')
  const answer = async (key: string, decision: ChatDecision, choice?: string) => {
    confirmTap()
    setBusy(key)
    await respond(conversation.id, item.requestId, decision, { ...(choice ? { choice } : {}), ...(plan && mode && decision !== 'deny' ? { mode } : {}) })
    setBusy(null)
  }
  return (
    <View style={[styles.dock, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.dockHead}>
        <View style={[styles.dockIcon, { backgroundColor: theme.waitingSoft }]}><ShieldQuestion size={16} color={theme.waiting} /></View>
        <Text style={[type.caption, styles.dockLabel, { color: theme.waiting }]}>{t('needsApproval')}</Text>
      </View>
      <Text style={[type.rowTitle, { color: theme.text }]} numberOfLines={3}>{title}</Text>
      {plan && item.detail ? (
        // A plan is the agent's Markdown, read in full before it runs.
        <ScrollView style={[styles.plan, { backgroundColor: theme.codeBg }]} contentContainerStyle={styles.planContent} nestedScrollEnabled>
          <Markdown text={item.detail} />
        </ScrollView>
      ) : code ? <Text style={[styles.outputText, styles.detail, { color: command ? theme.text : theme.textMuted, backgroundColor: theme.codeBg }]} numberOfLines={8}>{code}</Text> : null}
      {item.reason ? <Text style={[type.caption, { color: theme.textMuted }]}>{item.reason}</Text> : null}
      {canOperate() ? (
        <>
          {plan && modes.length > 0 ? (
            <View style={styles.chips}>
              {modes.map((each) => (
                <Pressable key={each} onPress={() => setMode(each)} style={[styles.chip, { backgroundColor: each === mode ? theme.accentSoft : theme.raised }]}>
                  <Text style={[type.caption, { color: each === mode ? theme.accent : theme.text, fontWeight: '600' }]}>{modeName(conversation.agent, each)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {allows[0] ? <Button label={allows[0].label} kind="primary" wide busy={busy === allows[0].key} onPress={() => void answer(allows[0]!.key, allows[0]!.decision, allows[0]!.choice)} /> : null}
          <View style={styles.dockActions}>
            {[...allows.slice(1), ...denies].map((option) => <Button key={option.key} label={option.label} kind="secondary" busy={busy === option.key} onPress={() => void answer(option.key, option.decision, option.choice)} style={styles.dockButton} />)}
          </View>
        </>
      ) : viewsOnly() ? <Text style={[type.caption, { color: theme.textMuted }]}>{t('viewOnly')}</Text> : null}
    </View>
  )
}

export function QuestionDock({ item, conversation }: { item: Question; conversation: Conversation }) {
  const theme = useTheme()
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)
  const toggle = (questionId: string, value: string, multi: boolean) => setPicked((current) => {
    const now = current[questionId] ?? []
    return { ...current, [questionId]: multi ? (now.includes(value) ? now.filter((each) => each !== value) : [...now, value]) : [value] }
  })
  const complete = item.questions.every((question) => (picked[question.id]?.length ?? 0) > 0)
  return (
    <View style={[styles.dock, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {item.questions.map((question) => (
        <View key={question.id} style={styles.question}>
          <Text style={[type.rowTitle, { color: theme.text }]}>{question.question}</Text>
          {question.options.map((option) => {
            const value = option.id ?? option.label
            const chosen = picked[question.id]?.includes(value) ?? false
            return (
              <Pressable key={value} disabled={!canOperate()} onPress={() => toggle(question.id, value, question.multiSelect)}
                style={[styles.option, { backgroundColor: chosen ? theme.accentSoft : theme.raised }]}>
                <View style={styles.flex}>
                  <Text style={[type.secondary, { color: theme.text, fontWeight: '600' }]}>{option.label}</Text>
                  {option.description ? <Text style={[type.caption, { color: theme.textMuted }]}>{option.description}</Text> : null}
                </View>
                {chosen ? <CircleCheck size={18} color={theme.accent} /> : null}
              </Pressable>
            )
          })}
        </View>
      ))}
      {canOperate() ? (
        <Button label={t('submitAnswer')} kind="primary" busy={busy} disabled={!complete} wide onPress={() => {
          confirmTap()
          setBusy(true)
          void respond(conversation.id, item.requestId, 'allow', { answers: picked }).finally(() => setBusy(false))
        }} />
      ) : viewsOnly() ? <Text style={[type.caption, { color: theme.textMuted }]}>{t('viewOnly')}</Text> : null}
    </View>
  )
}

export function NoticeLine({ text, tone }: { text: string; tone: 'info' | 'warning' | 'error' }) {
  const theme = useTheme()
  const color = tone === 'error' ? theme.danger : tone === 'warning' ? theme.waiting : theme.textMuted
  const Icon = tone === 'info' ? Info : CircleAlert
  return (
    <View style={styles.notice}>
      <Icon size={14} color={color} />
      <Text style={[type.caption, styles.flex, { color }]}>{text}</Text>
    </View>
  )
}

export function TodosCard({ item }: { item: Extract<ChatItem, { kind: 'todos' }> }) {
  const theme = useTheme()
  const done = item.todos.filter((todo) => todo.status === 'completed').length
  return (
    <View style={[styles.steps, styles.todos, { borderColor: theme.border }]}>
      <View style={styles.reasoningHead}>
        <ListChecks size={15} color={theme.textMuted} />
        <Text style={[type.secondary, { color: theme.text, fontWeight: '600' }]}>{t('todos')}</Text>
        <Text style={[type.caption, { color: theme.text3 }]}>{done}/{item.todos.length}</Text>
      </View>
      {item.todos.map((todo, index) => (
        <View key={index} style={styles.todo}>
          {todo.status === 'completed' ? <CircleCheck size={15} color={theme.success} /> : todo.status === 'in_progress' ? <ActivityIndicator size="small" color={theme.running} /> : <View style={[styles.todoDot, { borderColor: theme.text3 }]} />}
          <Text style={[type.secondary, styles.flex, { color: todo.status === 'completed' ? theme.text3 : theme.text }, todo.status === 'completed' && styles.strike]}>{todo.content}</Text>
        </View>
      ))}
    </View>
  )
}

export function AssistantText({ text }: { text: string }) {
  return <Markdown text={text} />
}

// While the agent works and asks nothing: three breathing dots and what it is doing.
export function WorkingLine({ doing }: { doing: string | null }) {
  const theme = useTheme()
  const phase = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(phase, { toValue: 1, duration: 1200, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [phase])
  return (
    <View style={styles.working}>
      <View style={styles.dots}>
        {[0, 1, 2].map((index) => (
          <Animated.View key={index} style={[styles.dot, { backgroundColor: theme.textMuted, opacity: phase.interpolate({ inputRange: [0, (index + 1) / 4, 1], outputRange: [0.25, 1, 0.25] }) }]} />
        ))}
      </View>
      <Text style={[type.caption, styles.flex, { color: theme.textMuted }]} numberOfLines={1}>{doing ?? t('working')}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  image: { borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  userRow: { alignItems: 'flex-end', gap: space.xs },
  userImages: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, justifyContent: 'flex-end' },
  bubble: { maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderBottomRightRadius: 6 },
  turnHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  turnMark: { width: 22, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  turnName: { fontWeight: '600' },
  steps: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 2 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 36 },
  stepName: { fontWeight: '600', flexShrink: 0 },
  stepDetail: { flex: 1 },
  output: { borderRadius: radius.sm, padding: space.sm, marginBottom: space.sm },
  outputText: { fontFamily: mono, fontSize: 12, lineHeight: 18 },
  reasoning: { gap: space.xs },
  reasoningHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  requestLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, paddingVertical: 10 },
  dock: { marginHorizontal: space.md, marginBottom: space.sm, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.md },
  dockHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dockIcon: { width: 26, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  dockLabel: { fontWeight: '700' },
  detail: { borderRadius: radius.sm, padding: space.sm, overflow: 'hidden' },
  plan: { maxHeight: 300, borderRadius: radius.md },
  planContent: { padding: space.md },
  dockActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'flex-end' },
  dockButton: { minHeight: 42, flexGrow: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 7 },
  question: { gap: space.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, padding: space.md },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.xs },
  todos: { paddingVertical: space.md, gap: space.sm },
  todo: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  todoDot: { width: 13, height: 13, borderRadius: radius.pill, borderWidth: 1.5, marginHorizontal: 1 },
  strike: { textDecorationLine: 'line-through' },
  working: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: radius.pill }
})
