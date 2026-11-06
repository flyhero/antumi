import { SourceUpdatesPanel, SourceCommentBadge } from './SourceUpdatesPanel'
import { getLocale, t, tr } from '../i18n'
import { useEffect, useState, type ReactNode } from 'react'
import type { SourceInbox, SourceIssue, Task } from '@antumi/protocol'
import { openConversationDraft, perform, selectConversation, selectTask, setInboxOpen, setInboxTab, setSettingsOpen, useCore, useSourceInvestigateSupported } from '../core-store'
import { defaultAgent } from '../default-agent'
import { sourceProblemText } from '../labels'
import { activeInboxes, inboxKey, inboxTab, investigationProjects, type ActiveInbox } from '../source-inboxes'
import { CloseIcon, GearIcon, InboxIcon, RefreshIcon } from './icons'

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit', hour12: false })

function updatedOn(ms: number): string {
  const date = new Date(ms)
  const day = t('SourceInboxView.monthAndDay', { value1: date.getMonth() + 1, value2: date.getDate() })
  return date.getFullYear() === new Date().getFullYear() ? day : t('SourceInboxView._1782', { value1: date.getFullYear(), day: day })
}

export const settingsSectionOf = (provider: string) => `source-${provider}`

function IssueRow({ issue, name, busy, investigating = false, children }: { issue: SourceIssue; name: string; busy: boolean; investigating?: boolean; children: ReactNode }) {
  return (
    <li className="inbox-row" aria-busy={busy || undefined}>
      <div className="inbox-row-text">
        <div className="inbox-row-meta">
          <a className="inbox-key" href={issue.url} target="_blank" rel="noreferrer" data-tooltip={t('SourceInboxView.openIn', { name: name })} data-tooltip-align="start">
            {issue.key}
          </a>
          {issue.priority && <span className="inbox-priority">{issue.priority}</span>}
          {issue.type && <span>{issue.type}</span>}
          <span className="inbox-status" data-category={issue.statusCategory}>
            {issue.status}
          </span>
          {issue.updatedAt !== null && <span>{tr('SourceInboxView.updated', { value1: updatedOn(issue.updatedAt) })}</span>}
          {issue.conversationId && <SourceCommentBadge target={{ kind: 'conversation', id: issue.conversationId }} />}
          {investigating && <span className="inbox-investigating">{t('SourceInboxView.investigating')}</span>}
        </div>
        <div className="inbox-row-title">{issue.title}</div>
      </div>
      <div className="inbox-row-actions">{children}</div>
    </li>
  )
}

// One tab per inbox. What waits behind the others is out of sight, so each tab carries its count
// and whether its last sync failed.
function InboxTabs({ active, selected }: { active: readonly ActiveInbox[]; selected: string }) {
  return (
    <div className="inbox-tabs" role="tablist" aria-label={t('SourceInboxView.taskSources')}>
      {active.map(({ key, inbox, name }) => (
        <button key={key} type="button" role="tab" aria-selected={key === selected} onClick={() => setInboxTab(key)}>
          {name}
          {inbox.problem && <span className="inbox-tab-alert" role="img" aria-label={t('SourceInboxView.syncFailed')} />}
          {inbox.items.length > 0 && <span className="count">{inbox.items.length}</span>}
        </button>
      ))}
    </div>
  )
}

