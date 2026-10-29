import { localized, t, tr } from '../i18n'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { AGENT_KINDS, agentDescriptor, McpServerName, type AgentKind, type McpImportCandidate, type McpProbe, type McpServer, type McpServerInput } from '@antumi/protocol'
import { perform, useCore } from '../core-store'
import { agentLabel } from '../labels'
import { Segmented, SettingsGroup, Toggle } from './SettingsControls'
import { SettingsEmptyState } from './SettingsEmptyState'
import { PlugIcon } from './icons'

// The agents a server can be handed to, as their descriptors say.
const TAKERS = AGENT_KINDS.filter((kind) => agentDescriptor(kind).capabilities.userMcp)

type Secret = { key: string; value: string; stored: boolean }
type Draft = {
  previousName: string | null
  name: string
  enabled: boolean
  agents: AgentKind[]
  type: 'stdio' | 'http'
  command: string
  args: string
  cwd: string
  url: string
  secrets: Secret[]
}

const NEW_DRAFT: Draft = { previousName: null, name: '', enabled: true, agents: [...TAKERS], type: 'stdio', command: '', args: '', cwd: '', url: '', secrets: [] }

function draftOf(server: McpServer): Draft {
  const { transport } = server
  const keys = transport.type === 'stdio' ? transport.envKeys : transport.headerKeys
  return {
    previousName: server.name,
    name: server.name,
    enabled: server.enabled,
    agents: [...server.agents],
    type: transport.type,
    command: transport.type === 'stdio' ? transport.command : '',
    args: transport.type === 'stdio' ? transport.args.join('\n') : '',
    cwd: transport.type === 'stdio' ? transport.cwd ?? '' : '',
    url: transport.type === 'http' ? transport.url : '',
    secrets: keys.map((key) => ({ key, value: '', stored: true }))
  }
}

// A stored value left blank is kept; a new key needs one.
function inputOf(draft: Draft): McpServerInput {
  const secrets = draft.secrets.filter((secret) => secret.key.trim()).map((secret) => ({ key: secret.key.trim(), value: secret.stored && !secret.value ? null : secret.value }))
  const base = { name: draft.name.trim(), previousName: draft.previousName, enabled: draft.enabled, agents: draft.agents }
  return draft.type === 'stdio'
    ? { ...base, transport: { type: 'stdio', command: draft.command.trim(), args: draft.args.split('\n').map((arg) => arg.trim()).filter(Boolean), cwd: draft.cwd.trim() || null, env: secrets } }
    : { ...base, transport: { type: 'http', url: draft.url.trim(), headers: secrets } }
}

// One server from JSON as the agents write theirs: { "mcpServers": { name: {...} } }, or the entry alone.
function draftFromJson(text: string, current: Draft): Draft | string {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return t('McpSettingsSection.invalidJson') }
  if (!parsed || typeof parsed !== 'object') return t('McpSettingsSection.invalidJson')
  const servers = 'mcpServers' in parsed && parsed.mcpServers && typeof parsed.mcpServers === 'object' ? Object.entries(parsed.mcpServers) : [[current.name, parsed] as const]
  const [name, entry] = servers[0] ?? []
  if (!entry || typeof entry !== 'object') return t('McpSettingsSection.noServersFound')
  const field = (key: string): unknown => (key in entry ? Reflect.get(entry, key) : undefined)
  const strings = (value: unknown): Record<string, string> => (value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter((pair): pair is [string, string] => typeof pair[1] === 'string')) : {})
  const command = field('command')
  const url = field('url')
  const args = field('args')
  const cwd = field('cwd')
  const values = strings(typeof command === 'string' ? field('env') : field('headers'))
  if (typeof command !== 'string' && typeof url !== 'string') return t('McpSettingsSection.neitherCommandNorUrlSpecified')
  return {
    ...current,
    name: typeof name === 'string' && name ? name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 32) : current.name,
    type: typeof command === 'string' ? 'stdio' : 'http',
    command: typeof command === 'string' ? command : '',
    args: Array.isArray(args) ? args.filter((arg) => typeof arg === 'string').join('\n') : '',
    cwd: typeof cwd === 'string' ? cwd : '',
    url: typeof url === 'string' ? url : '',
    secrets: Object.entries(values).map(([key, value]) => ({ key, value, stored: false }))
  }
}

