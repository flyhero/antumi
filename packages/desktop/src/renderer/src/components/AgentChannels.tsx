import { SupportActions } from './ContactAuthor'
import { useEffect, useId, useRef, useState } from 'react'
import {
  AGENT_KINDS, CHANNEL_DEFAULTS, CHANNEL_PLATFORMS, ChannelInput, agentDescriptor, channelPlatform,
  type AgentKind, type Channel, type ChannelCredentialKey, type ChannelPlatform, type ChannelRequest, type TaskCardReview
} from '@antumi/protocol'
import { setChannels, useChannelReadiness, useChannels, useChannelsSupported, useChannelTaskCardsSupported, useChannelTaskReportsSupported, useChannelTasksSupported } from '../channels'
import { askConfirm } from '../confirm-dialog'
import { timeAgo } from '../conversation-state'
import { perform, useCore } from '../core-store'
import { t } from '../i18n'
import { agentLabel } from '../labels'
import { useOccludesBrowser } from '../browser-occlusion'
import { CopyButton } from './CopyButton'
import { ChannelRequestDetail } from './ChannelRequestDetail'
import { ChannelPlatformIcon, ChatIcon, CloseIcon, InfoIcon, PlusIcon } from './icons'
import { Toggle } from './SettingsControls'
import './agent-channels.css'

// An agent's channels on chat platforms, in its own page: where colleagues may ask it, who, and
// what it reads to answer (docs/CHANNELS.md). The agent says who it is; this says where it is.

const lines = (text: string) => [...new Set(text.split(/[\s,，]+/).map((each) => each.trim()).filter(Boolean))]
const folder = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
// Past this many projects, a list to scroll needs a filter.
const FILTER_FROM = 8

export function channelStateText(channel: Pick<Channel, 'state' | 'error' | 'tenantName' | 'enabled'>): string {
  if (!channel.enabled) return t('AgentChannels.stateDisabled')
  // DingTalk does not say its organisation's name.
  if (channel.state === 'connected') return channel.tenantName ? t('AgentChannels.stateConnected', { name: channel.tenantName }) : t('AgentChannels.stateConnectedUnnamed')
  if (channel.state === 'failed') return t('AgentChannels.stateFailed', { error: channel.error ?? '' })
  return t(channel.state === 'connecting' ? 'AgentChannels.stateConnecting' : 'AgentChannels.stateOff')
}

