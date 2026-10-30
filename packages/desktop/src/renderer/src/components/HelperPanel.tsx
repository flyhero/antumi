import { useShortcutHint } from '../keyboard-shortcuts'
import { t } from '../i18n'
import { useState } from 'react'
import type { Conversation } from '@antumi/protocol'
import { perform, useCore } from '../core-store'
import { ensureHelper, helperModel, helperProvider, useHelper } from '../helper-conversations'
import { keepInitialMessage, sendInitialMessage } from '../initial-messages'
import { useChat } from '../chat-state'
import { setQuotes, useQuotes } from '../chat-quotes'
import { usePreferences } from '../preferences'
import { useChatTypeface } from '../chat-typeface'
import { confirmQuota } from './AgentQuota'
import { ConversationChat } from './ConversationChat'
import { conversationSurface } from './chat-surface'
import { HelperModePicker, HelperModelPicker, helperMode, helperModes, useHelperCatalog } from './HelperModelPicker'
import { sendsMessage } from './ChatComposer'
import { EnterIcon } from './icons'
import { composerDraft, saveComposerDraft, EMPTY_DRAFT } from '../composer-drafts'
import { askConfirm } from '../confirm-dialog'

function HelperDraft({ parent }: { parent: Conversation }) {
  const sendLabel = useShortcutHint('send-message', t('ChatComposer.send'))
  const [text, setText] = useState(() => composerDraft(`helper:${parent.id}`).text)
  const [choice, setChoice] = useState<{ model: string | null; effort: string | null } | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const rpc = useCore((state) => state.rpc)
  const catalog = useHelperCatalog(parent.agent, helperProvider(parent))
  // The small model picked for the agent's own jobs means nothing on a provider.
  const preference = usePreferences((state) => state.quickModels[parent.agent])
  const model = choice?.model ?? ((helperProvider(parent) ? null : preference) || helperModel(parent, catalog ?? null))
  const effort = choice?.effort ?? null
  const offered = helperModes(parent.agent, catalog, model)
  const permissionMode = helperMode(offered, picked)
  const send = async () => {
    if (busy || !text.trim() || !rpc || catalog === undefined || !await confirmQuota(parent.agent, model)) return
    setBusy(true)
    const helper = await ensureHelper(parent, { model, effort, permissionMode })
    if (helper) {
      keepInitialMessage(helper.id, text.trim(), [])
      saveComposerDraft(`helper:${parent.id}`, EMPTY_DRAFT)
      void sendInitialMessage(helper.id, rpc)
    }
    setBusy(false)
  }
  const typeface = useChatTypeface()
  return <div className="helper-draft chat-view" data-variant="compact" {...typeface}>
    <p className="helper-empty muted">{t('HelperPanel.askASmallModelAboutSelectedContentOr')}</p>
    <div className="chat-dock"><div className="chat-input-card">
      <textarea className="chat-input" aria-label={t('ChatContextMenu.askHelper')} placeholder={t('ChatComposer.askHelper')} autoFocus value={text} disabled={busy} onChange={(event) => {
        setText(event.target.value)
        saveComposerDraft(`helper:${parent.id}`, { ...EMPTY_DRAFT, text: event.target.value })
      }} onKeyDown={(event) => { if (sendsMessage(event)) { event.preventDefault(); void send() } }} />
      <div className="chat-options">
        {catalog !== undefined && <HelperModePicker agent={parent.agent} offered={offered} mode={permissionMode} disabled={busy} onMode={setPicked} />}
        <span className="chat-dock-spacer" />
        <HelperModelPicker catalog={catalog} model={model} effort={effort} disabled={busy} onModel={(model) => setChoice({ model, effort: null })} onEffort={(effort) => setChoice({ model, effort })} />
        <button type="button" className="chat-input-button" data-tooltip-side="top-end" aria-label={sendLabel} data-tooltip={busy ? t('HelperPanel.startingHelper') : sendLabel} disabled={busy || !text.trim() || catalog === undefined} onClick={() => void send()}>
          <EnterIcon />
        </button>
      </div>
    </div></div>
  </div>
}

export function HelperPanel({ parent }: { parent: Conversation }) {
  const helper = useHelper(parent.id)
  const [busy, setBusy] = useState(false)
  const quotes = useQuotes(helper?.id ?? `helper:${parent.id}`)
  const page = useChat((state) => helper ? state[helper.id] : undefined)
  const reset = async () => {
    if (!helper || busy) return
    const hasContent = Boolean(quotes.length || composerDraft(helper.id).text.trim() || helper.sessionId || helper.lastExit || helper.starting || page?.items.some((item) => item.kind === 'user'))
    if (hasContent && !await askConfirm({ message: t('HelperPanel.clearHelperHistoryAndStartANewConversation'), confirm: t('ConfirmDialog.clearAndRestart'), danger: true })) return
    setBusy(true)
    const deleted = await perform((rpc) => rpc.call('conversations.delete', { id: helper.id }))
    if (deleted) {
      setQuotes(helper.id, [])
      saveComposerDraft(helper.id, EMPTY_DRAFT)
      saveComposerDraft(`helper:${parent.id}`, EMPTY_DRAFT)
    }
    setBusy(false)
  }
  const base = helper ? conversationSurface(helper) : null
  return <section className="helper-panel" aria-label={t('HelperPanel.helper')}>
    <header className="helper-header"><button type="button" className="button ghost" disabled={!helper || busy} onClick={() => void reset()}>{t('HelperPanel.newConversation')}</button></header>
    {helper && base ? <ConversationChat key={helper.id} conversation={helper} variant="compact" surface={{ ...base, fork: null, handoff: null, changes: null, showPlan: () => {}, showBrowser: () => {}, showChanges: () => {}, showFileChange: () => {}, inProject: () => false }} /> : <HelperDraft key={parent.id} parent={parent} />}
  </section>
}
