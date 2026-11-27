import { t, tr } from '../i18n'
import { useCallback, useState } from 'react'
import { checkAddDiscussionMember, MAX_DISCUSSION_MEMBERS, type AgentKind, type Discussion } from '@antumi/protocol'
import { resolveModel, useAgentCatalog } from '../agent-models'
import { addDiscussionMember, defaultMemberName } from '../discussions'
import { useInstalledAgents } from '../installed-agents'
import { agentLabel } from '../labels'
import { providerFor } from '../model-provider-choice'
import { useCore, useDiscussionModelProvidersSupported } from '../core-store'
import { effortLabel } from './ChatOptionsBar'
import { ChatModelPicker, ChatPicker } from './ChatPicker'
import { AgentIcon } from './icons'
import { Popover } from './Popover'
import { ProviderPicker } from './ProviderPicker'

// A name no member has: the agent's and model's, numbered when another already goes by it.
function freeName(base: string, taken: readonly string[]): string {
  const used = new Set(taken.map((name) => name.toLowerCase()))
  if (!used.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`
}

function MemberForm({ discussion, onDone }: { discussion: Discussion; onDone: () => void }) {
  const installed = useInstalledAgents()
  const [agent, setAgent] = useState<AgentKind>(installed[0] ?? 'claude')
  const [modelProvider, setModelProvider] = useState<string | undefined>()
  const [model, setModel] = useState<string | undefined>()
  const [effort, setEffort] = useState<string | undefined>()
  const [name, setName] = useState<string | null>(null)
  const [role, setRole] = useState('')
  const [busy, setBusy] = useState(false)
  const providersSupported = useDiscussionModelProvidersSupported()
  const providers = useCore((state) => state.modelProviders)
  const provider = providersSupported ? providerFor(providers, modelProvider, agent) : null
  const catalog = useAgentCatalog(agent, true, provider, modelProvider)
  const resolved = resolveModel(catalog, { model, effort })
  const names = discussion.members.map((member) => member.name)
  const shownName = name ?? freeName(defaultMemberName(agent, model ?? null), names)
  const taken = names.some((each) => each.toLowerCase() === shownName.trim().toLowerCase())
  const add = async () => {
    if (busy || taken || !shownName.trim()) return
    setBusy(true)
    const added = await addDiscussionMember(discussion.id, {
      agent, name: shownName.trim(), role: role.trim(),
      ...(modelProvider ? { modelProvider } : {}),
      ...(model ? { model } : {}), ...(resolved.effort ? { effort: resolved.effort } : {})
    })
    setBusy(false)
    if (added) onDone()
  }
  return (
    <form className="note-form discussion-member-form" data-provider={providersSupported || undefined} onSubmit={(event) => { event.preventDefault(); void add() }}>
      <p className="note-form-title">{t('DiscussionMemberForm.addAMember')}</p>
      <p className="menu-note">{t('DiscussionMemberForm.theySeeAllEarlierPostsAndJoinFrom')}</p>
      <div className="discussion-member-form-pickers">
        <ChatPicker
          label="Agent"
          value={agent}
          placeholder="Agent"
          placement="below"
          disabled={busy}
          options={installed.map((each) => ({ value: each, label: agentLabel(each), icon: <AgentIcon agent={each} /> }))}
          onChange={(value) => {
            const next = installed.find((each) => each === value)
            if (next) { setAgent(next); setModelProvider(undefined); setModel(undefined); setEffort(undefined) }
          }}
        />
        {providersSupported && <ProviderPicker
          agent={agent}
          value={modelProvider ?? null}
          placement="below"
          disabled={busy}
          onChange={(next) => { setModelProvider(next ?? undefined); setModel(undefined); setEffort(undefined) }}
        />}
        {catalog?.models.length ? (
          <ChatModelPicker
            align="start"
            placement="below"
            models={catalog.models.map((each) => ({ value: each.id, label: each.label, description: each.description, efforts: each.efforts.map((one) => ({ value: one, label: effortLabel(one) })) }))}
            model={resolved.model?.id ?? null}
            effort={resolved.effort ?? null}
            disabled={busy}
            onModel={setModel}
            onEffort={setEffort}
          />
        ) : null}
      </div>
      <label className="discussion-member-form-field">
        <span>{t('DiscussionDraft.nameForMentions')}</span>
        <input className="input" value={shownName} maxLength={60} disabled={busy} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="discussion-member-form-field">
        <span>{t('DiscussionDraft.positionOrPerspective')}</span>
        <input className="input" value={role} maxLength={2000} placeholder={t('DiscussionMemberForm.optionalEGCritic')} disabled={busy} onChange={(event) => setRole(event.target.value)} />
      </label>
      {taken && <p className="discussion-draft-error">{tr('DiscussionMemberForm.aMemberNamedAlreadyExistsChooseAnotherName', { value1: shownName.trim() })}</p>}
      <div className="note-form-actions">
        <button type="button" className="button ghost" disabled={busy} onClick={onDone}>{t('ChatCommandSettings.cancel')}</button>
        <button type="submit" className="button primary" disabled={busy || taken || !shownName.trim()}>{t('DiscussionMemberForm.join')}</button>
      </div>
    </form>
  )
}

// The end of the member row: a member joins from here, up to the limit.
export function AddMemberButton({ discussion }: { discussion: Discussion }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const full = checkAddDiscussionMember(discussion) !== null
  return (
    <li className="discussion-member discussion-member-add">
      <span className="menu-anchor">
        <button
          type="button"
          className="discussion-member-open"
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={full}
          data-tooltip={full ? t('DiscussionMemberForm.upToMembers', { MAX_DISCUSSION_MEMBERS: MAX_DISCUSSION_MEMBERS }) : t('DiscussionMemberForm.addAMemberToSpeakFromTheNext')}
          onClick={() => setOpen((current) => !current)}
        >{t('DiscussionMemberForm.member')}</button>
        {open && <Popover label={t('DiscussionMemberForm.addAMember')} onClose={close}><MemberForm discussion={discussion} onDone={close} /></Popover>}
      </span>
    </li>
  )
}