export function AgentChannels({ profileId, agent, hasProvider }: { profileId: string | null; agent: AgentKind; hasProvider: boolean }) {
  const supported = useChannelsSupported()
  const all = useChannels()
  const readiness = useChannelReadiness()
  const [open, setOpen] = useState<{ id: string | null; platform: ChannelPlatform; view: 'edit' | 'requests' } | null>(null)
  if (!supported) return null
  const channels = all.filter((each) => each.profileId === profileId)
  const able = Boolean(agentDescriptor(agent).capabilities.lockdown)
  const remove = async (channel: Channel) => {
    if (!await askConfirm({ message: t('AgentChannels.removeConfirm'), confirm: t('AgentChannels.remove'), danger: true })) return
    const left = await perform((rpc) => rpc.call('channels.remove', { id: channel.id }))
    if (left) setChannels(left)
    setOpen(null)
  }
  const toggle = async (channel: Channel, enabled: boolean) => {
    const { id, profileId: owner, platform, projectPaths, allowedUsers, allowedPlaces, allowDirect, allowTaskCreation, dailyPerUser, dailyTotal, maxConcurrent, turnTimeoutSec } = channel
    const saved = await perform((rpc) => rpc.call('channels.save', { id, profileId: owner, platform, enabled, projectPaths, allowedUsers, allowedPlaces, allowDirect, allowTaskCreation, dailyPerUser, dailyTotal, maxConcurrent, turnTimeoutSec }))
    if (saved) setChannels(all.map((each) => (each.id === saved.id ? saved : each)))
  }
  const missing = CHANNEL_PLATFORMS.filter((platform) => !channels.some((each) => each.platform === platform))
  return <section className="agent-card agent-channels" aria-label={t('AgentChannels.title')}>
    <header className="agent-card-head">
      <span className="agent-card-icon"><ChatIcon /></span>
      <div>
        <h3 className="agent-profile-resource-heading">{t('AgentChannels.title')}<span className="agent-profile-info" tabIndex={0} aria-label={t('AgentChannels.hintDetail')} data-tooltip={t('AgentChannels.hintDetail')} data-tooltip-side="top"><InfoIcon /></span></h3>
        <p>{t('AgentChannels.hint')}</p>
      </div>
      {able && profileId && missing.map((platform) =>
        <button key={platform} type="button" className="button" onClick={() => setOpen({ id: null, platform, view: 'edit' })}><PlusIcon />{t('AgentChannels.add', { platform: channelPlatform(platform).label })}</button>)}
    </header>
    {able && readiness?.daemon === 'outdated' && <p className="agent-channel-warning" role="alert">{t('AgentChannels.daemonOutdated', { pid: readiness.pid ?? '?' })}</p>}
    {able && !profileId && <p className="agent-channel-empty">{t('AgentChannels.saveFirst')}</p>}
    {able && profileId && channels.length === 0 && <p className="agent-channel-empty">{t('AgentChannels.none')}</p>}
    {able && profileId && channels.length > 0 && <ul className="agent-channel-list">
      {channels.map((channel) => <li key={channel.id} className="agent-channel">
        <ChannelRow channel={channel} requestsOpen={open?.id === channel.id && open.view === 'requests'}
          onToggle={(enabled) => void toggle(channel, enabled)}
          onRequests={() => setOpen(open?.id === channel.id && open.view === 'requests' ? null : { id: channel.id, platform: channel.platform, view: 'requests' })}
          onEdit={() => setOpen({ id: channel.id, platform: channel.platform, view: 'edit' })}
          onRemove={() => void remove(channel)} />
        {open?.id === channel.id && open.view === 'requests' && <ChannelRequests channel={channel} />}
      </li>)}
    </ul>}
    {able && profileId && open?.view === 'edit' && <ChannelDialog key={open.id ?? open.platform} profileId={profileId} platform={open.platform} agent={agent} hasProvider={hasProvider}
      channel={channels.find((each) => each.id === open.id) ?? null} onClose={() => setOpen(null)} />}
  </section>
}

function ChannelRow({ channel, requestsOpen, onToggle, onRequests, onEdit, onRemove }: { channel: Channel; requestsOpen: boolean; onToggle: (enabled: boolean) => void; onRequests: () => void; onEdit: () => void; onRemove: () => void }) {
  const labelId = useId()
  const ready = channelPlatform(channel.platform).credentials.every(({ key }) => channel.stored.includes(key))
  const shown = channel.enabled ? channel.state : 'off'
  const chips = [
    t('AgentChannels.scopeProjects', { count: channel.projectPaths.length }),
    t('AgentChannels.scopeAskers', { count: channel.allowedUsers.length }),
    t('AgentChannels.scopeDaily', { count: channel.dailyPerUser }),
    ...(channel.allowTaskCreation ? [t('AgentChannels.allowTaskCreation')] : []),
    ...(channel.allowTaskCreation && channel.reportTasks ? [t('AgentChannels.reportTasksChip')] : []),
    ...(channel.reportTasks && channel.taskCards ? [t('AgentChannels.cardsChip')] : [])
  ]
  return <div className="agent-channel-row">
    <span className="agent-channel-logo" aria-hidden="true"><ChannelPlatformIcon platform={channel.platform} /></span>
    <div className="agent-channel-name">
      <span className="agent-channel-title"><strong id={labelId}>{channelPlatform(channel.platform).label}</strong>
        <span className="agent-channel-state" data-state={shown}><span className="agent-channel-dot" data-state={shown} aria-hidden="true" />{ready ? channelStateText(channel) : t('AgentChannels.missingCredentials')}</span></span>
      <span className="agent-channel-chips">{chips.map((chip) => <span key={chip}>{chip}</span>)}</span>
    </div>
    <div className="agent-channel-actions">
      <button type="button" className="button small" aria-expanded={requestsOpen} onClick={onRequests}>{t('AgentChannels.requests')}</button>
      <button type="button" className="button small" onClick={onEdit}>{t('AgentChannels.edit')}</button>
      <button type="button" className="button small ghost" onClick={onRemove}>{t('AgentChannels.remove')}</button>
      <Toggle labelId={labelId} checked={channel.enabled} onChange={onToggle} />
    </div>
  </div>
}

