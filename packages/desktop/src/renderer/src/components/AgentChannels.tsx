import { SupportActions } from './ContactAuthor'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  AGENT_KINDS, CHANNEL_DEFAULTS, CHANNEL_PLATFORMS, ChannelInput, agentDescriptor, channelPlatform, translatedText,
  type AgentKind, type Channel, type ChannelCredentialKey, type ChannelPlatform, type ChannelRequest, type DocAccess, type DocLocation, type TaskCardReview
} from '@antumi/protocol'
import { setChannels, useChannelFollowUpsSupported, useChannelPlatformToolsSupported, useChannelReadiness, useChannels, useChannelsSupported, useChannelTaskCardsSupported, useChannelTaskReportsSupported, useChannelTasksSupported } from '../channels'
import { askConfirm } from '../confirm-dialog'
import { timeAgo } from '../conversation-state'
import { perform, useCore } from '../core-store'
import { t, useLocale } from '../i18n'
import { agentLabel } from '../labels'
import { useOccludesBrowser } from '../browser-occlusion'
import { CopyButton } from './CopyButton'
import { ChannelRequestDetail } from './ChannelRequestDetail'
import { ChatPicker } from './ChatPicker'
import { AgentIcon, ChannelPlatformIcon, ChatIcon, CloseIcon, InfoIcon, PlusIcon } from './icons'
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
    ...(channel.allowTaskCreation ? [t('AgentChannels.taskCreationChip')] : []),
    ...(channel.allowTaskCreation && channel.reportTasks ? [t('AgentChannels.reportTasksChip')] : []),
    ...(channel.reportTasks && channel.taskCards ? [t('AgentChannels.cardsChip')] : []),
    ...(channel.platformTools?.length ? [t('AgentChannels.toolsChip', { count: channel.platformTools.length })] : []),
    ...(channel.followUps ? [t('AgentChannels.followUpsChip')] : [])
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

// The longer why of a setting, on hover or focus, so the form reads as a list of choices. It opens
// to the right: the settings sit at the dialog's left, where opening left would cut it off.
function Info({ text }: { text: string }) {
  return <span className="agent-profile-info" tabIndex={0} aria-label={text} data-tooltip={text} data-tooltip-align="start"><InfoIcon /></span>
}

// A switch with its why beside it, outside the label so pointing at the why does not flip the switch.
function Option({ checked, onChange, label, info }: { checked: boolean; onChange: (checked: boolean) => void; label: string; info?: string }) {
  return <div className="agent-channel-option">
    <label className="agent-profile-check"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>
    {info && <Info text={info} />}
  </div>
}

