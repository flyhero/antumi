import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  Brain, ChevronDown, ChevronRight, CircleAlert, CircleCheck, CircleX, FilePen, FileText, Globe, Hand, Info, ListChecks, RotateCcw, Search, ShieldQuestion, Terminal, Users, Wrench,
  type LucideIcon
} from 'lucide-react-native'
import {
  CONTEXT_COMPACTED, agentResultCallIds, browserToolKind, commandExitCode, deliveredResults, diffCounts, formatTokens, isCommandTool, isPlanApproval, isPreviewTool, isSubagent,
  isTerminalRunTool, parseHandoffMessage, parseQuotes, subagentBrief, terminalToolKind, toolDisplayStatus, toolRunStatus, withoutBranchSwitchNote,
  type AgentKind, type ChatDecision, type ChatDiff, type ChatImage, type ChatItem, type ChatPermissionMode, type Conversation
} from '@antumi/protocol'
import { readableNotice, turnText, usageLimitText, workedFor } from '../chat-text'
import { strings, t } from '../i18n'
import { agentName, isCommandRequest, modeName, relativePath } from '../labels'
import { canOperate, imageUri, respond, retryTurn, viewsOnly } from '../session'
import { runSummary, toolLabel } from '../tool-labels'
import { mono, radius, space, type, useTheme } from '../theme'
import { AgentMark } from './agent-mark'
import { ImageViewer } from './image-viewer'
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
  const [viewing, setViewing] = useState(false)
  const width = size ?? Math.min(220, image.width)
  const height = size ?? (width * image.height) / image.width
  return (
    <>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel={t('viewImage')} disabled={!uri} onPress={() => setViewing(true)} style={[styles.image, { width, height, backgroundColor: theme.raised }]}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <ActivityIndicator color={theme.text3} />}
      </Pressable>
      {viewing && uri ? <ImageViewer uri={uri} width={image.width} height={image.height} onClose={() => setViewing(false)} /> : null}
    </>
  )
}

// What the user said, as they said it: a handoff's own note, the quotes it opens with as cards,
// and the rest in the bubble. Results core brings back from delegations read as their own card.
export function UserMessage({ item, agent }: { item: Extract<ChatItem, { kind: 'user' }>; agent: AgentKind }) {
  const theme = useTheme()
  if (agentResultCallIds(item).length > 0) return <DelegationResults item={item} />
  const handoff = parseHandoffMessage(item.text)
  const said = handoff ? handoff.note || t('handoffNoNote', { agent: agentName(agent) }) : withoutBranchSwitchNote(item.text)
  const { quotes, body } = parseQuotes(said)
  const label = handoff ? t('handoff') : item.steer ? t('steer') : null
  return (
    <View style={styles.userRow}>
      {item.images.length > 0 ? <View style={styles.userImages}>{item.images.map((image) => <ChatImageView key={image.id} image={image} />)}</View> : null}
      {label ? <Text style={[type.micro, { color: theme.text3 }]}>{label}</Text> : null}
      {quotes.map((quote, index) => (
        <View key={index} style={[styles.quote, { backgroundColor: theme.raised, borderLeftColor: theme.borderStrong }]}>
          <Text style={[type.caption, { color: theme.textMuted }]} numberOfLines={4}>{quote.text}</Text>
          {quote.note ? <Text style={[type.secondary, { color: theme.text }]}>{quote.note}</Text> : null}
        </View>
      ))}
      {body ? (
        <View style={[styles.bubble, { backgroundColor: theme.userBubble }]}>
          <Text selectable style={[type.body, { color: theme.text }]}>{body}</Text>
        </View>
      ) : null}
    </View>
  )
}