// One source instance's share of the inbox; each issue becomes a task, is looked into in a
// conversation first, or is set aside. Under tabs, the tabs take the place of its name.
function InboxSection({
  inbox,
  name,
  tabs,
  onImported
}: {
  inbox: SourceInbox
  name: string
  tabs?: ReactNode
  onImported: (task: Task) => void
}) {
  const tasks = useCore((s) => s.tasks)
  const conversations = useCore((s) => s.conversations)
  const investigateSupported = useSourceInvestigateSupported()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [showDismissed, setShowDismissed] = useState(false)
  const target = { provider: inbox.provider, instance: inbox.instance }

  const act = async (key: string, action: () => Promise<unknown>) => {
    setBusyKey(key)
    await action()
    setBusyKey(null)
  }
  const importIssue = (key: string) =>
    act(key, async () => {
      const task = await perform((rpc) => rpc.call('sources.import', { ...target, key, agent: defaultAgent(tasks, conversations) }))
      if (task) {
        onImported(task)
      }
    })
  // The new-conversation page, with the issue on it: the agent, projects and mode are picked there.
  const investigate = (issue: SourceIssue) => openConversationDraft(investigationProjects(inboxKey(inbox)),
    { provider: inbox.provider, instance: inbox.instance, key: issue.key, title: issue.title, url: issue.url, source: name })
  // The conversation looking into it, while it is still here to open.
  const lookedInto = (issue: SourceIssue) => (issue.conversationId && conversations[issue.conversationId] ? issue.conversationId : null)
  const dismiss = (key: string) => act(key, () => perform((rpc) => rpc.call('sources.dismiss', { ...target, key })))
  const restore = (key: string) => act(key, () => perform((rpc) => rpc.call('sources.restore', { ...target, key })))
  const refresh = () => void perform((rpc) => rpc.call('sources.refresh', target))
  const openSettings = () => setSettingsOpen(true, settingsSectionOf(inbox.provider))

  return (
    <section className="inbox-section" aria-label={t('SourceInboxView.inbox', { name: name })}>
      <header className="inbox-section-header">
        {tabs ?? (
          <>
            <h3>{name}</h3>
            <span className="muted">{tr('SourceInboxView.pending', { value1: inbox.items.length })}</span>
          </>
        )}
        <div className="toolbar">
          <span className="muted inbox-synced">
            {inbox.refreshing ? t('SourceInboxView.syncing') : inbox.refreshedAt !== null ? t('SourceInboxView.sync', { value1: clock(inbox.refreshedAt) }) : ''}
          </span>
          <button type="button" className="tool-button" aria-label={t('SourceInboxView.syncNow')} data-tooltip={t('SourceInboxView.syncNow')} aria-busy={inbox.refreshing || undefined} onClick={refresh}>
            <RefreshIcon />
          </button>
          <button type="button" className="tool-button" aria-label={t('SourceInboxView.settings', { name: name })} data-tooltip={t('SourceInboxView.settings', { name: name })} onClick={openSettings}>
            <GearIcon />
          </button>
        </div>
      </header>

      <div className="inbox-section-body" role={tabs ? 'tabpanel' : undefined}>
        {inbox.problem && (
          <p className="inbox-error" role="alert">{tr('SourceInboxView.syncFailed_1794', { value1: sourceProblemText(inbox.problem), value2: <button type="button" className="link-button" onClick={openSettings}>{t('SourceInboxView.checkSettings')}</button> })}</p>
        )}

        {inbox.items.length > 0 ? (
          <ul className="inbox-list">
            {inbox.items.map((issue) => {
              const conversationId = lookedInto(issue)
              return (
              <IssueRow key={issue.key} issue={issue} name={name} busy={busyKey === issue.key} investigating={conversationId !== null}>
                {conversationId && (
                  <button type="button" className="button primary" onClick={() => selectConversation(conversationId)}>{t('SourceInboxView.viewConversation')}</button>
                )}
                <button type="button" className={conversationId ? 'button' : 'button primary'} disabled={busyKey !== null} onClick={() => void importIssue(issue.key)}>{t('SourceInboxView.importTask')}</button>
                {investigateSupported && !conversationId && (
                  <button type="button" className="button" disabled={busyKey !== null} data-tooltip={t('SourceInboxView.openAReadOnlyConversationToInvestigateFix')} onClick={() => investigate(issue)}>{t('SourceInboxView.investigateInChat')}</button>
                )}
                <button type="button" className="button ghost" disabled={busyKey !== null} onClick={() => void dismiss(issue.key)}>{t('SourceInboxView.dismiss')}</button>
              </IssueRow>
              )
            })}
          </ul>
        ) : (
          <p className="inbox-empty">
            {inbox.refreshedAt !== null
              ? t('SourceInboxView.noNewIssuesAllMatchingIssuesHaveBeen')
              : inbox.problem
                ? t('SourceInboxView.issuesAppearHereAfterASuccessfulSync')
                : t('SourceInboxView.runningFirstSync')}
          </p>
        )}

        {inbox.dismissed.length > 0 && (
          <div className="inbox-dismissed">
            <button type="button" className="link-button" aria-expanded={showDismissed} onClick={() => setShowDismissed(!showDismissed)}>{tr('SourceInboxView.dismissed', { value1: showDismissed ? t('ChatPlan.collapse') : t('EnvironmentNotice.view'), value2: inbox.dismissed.length })}</button>
            {showDismissed && (
              <ul className="inbox-list">
                {inbox.dismissed.map((issue) => (
                  <IssueRow key={issue.key} issue={issue} name={name} busy={busyKey === issue.key}>
                    <button type="button" className="button" disabled={busyKey !== null} onClick={() => void restore(issue.key)}>{t('SourceInboxView.restore')}</button>
                  </IssueRow>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

// Every task source that is set up and signed in: one section, or a tab each once there are two.
// A page of its own, opened from the sidebar, so it closes as the overview does.
function InboxHeader() {
  return (
    <header className="worktrees-header">
      <div className="worktrees-heading">
        <h2>{t('InboxEntry.inbox_1125')}</h2>
        <p className="muted">{t('SourceInboxView.issuesSyncedFromTaskSourcesImportAsTasks')}</p>
      </div>
      <button type="button" className="tool-button" aria-label={t('BackdropPicker.close')} data-tooltip={t('BackdropPicker.close')} onClick={() => setInboxOpen(false)}>
        <CloseIcon />
      </button>
    </header>
  )
}

export function SourceInboxView() {
  const sources = useCore((s) => s.sources)
  const inboxes = useCore((s) => s.inboxes)
  const wanted = useCore((s) => s.inboxTab)
  const pluginsSupported = useCore((s) => s.rpc?.features.includes('plugins') ?? false)
  const [imported, setImported] = useState<Task | null>(null)
  const active = activeInboxes(sources, inboxes)
  const tabbed = active.length > 1
  const selected = tabbed ? inboxTab(active, wanted) : null

  // Pin the tab once it is shown, so importing its last issue does not switch to another source.
  useEffect(() => {
    if (selected !== null && selected !== wanted) {
      setInboxTab(selected)
    }
  }, [selected, wanted])

  if (active.length === 0) {
    const first = sources?.[0]
    const installSource = !first && pluginsSupported
    return (
      <section className="worktrees-page inbox-page" aria-label={t('InboxEntry.inbox_1125')}>
        <InboxHeader />
        <div className="inbox-setup">
          <InboxIcon />
          <p>{installSource ? t('SourceInboxView.installASourcePluginFirst') : t('SourceInboxView.noTaskSourceConnectedConfigureASiteAnd')}</p>
          <button type="button" className="button primary" onClick={() => setSettingsOpen(true, first ? settingsSectionOf(first.provider) : installSource ? 'plugins' : null)}>{installSource ? t('PluginSettings.installPlugin') : t('SourceInboxView.goToSettings')}</button>
        </div>
      </section>
    )
  }

  return (
    <section className="worktrees-page inbox-page" aria-label={t('InboxEntry.inbox_1125')}>
      <InboxHeader />
      {imported && (
        <p className="restore-bar" role="status">{tr('SourceInboxView.importedAsTaskChooseItsProjectsNext', { value1: imported.title, value2: <button type="button" className="link-button" onClick={() => selectTask(imported.id)}>{t('SourceInboxView.openTask')}</button> })}</p>
      )}
      {active
        .filter((entry) => !tabbed || entry.key === selected)
        .map(({ key, inbox, name }) => (
          <InboxSection
            key={key}
            inbox={inbox}
            name={name}
            tabs={selected !== null ? <InboxTabs active={active} selected={selected} /> : undefined}
            onImported={setImported}
          />
        ))}
    </section>
  )
}