function AgentChoices({ value, onChange, disabled = [] }: { value: readonly AgentKind[]; onChange: (agents: AgentKind[]) => void; disabled?: readonly AgentKind[] }) {
  return (
    <span className="mcp-agents">
      {TAKERS.map((kind) => (
        <label key={kind} className="mcp-agent">
          <input type="checkbox" checked={value.includes(kind) && !disabled.includes(kind)} disabled={disabled.includes(kind)}
            onChange={(event) => onChange(event.target.checked ? [...value, kind] : value.filter((each) => each !== kind))} />
          {agentLabel(kind)}
        </label>
      ))}
    </span>
  )
}

function ServerForm({ initial, onDone }: { initial: Draft; onDone: (saved: string | null) => void }) {
  const [draft, setDraft] = useState(initial)
  const [json, setJson] = useState<string | null>(null)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const typeId = useId()
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }))
  const setSecret = (index: number, patch: Partial<Secret>) => set({ secrets: draft.secrets.map((secret, at) => (at === index ? { ...secret, ...patch } : secret)) })
  const badName = draft.name.trim().length > 0 && !McpServerName.safeParse(draft.name.trim()).success
  const ready = McpServerName.safeParse(draft.name.trim()).success && (draft.type === 'stdio' ? draft.command.trim() : draft.url.trim()) && draft.secrets.every((secret) => !secret.key.trim() || secret.stored || secret.value)

  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!ready || saving) return
    setSaving(true)
    const saved = await perform((rpc) => rpc.call('mcpServers.save', inputOf(draft)))
    setSaving(false)
    if (saved) onDone(saved.name)
  }
  const fill = () => {
    const filled = draftFromJson(json ?? '', draft)
    if (typeof filled === 'string') { setJsonError(filled); return }
    setDraft(filled)
    setJson(null)
    setJsonError(null)
  }
  const what = draft.type === 'stdio' ? t('McpSettingsSection.environmentVariables') : t('McpSettingsSection.requestHeaders')

  return (
    <SettingsGroup title={initial.previousName ? t('McpSettingsSection.editServer', { name: initial.previousName }) : t('McpSettingsSection.addServer')}>
      <form className="chat-command-form" onSubmit={(event) => void save(event)}>
      {json === null ? (
        <button type="button" className="button ghost mcp-json-toggle" onClick={() => setJson('')}>{t('McpSettingsSection.pasteJsonToFillFields')}</button>
      ) : (
        <label className="chat-command-field">
          <span>JSON</span>
          <textarea className="input mono chat-command-prompt" rows={6} value={json} onChange={(event) => setJson(event.target.value)} spellCheck={false} autoFocus
            placeholder={'{ "mcpServers": { "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": { "GITHUB_TOKEN": "…" } } } }'} />
          {jsonError && <span className="chat-command-hint warning">{jsonError}</span>}
          <span className="chat-command-actions">
            <button type="button" className="button ghost" onClick={() => { setJson(null); setJsonError(null) }}>{t('ChatCommandSettings.cancel')}</button>
            <button type="button" className="button" onClick={fill}>{t('McpSettingsSection.fill')}</button>
          </span>
        </label>
      )}
      <label className="chat-command-field">
        <span>{t('ChatCommandSettings.name')}</span>
        <input className="input mono" value={draft.name} onChange={(event) => set({ name: event.target.value })} placeholder="github" maxLength={32} spellCheck={false} autoFocus={json === null} aria-invalid={badName} />
        <span className="chat-command-hint">{badName ? t('McpSettingsSection.useLowercaseLettersNumbersStartingWithALetter') : t('McpSettingsSection.agentToolNamesIncludeThisNameEG')}</span>
      </label>
      <div className="chat-command-field">
        <span id={typeId}>{t('McpSettingsSection.type')}</span>
        <Segmented labelId={typeId} value={draft.type} options={[{ value: 'stdio', label: t('McpSettingsSection.localCommand') }, { value: 'http', label: t('McpSettingsSection.remoteUrl') }]} onChange={(type) => set({ type, secrets: [] })} />
      </div>
      {draft.type === 'stdio' ? (
        <>
          <label className="chat-command-field">
            <span>{t('chatTools.command')}</span>
            <input className="input mono" value={draft.command} onChange={(event) => set({ command: event.target.value })} placeholder="npx" spellCheck={false} />
          </label>
          <label className="chat-command-field">
            <span>{t('chatCommands.arguments')}</span>
            <textarea className="input mono mcp-args" rows={3} value={draft.args} onChange={(event) => set({ args: event.target.value })} placeholder={'-y\n@modelcontextprotocol/server-github'} spellCheck={false} />
            <span className="chat-command-hint">{t('McpSettingsSection.onePerLinePassedDirectlyWithoutAShell')}</span>
          </label>
          <label className="chat-command-field">
            <span>{t('McpSettingsSection.workingDirectory')}</span>
            <input className="input mono" value={draft.cwd} onChange={(event) => set({ cwd: event.target.value })} placeholder={t('McpSettingsSection.optionalAbsolutePathDefaultsToTheConversationS')} spellCheck={false} />
          </label>
        </>
      ) : (
        <label className="chat-command-field">
          <span>{t('BrowserPanel.address')}</span>
          <input className="input mono" value={draft.url} onChange={(event) => set({ url: event.target.value })} placeholder="https://mcp.example.com/mcp" spellCheck={false} />
          <span className="chat-command-hint">{t('McpSettingsSection.streamableHttpHttpIsAllowedOnlyForLocalhost')}</span>
        </label>
      )}
      <div className="chat-command-field">
        <span>{what}</span>
        {draft.secrets.map((secret, index) => (
          <span key={index} className="mcp-secret">
            <input className="input mono" value={secret.key} disabled={secret.stored} onChange={(event) => setSecret(index, { key: event.target.value })} placeholder={draft.type === 'stdio' ? 'GITHUB_TOKEN' : 'Authorization'} spellCheck={false} aria-label={t('McpSettingsSection.name', { what: what })} />
            <input className="input mono" type="password" autoComplete="new-password" value={secret.value} onChange={(event) => setSecret(index, { value: event.target.value })} placeholder={secret.stored ? t('McpSettingsSection.alreadySetLeaveEmptyToKeep') : t('McpSettingsSection.value')} aria-label={t('McpSettingsSection.valueFor', { value1: secret.key || what })} />
            <button type="button" className="button ghost" onClick={() => set({ secrets: draft.secrets.filter((_, at) => at !== index) })}>{t('ChatQuoteCards.remove')}</button>
          </span>
        ))}
        <span><button type="button" className="button ghost" onClick={() => set({ secrets: [...draft.secrets, { key: '', value: '', stored: false }] })}>{tr('McpSettingsSection.add', { what: what })}</button></span>
        <span className="chat-command-hint">{t('McpSettingsSection.valuesAreStoredOnlyInAntumiSLocal')}</span>
      </div>
      <div className="chat-command-field">
        <span>{t('McpSettingsSection.shareWithAgents')}</span>
        <AgentChoices value={draft.agents} onChange={(agents) => set({ agents })} />
      </div>
      <div className="chat-command-actions">
        <button type="button" className="button ghost" onClick={() => onDone(null)}>{t('ChatCommandSettings.cancel')}</button>
        <button type="submit" className="button primary" disabled={!ready || saving}>{saving ? t('McpSettingsSection.saving') : t('McpSettingsSection.saveAndTest')}</button>
      </div>
      </form>
    </SettingsGroup>
  )
}