// What delegated agents sent back, folded to one line: each one's name, how it ended and its report.
function DelegationResults({ item }: { item: Extract<ChatItem, { kind: 'user' }> }) {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const count = agentResultCallIds(item).length
  const results = deliveredResults(item.text)
  const states: Record<string, string> = strings.delegationStates
  return (
    <View style={[styles.steps, { borderColor: theme.border }]}>
      <Pressable onPress={() => setOpen(!open)} style={styles.stepRow}>
        <Users size={15} color={theme.textMuted} strokeWidth={2} />
        <Text style={[type.secondary, styles.stepName, styles.flexShrink, { color: theme.text }]} numberOfLines={1}>{count > 1 ? t('delegationsReceived', { count }) : t('delegationReceived')}</Text>
        <View style={styles.flex} />
        {open ? <ChevronDown size={15} color={theme.textMuted} /> : <ChevronRight size={15} color={theme.textMuted} />}
      </Pressable>
      {open ? (
        <View style={styles.toolBody}>
          {results.length === 0 ? <Markdown text={item.text} /> : results.map((result) => (
            <View key={result.callId} style={styles.section}>
              <Text style={[type.caption, styles.stepName, { color: theme.textMuted }]}>{[result.name, states[result.state] ?? result.state].join(' · ')}</Text>
              {result.result || result.error ? <Markdown text={result.result ?? result.error ?? ''} /> : null}
            </View>
          ))}
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
  if (isSubagent(tool.name)) return Users
  if (isCommandTool(tool.name) || isTerminalRunTool(tool.name) || terminalToolKind(tool.name)) return Terminal
  if (tool.diffs.length > 0) return FilePen
  if (browserToolKind(tool.name) || isPreviewTool(tool.name)) return Globe
  const name = tool.name.toLowerCase()
  if (/edit|write|patch|filechange|delete|move/.test(name)) return FilePen
  if (/todo/.test(name)) return ListChecks
  if (/grep|glob|search|find/.test(name)) return Search
  if (/web|fetch|browser|navigate/.test(name)) return Globe
  if (/read|view|open/.test(name)) return FileText
  return Wrench
}

// A long text cut where the phone stops showing it, saying how much is left.
function cut(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}\n${t('moreCharacters', { count: text.length - limit })}` : text
}

const DIFF_LINES = 300

// One file's change, as unified-diff lines on their colours; long lines scroll sideways.
function DiffView({ diff }: { diff: ChatDiff }) {
  const theme = useTheme()
  const relative = useRelative()
  const lines = diff.patch.split('\n').filter((line) => !/^(diff --git|index |--- |\+\+\+ )/.test(line))
  const shown = lines.slice(0, DIFF_LINES)
  const change = diff.change === 'add' ? `${t('newFile')} ` : diff.change === 'delete' ? `${t('deletedFile')} ` : ''
  return (
    <View style={[styles.diff, { backgroundColor: theme.codeBg }]}>
      <Text style={[type.caption, styles.stepName, { color: theme.textMuted }]} numberOfLines={1}>{change}{relative(diff.path)}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {shown.map((line, index) => {
            const added = line.startsWith('+')
            const removed = line.startsWith('-')
            const hunk = line.startsWith('@@')
            return (
              <Text key={index} style={[styles.outputText, {
                color: added ? theme.success : removed ? theme.danger : hunk ? theme.text3 : theme.textMuted,
                backgroundColor: added ? theme.successSoft : removed ? theme.dangerSoft : 'transparent'
              }]}>{line || ' '}</Text>
            )
          })}
        </View>
      </ScrollView>
      {lines.length > shown.length ? <Text style={[type.caption, { color: theme.text3 }]}>{t('moreLines', { count: lines.length - shown.length })}</Text> : null}
    </View>
  )
}

function CodeBox({ text, limit = 4000 }: { text: string; limit?: number }) {
  const theme = useTheme()
  return (
    <View style={[styles.output, { backgroundColor: theme.codeBg }]}>
      <Text selectable style={[styles.outputText, { color: theme.textMuted }]}>{cut(text, limit)}</Text>
    </View>
  )
}

// What a subagent was told and what it brought back.
function SubagentBody({ tool }: { tool: Tool }) {
  const theme = useTheme()
  const { prompt } = subagentBrief(tool.input)
  return (
    <View style={styles.toolBody}>
      {prompt ? (
        <View style={styles.section}>
          <Text style={[type.caption, styles.stepName, { color: theme.textMuted }]}>{t('subagentInstructions')}</Text>
          <Text selectable style={[type.secondary, { color: theme.text }]} numberOfLines={12}>{prompt}</Text>
        </View>
      ) : null}
      <View style={styles.section}>
        <Text style={[type.caption, styles.stepName, { color: theme.textMuted }]}>{t('subagentResult')}</Text>
        {tool.output ? <Markdown text={cut(tool.output, 8000)} /> : <Text style={[type.secondary, { color: theme.textMuted }]}>{tool.status === 'running' ? t('subagentRunning') : t('subagentNoResult')}</Text>}
      </View>
    </View>
  )
}

// What a call came to at the end of its line: still running, how it ended where that is news, and
// what it changed or cost.
function ToolTrail({ tool }: { tool: Tool }) {
  const theme = useTheme()
  const status = toolDisplayStatus(tool)
  const exit = commandExitCode(tool)
  const counts = tool.diffs.length > 0 ? diffCounts(tool.diffs) : null
  const metrics = tool.metrics
  return (
    <View style={styles.trail}>
      {tool.background ? <Text style={[type.micro, styles.badge, { color: theme.running, backgroundColor: theme.runningSoft }]}>{t('background')}</Text> : null}
      {counts ? <Text style={[type.micro, { color: theme.success }]}>+{counts.added} <Text style={{ color: theme.danger }}>−{counts.removed}</Text></Text> : null}
      {metrics ? <Text style={[type.micro, { color: theme.text3 }]}>{metrics.tools > 0 ? t('subagentMetrics', { tools: metrics.tools, tokens: formatTokens(metrics.tokens) }) : t('subagentTook', { time: workedFor(metrics.durationMs) })}</Text> : null}
      {exit !== null && exit !== 0 ? <Text style={[type.micro, { color: theme.danger }]}>exit {exit}</Text> : null}
      {status === 'running' ? <ActivityIndicator size="small" color={theme.text3} />
        : status === 'failed' ? <CircleX size={15} color={theme.danger} />
        : status === 'denied' ? <Text style={[type.micro, { color: theme.textMuted }]}>{t('toolDenied')}</Text>
        : status === 'interrupted' ? <Text style={[type.micro, { color: theme.textMuted }]}>{t('toolInterrupted')}</Text> : null}
    </View>
  )
}

function ToolLine({ tool }: { tool: Tool }) {
  const theme = useTheme()
  const relative = useRelative()
  const [open, setOpen] = useState(false)
  const Icon = toolIcon(tool)
  const subagent = isSubagent(tool.name)
  const kind = subagent ? subagentBrief(tool.input).kind : null
  const exit = commandExitCode(tool)
  const details = subagent || Boolean(tool.input || tool.output || tool.diffs.length > 0 || (exit !== null && exit !== 0))
  const stopped = tool.stopReason === 'timeLimit' ? t('stoppedAtLimit') : tool.stopReason === 'user' ? t('stoppedByYou') : null
  return (
    <View>
      <Pressable disabled={!details} onPress={() => setOpen(!open)} style={styles.stepRow}>
        <Icon size={15} color={toolDisplayStatus(tool) === 'failed' ? theme.danger : theme.textMuted} strokeWidth={2} />
        <Text style={[type.secondary, styles.stepName, styles.flexShrink, { color: theme.text }]} numberOfLines={1}>{kind ? `${toolLabel(tool.name, tool.display)} · ${kind}` : toolLabel(tool.name, tool.display)}</Text>
        <Text style={[type.secondary, styles.stepDetail, { color: theme.textMuted }]} numberOfLines={1}>{relative(tool.description ?? tool.title)}</Text>
        <ToolTrail tool={tool} />
      </Pressable>
      {stopped ? <Text style={[type.caption, styles.stopped, { color: theme.waiting }]}>{stopped}</Text> : null}
      {open ? (subagent ? <SubagentBody tool={tool} /> : (
        <View style={styles.toolBody}>
          {tool.diffs.map((diff, index) => <DiffView key={`${diff.path}:${index}`} diff={diff} />)}
          {tool.input && tool.diffs.length === 0 ? <CodeBox text={tool.input} limit={2000} /> : null}
          {tool.output ? <CodeBox text={tool.output} /> : null}
        </View>
      )) : null}
      {tool.images?.length ? <View style={styles.toolImages}>{tool.images.map((image) => <ChatImageView key={image.id} image={image} />)}</View> : null}
    </View>
  )
}

// A run of tool calls: one line when it is one call, else folded behind what the run did ("读取 3 个
// 文件，运行 2 个命令"), or what the running call says it does.
export function ToolGroup({ tools }: { tools: readonly Tool[] }) {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  if (tools.length === 1) return <View style={[styles.steps, { borderColor: theme.border }]}><ToolLine tool={tools[0]!} /></View>
  const run = toolRunStatus(tools)
  const headline = tools.find((tool) => tool.status === 'running')?.description ?? runSummary(tools)
  const counters = [run.failed ? t('runFailed', { count: run.failed }) : null, run.denied ? t('runDenied', { count: run.denied }) : null, run.interrupted ? t('runInterrupted', { count: run.interrupted }) : null].filter(Boolean).join(' · ')
  return (
    <View style={[styles.steps, { borderColor: theme.border }]}>
      <Pressable onPress={() => setOpen(!open)} style={styles.stepRow}>
        {open ? <ChevronDown size={15} color={theme.textMuted} /> : <ChevronRight size={15} color={theme.textMuted} />}
        <Text style={[type.secondary, styles.stepDetail, { color: theme.text }]} numberOfLines={1}>{headline}</Text>
        {counters ? <Text style={[type.micro, { color: run.failed ? theme.danger : theme.textMuted }]}>{counters}</Text> : null}
        {run.status === 'running' ? <ActivityIndicator size="small" color={theme.text3} /> : null}
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
  const command = isCommandRequest(item.tool)
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

export function NoticeLine({ text, tone, more = false }: { text: string; tone: 'info' | 'warning' | 'error'; more?: boolean }) {
  const theme = useTheme()
  const color = tone === 'error' ? theme.danger : tone === 'warning' ? theme.waiting : theme.textMuted
  const Icon = tone === 'info' ? Info : CircleAlert
  return (
    <View style={styles.notice}>
      <Icon size={14} color={color} />
      <Text selectable style={[type.caption, styles.flex, { color }]}>{text}</Text>
      {more ? <ChevronRight size={14} color={color} /> : null}
    </View>
  )
}

// A notice of the stage's: the compaction as a divider, a long one folded to its first line, and a
// way to try a turn again where core offers one.
export function ChatNotice({ item, conversationId }: { item: Extract<ChatItem, { kind: 'notice' }>; conversationId: string }) {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  if (item.text === CONTEXT_COMPACTED) {
    return (
      <View style={styles.divider}>
        <View style={[styles.rule, { backgroundColor: theme.border }]} />
        <Text style={[type.micro, { color: theme.text3 }]}>{t('contextCompacted')}</Text>
        <View style={[styles.rule, { backgroundColor: theme.border }]} />
      </View>
    )
  }
  const text = readableNotice(item.text)
  const [first = '', ...rest] = text.split('\n')
  const more = first.length > 160 || rest.some((line) => line.trim() !== '')
  const retry = item.action?.kind === 'retryTurn' && canOperate() ? item.action : null
  return (
    <View style={styles.section}>
      <Pressable disabled={!more} onPress={() => setOpen(!open)}>
        <NoticeLine text={open ? text : more && first.length > 160 ? `${first.slice(0, 160)}…` : first} tone={item.level} more={more && !open} />
      </Pressable>
      {retry ? (
        <Pressable disabled={retrying} onPress={() => {
          confirmTap()
          setRetrying(true)
          void retryTurn(conversationId, item.stageId, item.id).finally(() => setRetrying(false))
        }} style={[styles.retry, { backgroundColor: theme.raised }]}>
          <RotateCcw size={14} color={theme.text} />
          <Text style={[type.caption, styles.stepName, { color: theme.text }]}>{retry.stop ? (retrying ? t('stopping') : t('stopAndRetry')) : retrying ? t('reconnecting') : t('reconnectAndRetry')}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function UsageLimitLine({ item }: { item: Extract<ChatItem, { kind: 'usageLimit' }> }) {
  return <NoticeLine text={usageLimitText(item)} tone={item.status === 'continued' ? 'info' : 'warning'} />
}

// How a turn ended: a quiet line when it completed, a notice when it did not.
export function TurnEnd({ item }: { item: Extract<ChatItem, { kind: 'turn' }> }) {
  const theme = useTheme()
  if (item.state !== 'completed') return <NoticeLine text={turnText(item)} tone={item.state === 'interrupted' ? 'warning' : 'error'} />
  return <Text style={[type.micro, styles.turnEnd, { color: theme.text3 }]}>{turnText(item)}</Text>
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
  flexShrink: { flexShrink: 1, maxWidth: '60%' },
  quote: { maxWidth: '86%', borderLeftWidth: 3, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.xs },
  toolBody: { gap: space.sm, paddingBottom: space.sm },
  toolImages: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, paddingBottom: space.sm },
  section: { gap: space.xs },
  diff: { borderRadius: radius.sm, padding: space.sm, gap: space.xs },
  trail: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  badge: { borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  stopped: { paddingBottom: space.sm },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  retry: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 7, marginLeft: space.lg },
  turnEnd: { paddingHorizontal: space.xs },
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