type Draft = {
  credentials: Partial<Record<ChannelCredentialKey, string>>
  projectPaths: string[]; users: string; places: string; allowDirect: boolean; allowTaskCreation: boolean
  // undefined until chosen: turning task creation on then ticks it.
  reportTasks: boolean | undefined
  cards: boolean; owners: string; cardStart: boolean; cardAgent: AgentKind; cardReview: TaskCardReview | 'none'
  dailyPerUser: string; dailyTotal: string; maxConcurrent: string; turnTimeoutSec: string
}

// Its own view, with its own save: a channel is kept apart from the agent's form.
function ChannelDialog({ profileId, platform, channel, agent, hasProvider, onClose }: { profileId: string; platform: ChannelPlatform; channel: Channel | null; agent: AgentKind; hasProvider: boolean; onClose: () => void }) {
  useOccludesBrowser()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  const formId = useId()
  const descriptor = channelPlatform(platform)
  const all = useChannels()
  const [projects, setProjects] = useState<string[]>([])
  const taskCreationSupported = useChannelTasksSupported()
  const reportsSupported = useChannelTaskReportsSupported()
  const cardsSupported = useChannelTaskCardsSupported() && descriptor.features.cards
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(() => ({
    credentials: {},
    projectPaths: channel?.projectPaths ?? [], users: (channel?.allowedUsers ?? []).join('\n'), places: (channel?.allowedPlaces ?? []).join('\n'), allowDirect: channel?.allowDirect ?? false, allowTaskCreation: channel?.allowTaskCreation ?? false,
    reportTasks: channel?.reportTasks,
    cards: !!channel?.taskCards, owners: (channel?.ownerUsers ?? []).join('\n'),
    cardStart: channel?.taskCards ? channel.taskCards.start !== null : true, cardAgent: channel?.taskCards?.start?.agent ?? agent,
    cardReview: channel?.taskCards ? channel.taskCards.review ?? 'none' : 'ownerOrAsker',
    dailyPerUser: String(channel?.dailyPerUser ?? CHANNEL_DEFAULTS.dailyPerUser), dailyTotal: String(channel?.dailyTotal ?? CHANNEL_DEFAULTS.dailyTotal),
    maxConcurrent: String(channel?.maxConcurrent ?? CHANNEL_DEFAULTS.maxConcurrent), turnTimeoutSec: String(channel?.turnTimeoutSec ?? CHANNEL_DEFAULTS.turnTimeoutSec)
  }))
  useEffect(() => {
    void perform((rpc) => rpc.call('projects.recent', {})).then((recent) => setProjects(recent ?? []))
  }, [])
  const [filter, setFilter] = useState('')
  // One it was given and is no longer recent still shows, so it can be seen and taken off. Ordered by what
  // it had on opening, so a project ticked now does not jump to the top.
  const offered = [...new Set([...(channel?.projectPaths ?? []), ...projects, ...draft.projectPaths])]
  const query = filter.trim().toLowerCase()
  const shown = query ? offered.filter((project) => project.toLowerCase().includes(query)) : offered
  const save = async () => {
    const credentials = Object.fromEntries(descriptor.credentials.flatMap(({ key }) => (draft.credentials[key]?.trim() ? [[key, draft.credentials[key].trim()]] : [])))
    const parsed = ChannelInput.safeParse({
      ...(channel ? { id: channel.id } : {}), profileId, platform, enabled: channel?.enabled ?? true, credentials,
      projectPaths: draft.projectPaths, allowedUsers: lines(draft.users), allowedPlaces: lines(draft.places), allowDirect: draft.allowDirect, allowTaskCreation: draft.allowTaskCreation,
      ...(reportsSupported && draft.reportTasks !== undefined ? { reportTasks: draft.reportTasks } : {}),
      ...(cardsSupported ? {
        ownerUsers: lines(draft.owners),
        taskCards: draft.cards ? { start: draft.cardStart ? { agent: draft.cardAgent } : null, review: draft.cardReview === 'none' ? null : draft.cardReview } : null
      } : {}),
      dailyPerUser: Number(draft.dailyPerUser), dailyTotal: Number(draft.dailyTotal), maxConcurrent: Number(draft.maxConcurrent), turnTimeoutSec: Number(draft.turnTimeoutSec)
    })
    if (!parsed.success) { setError(t('AgentChannels.invalid', { field: parsed.error.issues[0]?.path.join('.') ?? '' })); return }
    setBusy(true); setError(null)
    const saved = await perform((rpc) => rpc.call('channels.save', parsed.data))
    setBusy(false)
    if (!saved) { setError(useCore.getState().error); return }
    setChannels(all.some((each) => each.id === saved.id) ? all.map((each) => (each.id === saved.id ? saved : each)) : [...all, saved])
    onClose()
  }
  // Enter in a field here saves the channel, not the agent's form around it.
  const onEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    void save()
  }
  const number = (key: 'dailyPerUser' | 'dailyTotal' | 'maxConcurrent' | 'turnTimeoutSec', label: string, min: number, max: number) =>
    <div className="squad-field"><label htmlFor={`${formId}-${key}`}>{label}</label><input id={`${formId}-${key}`} className="input" type="number" min={min} max={max} value={draft[key]} onKeyDown={onEnter} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></div>
  const title = t(channel ? 'AgentChannels.editTitle' : 'AgentChannels.add', { platform: descriptor.label })
  return <dialog ref={dialog} className="modal agent-channel-dialog" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose() }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal-body">
    <header className="modal-header"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button modal-close" aria-label={t('AgentChannels.cancel')} onClick={onClose}><CloseIcon /></button></header>
    <div className="agent-channel-steps">
    <div className="agent-channel-step">
      <h4><span className="agent-channel-step-number" aria-hidden="true">1</span>{t('AgentChannels.step1')}</h4>
      <p className="squad-block-hint muted">{t(`AgentChannels.${platform}.create`)}</p>
      <div className="agent-channel-step-actions">
        <a className="button" href={descriptor.console} target="_blank" rel="noreferrer">{t('AgentChannels.openConsole')}</a>
        {descriptor.manifest && <CopyButton text={descriptor.manifest} label={t('AgentChannels.copyManifest')}>{t('AgentChannels.copyManifest')}</CopyButton>}
      </div>
    </div>
    <div className="agent-channel-step">
      <h4><span className="agent-channel-step-number" aria-hidden="true">2</span>{t('AgentChannels.step2')}</h4>
      <p className="squad-block-hint muted">{t(`AgentChannels.${platform}.tokens`)}</p>
      <div className="agent-channel-grid">
        {descriptor.credentials.map(({ key, label, prefix }) => <div key={key} className="squad-field">
          <label htmlFor={`${formId}-${key}`}>{label}</label>
          <input id={`${formId}-${key}`} className="input" type="password" autoComplete="off" spellCheck={false} placeholder={channel?.stored.includes(key) ? t('AgentChannels.tokenStored') : prefix ? `${prefix}…` : ''}
            value={draft.credentials[key] ?? ''} onKeyDown={onEnter} onChange={(event) => setDraft({ ...draft, credentials: { ...draft.credentials, [key]: event.target.value } })} />
        </div>)}
      </div>
    </div>
    <div className="agent-channel-step">
      <h4><span className="agent-channel-step-number" aria-hidden="true">3</span>{t('AgentChannels.step3')}{draft.projectPaths.length > 0 && <span className="agent-channel-step-count">{t('AgentChannels.projectsPicked', { count: draft.projectPaths.length })}</span>}</h4>
      <p className="squad-block-hint muted">{t('AgentChannels.projectsHint')}</p>
      {offered.length > FILTER_FROM && <input className="input" type="search" value={filter} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault() }} onChange={(event) => setFilter(event.target.value)} placeholder={t('AgentChannels.filterProjects')} aria-label={t('AgentChannels.filterProjects')} />}
      {offered.length === 0 ? <p className="squad-block-hint muted">{t('AgentChannels.noProjects')}</p> : <div className="agent-channel-projects">
        {shown.map((project) => <label key={project} className="agent-profile-check" title={project}>
          <input type="checkbox" checked={draft.projectPaths.includes(project)} onChange={(event) => setDraft({ ...draft, projectPaths: event.target.checked ? [...draft.projectPaths, project] : draft.projectPaths.filter((each) => each !== project) })} />
          <span className="agent-channel-project">{folder(project)} <span className="muted">{project}</span></span>
        </label>)}
        {shown.length === 0 && <p className="squad-block-hint muted">{t('AgentChannels.noMatch')}</p>}
      </div>}
      {taskCreationSupported && <>
        <label className="agent-profile-check"><input type="checkbox" checked={draft.allowTaskCreation} onChange={(event) => setDraft({ ...draft, allowTaskCreation: event.target.checked, reportTasks: draft.reportTasks ?? (event.target.checked || undefined) })} />{t('AgentChannels.allowTaskCreation')}</label>
        <p className="squad-block-hint muted">{t('AgentChannels.taskCreationHint')}</p>
        {/* Still there with collecting off: tasks collected before go on reporting until it is turned off. */}
        {reportsSupported && (draft.allowTaskCreation || draft.reportTasks) && <>
          <label className="agent-profile-check"><input type="checkbox" checked={draft.reportTasks ?? false} onChange={(event) => setDraft({ ...draft, reportTasks: event.target.checked })} />{t('AgentChannels.reportTasks')}</label>
          <p className="squad-block-hint muted">{t('AgentChannels.reportTasksHint')}</p>
        </>}
        {/* Cards are a kind of report: with reports off there is nothing to put on them. */}
        {cardsSupported && draft.reportTasks && <>
          <label className="agent-profile-check"><input type="checkbox" checked={draft.cards} onChange={(event) => setDraft({ ...draft, cards: event.target.checked })} />{t('AgentChannels.cards')}</label>
          <p className="squad-block-hint muted">{t('AgentChannels.cardsHint')}</p>
          {draft.cards && <div className="agent-channel-grid">
            <div className="squad-field"><label htmlFor={`${formId}-owners`}>{t('AgentChannels.owners')}</label><textarea id={`${formId}-owners`} className="input" rows={2} spellCheck={false} value={draft.owners} onChange={(event) => setDraft({ ...draft, owners: event.target.value })} /></div>
            <div className="squad-field">
              <label className="agent-profile-check"><input type="checkbox" checked={draft.cardStart} onChange={(event) => setDraft({ ...draft, cardStart: event.target.checked })} />{t('AgentChannels.cardStart')}</label>
              {draft.cardStart && <select className="input" aria-label={t('AgentChannels.cardAgent')} value={draft.cardAgent} onChange={(event) => setDraft({ ...draft, cardAgent: AGENT_KINDS.find((each) => each === event.target.value) ?? draft.cardAgent })}>
                {AGENT_KINDS.map((each) => <option key={each} value={each}>{agentLabel(each)}</option>)}
              </select>}
              <label htmlFor={`${formId}-review`}>{t('AgentChannels.cardReview')}</label>
              <select id={`${formId}-review`} className="input" value={draft.cardReview} onChange={(event) => setDraft({ ...draft, cardReview: event.target.value === 'owner' || event.target.value === 'ownerOrAsker' ? event.target.value : 'none' })}>
                <option value="ownerOrAsker">{t('AgentChannels.cardReviewOwnerOrAsker')}</option>
                <option value="owner">{t('AgentChannels.cardReviewOwner')}</option>
                <option value="none">{t('AgentChannels.cardReviewNone')}</option>
              </select>
            </div>
          </div>}
          {draft.cards && <p className="squad-block-hint muted">{t('AgentChannels.cardsSetup')}</p>}
          {draft.cards && lines(draft.owners).length === 0 && <p className="squad-block-hint muted">{t('AgentChannels.ownersMissing')}</p>}
        </>}
      </>}
    </div>
    <div className="agent-channel-step">
      <h4><span className="agent-channel-step-number" aria-hidden="true">4</span>{t('AgentChannels.step4')}</h4>
      <div className="agent-channel-grid">
        <div className="squad-field"><label htmlFor={`${formId}-users`}>{t('AgentChannels.users')}</label><textarea id={`${formId}-users`} className="input" rows={3} spellCheck={false} value={draft.users} onChange={(event) => setDraft({ ...draft, users: event.target.value })} /></div>
        <div className="squad-field"><label htmlFor={`${formId}-places`}>{t('AgentChannels.places')}</label><textarea id={`${formId}-places`} className="input" rows={3} spellCheck={false} value={draft.places} onChange={(event) => setDraft({ ...draft, places: event.target.value })} /></div>
      </div>
      <p className="squad-block-hint muted">{t(`AgentChannels.${platform}.ids`)}</p>
      <label className="agent-profile-check"><input type="checkbox" checked={draft.allowDirect} onChange={(event) => setDraft({ ...draft, allowDirect: event.target.checked })} />{t('AgentChannels.allowDirect')}</label>
    </div>
    <div className="agent-channel-step">
      <h4><span className="agent-channel-step-number" aria-hidden="true">5</span>{t('AgentChannels.step5')}</h4>
      <div className="agent-channel-grid agent-channel-limits">
        {number('dailyPerUser', t('AgentChannels.dailyPerUser'), 1, 500)}
        {number('dailyTotal', t('AgentChannels.dailyTotal'), 1, 10_000)}
        {number('maxConcurrent', t('AgentChannels.maxConcurrent'), 1, 5)}
        {number('turnTimeoutSec', t('AgentChannels.turnTimeout'), 30, 1800)}
      </div>
      {!hasProvider && <p className="squad-block-hint muted">{t('AgentChannels.quotaHint', { agent: agentLabel(agent) })}</p>}
    </div>
    <ul className="agent-channel-notes muted">
      <li>{t('AgentChannels.instructionsHint')}</li>
      <li>{t('AgentChannels.offlineHint')}</li>
    </ul>
    </div>
    {error && <p className="modal-error" role="alert">{error}<SupportActions error={error} /></p>}
    <footer className="modal-footer agent-channel-footer">
      <button type="button" className="button ghost" disabled={busy} onClick={onClose}>{t('AgentChannels.cancel')}</button>
      <button type="button" className="button primary" disabled={busy} onClick={() => void save()}>{t('AgentChannels.save')}</button>
    </footer>
    </div>
  </dialog>
}

