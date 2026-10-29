import { t, tr } from '../i18n'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { CHAT_COMMAND_ARGUMENTS, ChatCommandFields, type SavedChatCommand } from '@antumi/protocol'
import { deleteChatCommand, perform, saveChatCommand, useCore } from '../core-store'
import { isShortcut, useShortcutLabel } from '../keyboard-shortcuts'
import { projectName } from './ProjectPicker'
import { SettingsEmptyState } from './SettingsEmptyState'
import { SettingsGroup } from './SettingsControls'
import { TerminalIcon } from './icons'

type Draft = { id?: string; name: string; description: string; prompt: string; projectPath: string | null }

const NEW_DRAFT: Draft = { name: '', description: '', prompt: '', projectPath: null }
const EXAMPLES = [
  { name: 'review', title: 'ChatCommandSettings.reviewTitle', prompt: 'ChatCommandSettings.reviewPrompt' },
  { name: 'summarize', title: 'ChatCommandSettings.summaryTitle', prompt: 'ChatCommandSettings.summaryPrompt' }
] as const

function CommandForm({ draft, projects, onDone }: { draft: Draft; projects: readonly string[]; onDone: () => void }) {
  const submitKey = useShortcutLabel('submit-form')
  const [name, setName] = useState(draft.name)
  const [description, setDescription] = useState(draft.description)
  const [prompt, setPrompt] = useState(draft.prompt)
  const [projectPath, setProjectPath] = useState(draft.projectPath)
  const [saving, setSaving] = useState(false)
  const promptHintId = useId()
  const fields = { name: name.trim().replace(/^\//, ''), description: description.trim(), prompt: prompt.trim(), projectPath }
  const valid = ChatCommandFields.safeParse(fields).success
  const badName = fields.name.length > 0 && !ChatCommandFields.shape.name.safeParse(fields.name).success
  // The folder being edited stays a choice even when it has dropped out of the recent list.
  const choices = projectPath && !projects.includes(projectPath) ? [projectPath, ...projects] : projects

  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    const saved = await saveChatCommand({ id: draft.id, ...fields })
    setSaving(false)
    if (saved) onDone()
  }

  return (
    <form className="chat-command-form" onSubmit={(event) => void save(event)}>
      <label className="chat-command-field">
        <span>{t('ChatCommandSettings.name')}</span>
        <span className="chat-command-name-input">
          <span className="mono muted">/</span>
          <input
            className="input mono"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="fix-test"
            maxLength={41}
            spellCheck={false}
            autoFocus
            aria-invalid={badName}
          />
        </span>
        {badName && <span className="chat-command-hint">{t('ChatCommandSettings.useLettersNumbersStartingWithALetterOr')}</span>}
      </label>
      <label className="chat-command-field">
        <span>{t('ChatCommandSettings.description')}</span>
        <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('ChatCommandSettings.optionalShownInTheCommandList')} maxLength={200} />
      </label>
      <label className="chat-command-field">
        <span>{t('ChatCommandSettings.prompt')}</span>
        <textarea
          className="input chat-command-prompt"
          aria-label={t('ChatCommandSettings.prompt')}
          aria-describedby={promptHintId}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (!event.repeat && isShortcut('submit-form', event.nativeEvent)) { event.preventDefault(); void save() }
          }}
          placeholder={t('ChatCommandSettings.forExampleFindWhyFailedFixItAnd', { CHAT_COMMAND_ARGUMENTS: CHAT_COMMAND_ARGUMENTS })}
          rows={6}
        />
        <span id={promptHintId} className="chat-command-hint">{tr('ChatCommandSettings.expandsIntoTheComposerForEditingBeforeSending', { CHAT_COMMAND_ARGUMENTS: CHAT_COMMAND_ARGUMENTS })}</span>
      </label>
      <label className="chat-command-field">
        <span>{t('ChatCommandSettings.showInConversations')}</span>
        <select className="input" value={projectPath ?? ''} onChange={(event) => setProjectPath(event.target.value || null)}>
          <option value="">{t('ChatCommandSettings.allConversations')}</option>
          {choices.map((project) => (
            <option key={project} value={project}>{tr('ChatCommandSettings.only', { value1: projectName(project), project: project })}</option>
          ))}
        </select>
      </label>
      <div className="chat-command-actions">
        <button type="button" className="button ghost" onClick={onDone}>{t('ChatCommandSettings.cancel')}</button>
        <button type="submit" className="button primary" disabled={!valid || saving}>{tr('ChatCommandSettings.save', { value1: submitKey && <kbd>{submitKey}</kbd> })}</button>
      </div>
    </form>
  )
}