type Draft = {
  credentials: Partial<Record<ChannelCredentialKey, string>>
  projectPaths: string[]; users: string; places: string; allowDirect: boolean; allowTaskCreation: boolean
  // undefined until chosen: turning task creation on then ticks it.
  reportTasks: boolean | undefined
  cards: boolean; owners: string; cardStart: boolean; cardAgent: AgentKind; cardReview: TaskCardReview | 'none'
  tools: string[]; docKind: DocLocation['kind']; docValue: string; docAccess: DocAccess
  followUps: boolean
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
  const toolCatalog = useChannelPlatformToolsSupported() ? descriptor.tools : undefined
  const followUpsSupported = useChannelFollowUpsSupported() && descriptor.features.followUps
  const locale = useLocale((state) => state.locale)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(() => ({
    credentials: {},
    projectPaths: channel?.projectPaths ?? [], users: (channel?.allowedUsers ?? []).join('\n'), places: (channel?.allowedPlaces ?? []).join('\n'), allowDirect: channel?.allowDirect ?? false, allowTaskCreation: channel?.allowTaskCreation ?? false,
    reportTasks: channel?.reportTasks,
    cards: !!channel?.taskCards, owners: (channel?.ownerUsers ?? []).join('\n'),
    cardStart: channel?.taskCards ? channel.taskCards.start !== null : true, cardAgent: channel?.taskCards?.start?.agent ?? agent,
    cardReview: channel?.taskCards ? channel.taskCards.review ?? 'none' : 'ownerOrAsker',
    followUps: channel?.followUps ?? false,
    tools: channel?.platformTools ?? [], docKind: channel?.docLocation?.kind ?? 'wikiNode', docValue: channel?.docLocation?.value ?? '', docAccess: channel?.docAccess ?? 'edit',
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
      ...(followUpsSupported ? { followUps: draft.followUps } : {}),
      ...(toolCatalog ? {
        platformTools: draft.tools,
        docLocation: draft.docValue.trim() ? { kind: draft.docKind, value: draft.docValue.trim() } : null,
        docAccess: draft.docAccess
      } : {}),
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
  // Steps after the projects are numbered as they appear: the platform may have no tools, core no tasks.
  const toolsStep = 5 + Number(taskCreationSupported)
  const limitsStep = toolsStep + Number(Boolean(toolCatalog))
  const heading = (step: number, text: string, info?: string, extra?: ReactNode) =>
    <h4><span className="agent-channel-step-number" aria-hidden="true">{step}</span>{text}{info && <Info text={info} />}{extra}</h4>
  const title = t(channel ? 'AgentChannels.editTitle' : 'AgentChannels.add', { platform: descriptor.label })
  return <dialog ref={dialog} className="modal agent-channel-dialog" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose() }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal-body">
    <header className="modal-header"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button modal-close" aria-label={t('AgentChannels.cancel')} onClick={onClose}><CloseIcon /></button></header>
    <div className="agent-channel-steps">
    <div className="agent-channel-step">
      {heading(1, t('AgentChannels.step1'))}
      <p className="squad-block-hint muted">{t(`AgentChannels.${platform}.create`)}</p>
      <div className="agent-channel-step-actions">
        <a className="button" href={descriptor.console} target="_blank" rel="noreferrer">{t('AgentChannels.openConsole')}</a>
        {descriptor.manifest && <CopyButton text={descriptor.manifest} label={t('AgentChannels.copyManifest')}>{t('AgentChannels.copyManifest')}</CopyButton>}
      </div>
    </div>
    <div className="agent-channel-step">
      {heading(2, t('AgentChannels.step2'))}
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
      {heading(3, t('AgentChannels.step3'), t('AgentChannels.projectsHint'), draft.projectPaths.length > 0 && <span className="agent-channel-step-count">{t('AgentChannels.projectsPicked', { count: draft.projectPaths.length })}</span>)}
      {offered.length > FILTER_FROM && <input className="input" type="search" value={filter} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault() }} onChange={(event) => setFilter(event.target.value)} placeholder={t('AgentChannels.filterProjects')} aria-label={t('AgentChannels.filterProjects')} />}
      {offered.length === 0 ? <p className="squad-block-hint muted">{t('AgentChannels.noProjects')}</p> : <div className="agent-channel-projects">
        {shown.map((project) => <label key={project} className="agent-profile-check" title={project}>
          <input type="checkbox" checked={draft.projectPaths.includes(project)} onChange={(event) => setDraft({ ...draft, projectPaths: event.target.checked ? [...draft.projectPaths, project] : draft.projectPaths.filter((each) => each !== project) })} />
          <span className="agent-channel-project">{folder(project)} <span className="muted">{project}</span></span>
        </label>)}
        {shown.length === 0 && <p className="squad-block-hint muted">{t('AgentChannels.noMatch')}</p>}
      </div>}
    </div>
    <div className="agent-channel-step">
      {heading(4, t('AgentChannels.step4'))}
      <div className="agent-channel-grid">
        <div className="squad-field"><label htmlFor={`${formId}-users`}>{t('AgentChannels.users')}</label><textarea id={`${formId}-users`} className="input" rows={3} spellCheck={false} value={draft.users} onChange={(event) => setDraft({ ...draft, users: event.target.value })} /></div>
        <div className="squad-field"><label htmlFor={`${formId}-places`}>{t('AgentChannels.places')}</label><textarea id={`${formId}-places`} className="input" rows={3} spellCheck={false} value={draft.places} onChange={(event) => setDraft({ ...draft, places: event.target.value })} /></div>
      </div>
      <p className="squad-block-hint muted">{t(`AgentChannels.${platform}.ids`)}</p>
      <Option checked={draft.allowDirect} onChange={(allowDirect) => setDraft({ ...draft, allowDirect })} label={t('AgentChannels.allowDirect')} />
      {followUpsSupported && <Option checked={draft.followUps} onChange={(followUps) => setDraft({ ...draft, followUps })} label={t('AgentChannels.followUps')} info={t('AgentChannels.followUpsHint')} />}
      {followUpsSupported && draft.followUps && descriptor.followUpScopes && <div className="agent-channel-needs">
        <p className="squad-block-hint muted">{t('AgentChannels.followUpsScope', { scope: descriptor.followUpScopes.join('、') })}</p>
        <CopyButton text={JSON.stringify({ scopes: { tenant: descriptor.followUpScopes, user: [] } }, null, 2)} label={t('AgentChannels.copyScopes')}>{t('AgentChannels.copyScopes')}</CopyButton>
      </div>}
    </div>
    {taskCreationSupported && <div className="agent-channel-step">
      {heading(5, t('AgentChannels.stepTasks'), t('AgentChannels.stepTasksHint'))}
      <Option checked={draft.allowTaskCreation} onChange={(allowTaskCreation) => setDraft({ ...draft, allowTaskCreation, reportTasks: draft.reportTasks ?? (allowTaskCreation || undefined) })} label={t('AgentChannels.allowTaskCreation')} info={t('AgentChannels.taskCreationHint')} />
      {/* Still there with collecting off: tasks collected before go on reporting until it is turned off. */}
      {reportsSupported && (draft.allowTaskCreation || draft.reportTasks) && <Option checked={draft.reportTasks ?? false} onChange={(reportTasks) => setDraft({ ...draft, reportTasks })} label={t('AgentChannels.reportTasks')} info={t('AgentChannels.reportTasksHint')} />}
      {/* Cards are a kind of report: with reports off there is nothing to put on them. */}
      {cardsSupported && draft.reportTasks && <Option checked={draft.cards} onChange={(cards) => setDraft({ ...draft, cards })} label={t('AgentChannels.cards')} info={t('AgentChannels.cardsHint')} />}
      {cardsSupported && draft.reportTasks && draft.cards && <div className="agent-channel-grid">
        <div className="squad-field">
          <span className="agent-channel-option"><label htmlFor={`${formId}-owners`}>{t('AgentChannels.owners')}</label><Info text={t('AgentChannels.ownersHint')} /></span>
          <textarea id={`${formId}-owners`} className="input" rows={2} spellCheck={false} value={draft.owners} onChange={(event) => setDraft({ ...draft, owners: event.target.value })} />
          {lines(draft.owners).length === 0 && <p className="squad-block-hint agent-channel-warning">{t('AgentChannels.ownersMissing')}</p>}
        </div>
        <div className="squad-field">
          <Option checked={draft.cardStart} onChange={(cardStart) => setDraft({ ...draft, cardStart })} label={t('AgentChannels.cardStart')} info={t('AgentChannels.cardStartHint')} />
          {draft.cardStart && <ChatPicker label={t('AgentChannels.cardAgent')} value={draft.cardAgent} placeholder="" size="field" placement="below"
            options={AGENT_KINDS.map((each) => ({ value: each, label: agentLabel(each), icon: <AgentIcon agent={each} /> }))}
            onChange={(value) => setDraft({ ...draft, cardAgent: AGENT_KINDS.find((each) => each === value) ?? draft.cardAgent })} />}
          <span>{t('AgentChannels.cardReview')}</span>
          <ChatPicker label={t('AgentChannels.cardReview')} value={draft.cardReview} placeholder="" size="field" placement="below"
            options={[
              { value: 'ownerOrAsker', label: t('AgentChannels.cardReviewOwnerOrAsker'), description: t('AgentChannels.cardReviewOwnerOrAskerHint') },
              { value: 'owner', label: t('AgentChannels.cardReviewOwner'), description: t('AgentChannels.cardReviewOwnerHint') },
              { value: 'none', label: t('AgentChannels.cardReviewNone'), description: t('AgentChannels.cardReviewNoneHint') }
            ]}
            onChange={(value) => setDraft({ ...draft, cardReview: value === 'owner' || value === 'ownerOrAsker' ? value : 'none' })} />
        </div>
      </div>}
      {cardsSupported && draft.reportTasks && draft.cards && <div className="agent-channel-needs">
        <p className="squad-block-hint muted">{t('AgentChannels.cardsSetupShort')}</p>
        <Info text={t('AgentChannels.cardsSetup')} />
      </div>}
    </div>}
    {toolCatalog && <div className="agent-channel-step">
      {heading(toolsStep, t('AgentChannels.tools'), t('AgentChannels.toolsHint'))}
      {[false, true].map((write) => <div key={String(write)} className="agent-channel-projects">
        <p className="squad-block-hint muted">{t(write ? 'AgentChannels.toolsWrite' : 'AgentChannels.toolsRead')}</p>
        {toolCatalog.catalog.filter((tool) => tool.write === write).map((tool) => <label key={tool.name} className="agent-profile-check">
          <input type="checkbox" checked={draft.tools.includes(tool.name)} onChange={(event) => setDraft({ ...draft, tools: event.target.checked ? [...draft.tools, tool.name] : draft.tools.filter((each) => each !== tool.name) })} />
          {translatedText(tool, locale).label} <span className="muted">{tool.name}</span>
        </label>)}
      </div>)}
      {draft.tools.length > 0 && (() => {
        const picked = toolCatalog.catalog.filter((tool) => draft.tools.includes(tool.name))
        const writes = picked.some((tool) => tool.write)
        const scopes = [...new Set([...picked.flatMap((tool) => tool.scopes), ...(writes && draft.docAccess !== 'none' ? toolCatalog.accessScopes : [])])]
        return <>
          {/* What it risks stays in view, in a line; the rest of it is a hover away. */}
          <div className="agent-channel-needs">
            <p className="squad-block-hint agent-channel-warning">{t(writes ? 'AgentChannels.toolsRiskWrite' : 'AgentChannels.toolsRiskRead')}</p>
            <Info text={[t('AgentChannels.toolsRiskInstructions'), t('AgentChannels.toolsRiskShown'), t('AgentChannels.toolsRiskSecret')].join(' ')} />
          </div>
          <div className="agent-channel-needs">
            <p className="squad-block-hint muted">{t('AgentChannels.toolsScopesShort', { count: scopes.length })}</p>
            <Info text={t('AgentChannels.toolsScopes', { count: scopes.length })} />
            <CopyButton text={JSON.stringify({ scopes: { tenant: scopes, user: [] } }, null, 2)} label={t('AgentChannels.copyScopes')}>{t('AgentChannels.copyScopes')}</CopyButton>
          </div>
          {writes && <div className="agent-channel-grid">
            <div className="squad-field">
              <span className="agent-channel-option"><label htmlFor={`${formId}-doc`}>{t('AgentChannels.docLocation')}</label><Info text={t('AgentChannels.docLocationHint')} /></span>
              <select className="input" aria-label={t('AgentChannels.docLocationKind')} value={draft.docKind} onChange={(event) => setDraft({ ...draft, docKind: event.target.value === 'wikiSpace' || event.target.value === 'folder' ? event.target.value : 'wikiNode' })}>
                <option value="wikiNode">{t('AgentChannels.docWikiNode')}</option>
                <option value="wikiSpace">{t('AgentChannels.docWikiSpace')}</option>
                <option value="folder">{t('AgentChannels.docFolder')}</option>
              </select>
              <input id={`${formId}-doc`} className="input" spellCheck={false} value={draft.docValue} placeholder={t('AgentChannels.docLocationPlaceholder')} onKeyDown={onEnter} onChange={(event) => setDraft({ ...draft, docValue: event.target.value })} />
            </div>
            <div className="squad-field">
              <label htmlFor={`${formId}-access`}>{t('AgentChannels.docAccess')}</label>
              <select id={`${formId}-access`} className="input" value={draft.docAccess} onChange={(event) => setDraft({ ...draft, docAccess: event.target.value === 'view' || event.target.value === 'none' ? event.target.value : 'edit' })}>
                <option value="edit">{t('AgentChannels.docAccessEdit')}</option>
                <option value="view">{t('AgentChannels.docAccessView')}</option>
                <option value="none">{t('AgentChannels.docAccessNone')}</option>
              </select>
            </div>
          </div>}
        </>
      })()}
    </div>}
    <div className="agent-channel-step">
      {heading(limitsStep, t('AgentChannels.step5'))}
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