function ProbeResult({ probe }: { probe: McpProbe | 'running' | 'unavailable' }) {
  const [open, setOpen] = useState(false)
  if (probe === 'unavailable') return <p className="settings-status warning" role="status">{t('McpSettingsSection.probeUnavailable')}</p>
  if (probe === 'running') return <p className="settings-status" role="status">{t('McpSettingsSection.connectingFirstUseOfNpxUvxMayRequire')}</p>
  if (!probe.ok) {
    return (
      <div className="mcp-probe" data-ok="false">
        <p className="settings-status" role="status">{tr('McpSettingsSection.connectionFailed', { value1: probe.error })}</p>
        {probe.stderr && <pre className="mcp-probe-output">{probe.stderr}</pre>}
      </div>
    )
  }
  return (
    <div className="mcp-probe" data-ok="true">
      <p className="settings-note">{tr('McpSettingsSection.connectedTools', { value1: probe.tools.length, value2: probe.tools.length > 0 && <button type="button" className="button ghost" onClick={() => setOpen(!open)}>{open ? t('ChatPlan.collapse') : t('EnvironmentNotice.view')}</button> })}</p>
      {open && (
        <ul className="mcp-tools">
          {probe.tools.map((tool) => <li key={tool.name}><span className="mono">{tool.name}</span>{tool.description && <span className="muted"> {tool.description}</span>}</li>)}
        </ul>
      )}
    </div>
  )
}