const PAGE = 30

function ChannelRequests({ channel }: { channel: Channel }) {
  const [items, setItems] = useState<ChannelRequest[] | null>(null)
  const [before, setBefore] = useState<number | null>(null)
  const [opened, setOpened] = useState<string | null>(null)
  const now = Date.now()
  const load = async (from: number | null) => {
    const page = await perform((rpc) => rpc.call('channels.requests', { channelId: channel.id, limit: PAGE, ...(from === null ? {} : { before: from }) }))
    if (!page) return
    setItems((current) => (from === null ? page.items : [...(current ?? []), ...page.items]))
    setBefore(page.before)
  }
  useEffect(() => { void load(null) }, [channel.id])
  if (items === null) return null
  return <div className="agent-channel-panel">
    <div className="agent-channel-actions"><button type="button" className="button small" onClick={() => void load(null)}>{t('AgentChannels.refresh')}</button></div>
    {items.length === 0 ? <p className="squad-block-hint muted">{t('AgentChannels.noRequests')}</p> : <ul className="agent-channel-requests">
      {items.map((request) => <li key={request.id}>
        <button type="button" className="agent-channel-request" aria-expanded={opened === request.id} onClick={() => setOpened(opened === request.id ? null : request.id)}>
          <span className="agent-channel-request-heading"><span className="agent-channel-request-text">{request.text || t('AgentChannels.imagesOnly')}</span><span className="agent-channel-request-toggle">{t(opened === request.id ? 'AgentChannels.collapseDetail' : 'AgentChannels.viewDetail')}</span></span>
          <span className="agent-channel-request-meta">
            <span data-state={request.state}>{t(`AgentChannels.request.${request.state}`)}{request.refusal ? `（${refusalText(request.refusal)}）` : ''}</span>
            <span>{request.asker}{request.direct ? ` · ${t('AgentChannels.direct')}` : ` · ${request.place}`}</span>
            <span>{timeAgo(request.createdAt, now)}</span>
            {request.images > 0 && <span>{t('AgentChannels.images', { count: request.images })}</span>}
            {request.endedAt !== null && request.startedAt !== null && <span>{t('AgentChannels.seconds', { count: Math.max(1, Math.round((request.endedAt - request.startedAt) / 1000)) })}</span>}
            {request.totalTokens !== null && <span>{t('AgentChannels.tokens', { count: request.totalTokens })}</span>}
            {request.redacted && <span data-state="failed">{t('AgentChannels.redacted')}</span>}
          </span>
        </button>
        {opened === request.id && <ChannelRequestDetail request={request} />}
      </li>)}
    </ul>}
    {before !== null && <div className="agent-channel-actions"><button type="button" className="button small" onClick={() => void load(before)}>{t('AgentChannels.earlier')}</button></div>}
  </div>
}

function refusalText(refusal: string): string {
  return refusal === 'quota' ? t('AgentChannels.refusalQuota') : refusal === 'restarted' ? t('AgentChannels.refusalRestarted') : refusal === 'acl' ? t('AgentChannels.refusalAcl') : refusal
}