function CommandRow({ command, onEdit }: { command: SavedChatCommand; onEdit: () => void }) {
  const [removing, setRemoving] = useState(false)
  return (
    <li className="command-library-row">
      <div className="command-library-main">
        <div className="command-library-copy">
          <div className="settings-entry-title">
            <strong className="mono">/{command.name}</strong>
            <span className="settings-state-pill" title={command.projectPath ?? undefined}>
              {command.projectPath ? projectName(command.projectPath) : t('ChatCommandSettings.allConversations')}
            </span>
          </div>
          {command.description && <p>{command.description}</p>}
          <p className="command-library-prompt" title={command.prompt}>{command.prompt}</p>
        </div>
        <div className="settings-inline-actions">
          <button type="button" className="button" onClick={onEdit}>{t('chatTools.edit')}</button>
          <button type="button" className="button ghost" onClick={() => setRemoving(true)}>{t('ChatCommandSettings.delete')}</button>
        </div>
      </div>
      {removing && <div className="account-remove-confirm">
        <p>{t('ChatCommandSettings.deleteNamed', { name: command.name })}</p>
        <button type="button" className="button" onClick={() => deleteChatCommand(command.id)}>{t('McpSettingsSection.confirmDeletion')}</button>
        <button type="button" className="button ghost" onClick={() => setRemoving(false)}>{t('ChatCommandSettings.cancel')}</button>
      </div>}
    </li>
  )
}

export function ChatCommandSettings() {
  const connected = useCore((s) => s.connection === 'connected')
  const commands = useCore((s) => s.chatCommands)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [projects, setProjects] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const visible = commands.filter((command) => [command.name, command.description, command.prompt, command.projectPath].some((value) => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))

  useEffect(() => {
    if (connected) void perform((rpc) => rpc.call('projects.recent', {})).then((recent) => setProjects(recent ?? []))
  }, [connected])

  if (!connected) return <p className="settings-empty">{t('ChatCommandSettings.connectToAntumiCoreToView')}</p>
  if (draft) return <SettingsGroup title={draft.id ? t('chatTools.edit') : t('ChatCommandSettings.newCommand')}><CommandForm key={draft.id ?? 'new'} draft={draft} projects={projects} onDone={() => setDraft(null)} /></SettingsGroup>
  return (
    <>
      {commands.length === 0 ? (
        <>
          <SettingsEmptyState icon={<TerminalIcon />} title={t('ChatCommandSettings.emptyTitle')} actions={
            <button type="button" className="button primary" onClick={() => setDraft(NEW_DRAFT)}>{t('ChatCommandSettings.newCommand')}</button>
          }>
            {t('ChatCommandSettings.emptyHint')}
          </SettingsEmptyState>
          <div className="command-starters">
            <h3>{t('ChatCommandSettings.startFromExample')}</h3>
            <p className="settings-note">{t('ChatCommandSettings.exampleHint')}</p>
            {EXAMPLES.map((example) => (
              <button key={example.name} type="button" className="command-starter" onClick={() => setDraft({
                ...NEW_DRAFT, name: example.name, description: t(example.title), prompt: t(example.prompt, { args: CHAT_COMMAND_ARGUMENTS })
              })}>
                <span className="mono">/{example.name}</span><span>{t(example.title)}</span><span>{t('chatTools.edit')}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="settings-list-toolbar">
            <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('ChatCommandSettings.filter')} aria-label={t('ChatCommandSettings.filter')} type="search" />
            <button type="button" className="button primary" onClick={() => setDraft(NEW_DRAFT)}>{t('ChatCommandSettings.newCommand')}</button>
          </div>
          <p className="settings-list-count" role="status">{t('ChatCommandSettings.count', { count: visible.length, total: commands.length })}</p>
          <ul className="settings-project-list">
            {visible.map((command) => <CommandRow key={command.id} command={command} onEdit={() => setDraft(command)} />)}
          </ul>
          {visible.length === 0 && <div className="settings-filter-empty">
            <p>{t('ChatCommandSettings.noMatches')}</p>
            <button type="button" className="button ghost" onClick={() => setQuery('')}>{t('SidebarSearch.clear')}</button>
          </div>}
        </>
      )}
    </>
  )
}