function summary(server: McpServer): string {
  const { transport } = server
  return transport.type === 'stdio' ? [transport.command, ...transport.args].join(' ') : transport.url
}

function ServerRow({ server, probe, onProbe, onEdit }: { server: McpServer; probe: McpProbe | 'running' | 'unavailable' | undefined; onProbe: () => void; onEdit: () => void }) {
  const labelId = useId()
  const [removing, setRemoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const keys = server.transport.type === 'stdio' ? server.transport.envKeys : server.transport.headerKeys
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    try { await action() } finally { setBusy(false) }
  }
  return (
    <article className="mcp-server-entry">
      <div className="settings-row">
        <div className="settings-row-text">
          <div className="settings-entry-title"><span id={labelId} className="settings-row-label mono">{server.name}</span>
            <span className="settings-state-pill">{server.transport.type === 'stdio' ? t('McpSettingsSection.localCommand') : t('McpSettingsSection.remoteUrl')}</span>
            <span className="settings-state-pill">{server.enabled ? t('McpSettingsSection.enabled') : t('McpSettingsSection.disabled')}</span>
          </div>
          <p className="settings-row-description mono mcp-summary" title={summary(server)}>{summary(server)}</p>
          <p className="settings-row-description">
            {server.agents.length ? t('McpSettingsSection.sharedWith', { value1: server.agents.map(agentLabel).join('、') }) : t('McpSettingsSection.notSharedWithAnyAgent')}
            {keys.length > 0 && ` · ${server.transport.type === 'stdio' ? t('McpSettingsSection.environmentVariables') : t('McpSettingsSection.requestHeaders')} ${keys.join('、')}`}
          </p>
        </div>
        <Toggle labelId={labelId} checked={server.enabled} disabled={busy} onChange={(enabled) => void run(() => perform((rpc) => rpc.call('mcpServers.setEnabled', { name: server.name, enabled })))} />
      </div>
      <div className="mcp-server-feedback">
      {probe ? <ProbeResult probe={probe} /> : <p className="settings-note">{t('McpSettingsSection.notTested')}</p>}
      <div className="settings-inline-actions">
        <button type="button" className="button" disabled={busy || probe === 'running'} onClick={onProbe}>{t('McpSettingsSection.testConnection')}</button>
        <button type="button" className="button" disabled={busy} onClick={onEdit}>{t('chatTools.edit')}</button>
        <button type="button" className="button ghost" disabled={busy} onClick={() => setRemoving(true)}>{t('ChatCommandSettings.delete')}</button>
      </div></div>
      {removing && <div className="account-remove-confirm">
            <span className="settings-note">{t('McpSettingsSection.afterDeletionAgentsLoseTheseToolsAtTheir')}</span>
            <button type="button" className="button" disabled={busy} onClick={() => void run(() => perform((rpc) => rpc.call('mcpServers.remove', { name: server.name })))}>{t('McpSettingsSection.confirmDeletion')}</button>
            <button type="button" className="button ghost" onClick={() => setRemoving(false)}>{t('ChatCommandSettings.cancel')}</button>
      </div>}
    </article>
  )
}

const SOURCE_TEXT: Record<AgentKind, string> = localized(() => ({ claude: '~/.claude.json', codex: t('McpSettingsSection.codexConfigToml'), cursor: '~/.cursor/mcp.json', opencode: 'opencode.json', pi: '~/.pi/agent/mcp.json', dsh: '~/.dsh/profiles/antumi/cordis.patch.yml', antigravity: '~/.gemini/config/mcp_config.json', zcode: '~/.zcode/cli/config.json', kimi: '~/.kimi-code/mcp.json', gemini: '~/.gemini/settings.json' }))

// Servers the agents have in their own configuration, taken in under names the user can change.
// Each goes to the chosen agents but the one it came from, which loads it already.
function ImportPanel({ onDone }: { onDone: (imported: string[]) => void }) {
  const [candidates, setCandidates] = useState<McpImportCandidate[] | null>(null)
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [agents, setAgents] = useState<AgentKind[]>([...TAKERS])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const load = async () => {
    setFailed(false)
    setCandidates(null)
    const found = await perform((rpc) => rpc.call('mcpServers.importable', {}))
    if (found) setCandidates(found)
    else setFailed(true)
  }
  useEffect(() => { void load() }, [])
  const keyOf = (candidate: McpImportCandidate) => `${candidate.source}/${candidate.name}`
  const picked = (candidates ?? []).filter((candidate) => keyOf(candidate) in chosen)
  const valid = picked.length > 0 && picked.every((candidate) => McpServerName.safeParse(chosen[keyOf(candidate)]).success)

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    const imported: string[] = []
    try {
      for (const source of TAKERS) {
        const items = picked.filter((candidate) => candidate.source === source).map((candidate) => ({ source, name: candidate.name, as: chosen[keyOf(candidate)] ?? '' }))
        if (!items.length) continue
        const saved = await perform((rpc) => rpc.call('mcpServers.import', { items, agents: agents.filter((agent) => agent !== source) }))
        if (!saved) return
        imported.push(...saved.map((server) => server.name))
      }
      onDone(imported)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsGroup title={t('McpSettingsSection.importFromClaudeCodexCursor')}>
    <div className="chat-command-form">
      {failed ? <div className="settings-loading" role="status"><p>{t('McpSettingsSection.importFailed')}</p><button type="button" className="button" onClick={() => void load()}>{t('AppUpdate.retry')}</button></div> : candidates === null ? <p className="settings-empty" role="status">{t('McpSettingsSection.readingAgentConfigurations')}</p> : candidates.length === 0 ? <SettingsEmptyState icon={<PlugIcon />} title={t('McpSettingsSection.noImportTitle')} actions={<button type="button" className="button" onClick={() => void load()}>{t('AppUpdate.retry')}</button>}>{t('McpSettingsSection.noMcpServersInAnyAgentSUser')}</SettingsEmptyState> : (
        <ul className="settings-project-list">
          {candidates.map((candidate) => {
            const key = keyOf(candidate)
            const on = key in chosen
            const blocked = candidate.problem ?? (candidate.suggestedName ? null : t('McpSettingsSection.aServerWithThisNameAlreadyExistsIn'))
            return (
              <li key={key} className="settings-project mcp-candidate">
                <input type="checkbox" checked={on} disabled={Boolean(candidate.problem) || busy} aria-label={t('McpSettingsSection.import', { value1: candidate.name })}
                  onChange={(event) => setChosen((current) => {
                    const { [key]: _dropped, ...rest } = current
                    return event.target.checked ? { ...rest, [key]: candidate.suggestedName ?? '' } : rest
                  })} />
                <span className="settings-project-name mono">{candidate.name}</span>
                <span className="muted">{SOURCE_TEXT[candidate.source]}</span>
                <span className="settings-project-path mono" title={candidate.transport.type === 'stdio' ? candidate.transport.command : candidate.transport.url}>
                  {candidate.transport.type === 'stdio' ? [candidate.transport.command, ...candidate.transport.args].join(' ') : candidate.transport.url}
                </span>
                {on && <input className="input mono mcp-candidate-name" value={chosen[key] ?? ''} aria-label={t('McpSettingsSection.nameForInAntumi', { value1: candidate.name })} onChange={(event) => setChosen((current) => ({ ...current, [key]: event.target.value }))} spellCheck={false} />}
                {blocked && !on && <span className="settings-note warning">{blocked}</span>}
              </li>
            )
          })}
        </ul>
      )}
      {candidates && candidates.length > 0 && (
        <div className="chat-command-field">
          <span>{t('McpSettingsSection.shareWithAgents')}</span>
          <AgentChoices value={agents} onChange={setAgents} />
          <span className="chat-command-hint">{t('McpSettingsSection.notSharedBackToItsOriginalAgentIt')}</span>
        </div>
      )}
      <div className="chat-command-actions">
        <button type="button" className="button ghost" onClick={() => onDone([])}>{t('ChatCommandSettings.cancel')}</button>
        {candidates && candidates.length > 0 && <button type="button" className="button primary" disabled={!valid || busy} onClick={() => void submit()}>{busy ? t('McpSettingsSection.importing') : t('McpSettingsSection.import_1237', { value1: picked.length })}</button>}
      </div>
    </div>
    </SettingsGroup>
  )
}

// The user's MCP servers: handed at each start to the agents picked for each, beside Antumi's own,
// with nothing written into the agents' own configuration.
export function McpSettingsSection() {
  const connected = useCore((s) => s.connection === 'connected')
  const servers = useCore((s) => s.mcpServers)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [importing, setImporting] = useState(false)
  const [probes, setProbes] = useState<Record<string, { updatedAt: number; result: McpProbe | 'running' | 'unavailable' }>>({})

  const probe = async (name: string) => {
    const server = useCore.getState().mcpServers.find((each) => each.name === name)
    if (!server) return
    const updatedAt = server.updatedAt
    setProbes((current) => ({ ...current, [name]: { updatedAt, result: 'running' } }))
    const result = await perform((rpc) => rpc.call('mcpServers.probe', { name }))
    setProbes((current) => current[name]?.updatedAt === updatedAt ? { ...current, [name]: { updatedAt, result: result ?? 'unavailable' } } : current)
  }

  if (!connected) return <p className="settings-empty">{t('ChatCommandSettings.connectToAntumiCoreToView')}</p>
  if (draft) return <ServerForm key={draft.previousName ?? 'new'} initial={draft} onDone={(saved) => { setDraft(null); if (saved) void probe(saved) }} />
  if (importing) return <ImportPanel onDone={(imported) => { setImporting(false); imported.forEach((name) => void probe(name)) }} />
  return (
    <>
      {servers.length === 0 ? <SettingsEmptyState icon={<PlugIcon />} title={t('McpSettingsSection.emptyTitle')} actions={<>
        <button type="button" className="button primary" onClick={() => setDraft(NEW_DRAFT)}>{t('McpSettingsSection.addServer')}</button>
        <button type="button" className="button" onClick={() => setImporting(true)}>{t('McpSettingsSection.importFromClaudeCodexCursor')}</button>
      </>}>{t('McpSettingsSection.emptyHint')}</SettingsEmptyState> : <>
      <div className="settings-list-toolbar"><span className="settings-list-count">{t('McpSettingsSection.serverCount', { count: servers.length, enabled: servers.filter((server) => server.enabled).length })}</span><div className="settings-inline-actions">
        <button type="button" className="button" onClick={() => setImporting(true)}>{t('McpSettingsSection.importFromClaudeCodexCursor')}</button>
        <button type="button" className="button primary" onClick={() => setDraft(NEW_DRAFT)}>{t('McpSettingsSection.addServer')}</button>
      </div></div>
      <SettingsGroup>{servers.map((server) => <ServerRow key={server.name} server={server} probe={probes[server.name]?.updatedAt === server.updatedAt ? probes[server.name]?.result : undefined} onProbe={() => void probe(server.name)} onEdit={() => setDraft(draftOf(server))} />)}</SettingsGroup>
      </>}
      <details className="settings-disclosure" open={servers.length === 0}><summary>{t('McpSettingsSection.sharingHelp')}</summary><p className="settings-note">{t('McpSettingsSection.agentConfigurationsStayUntouchedAndTheirExistingServers')}</p></details>
    </>
  )
}
