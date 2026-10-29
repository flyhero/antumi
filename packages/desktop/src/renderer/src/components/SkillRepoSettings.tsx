import { useEffect, useId, useState } from 'react'
import { activatedSkillNames, type SkillRef, type SkillRepo, type SkillUpdateCheck } from '@antumi/protocol'
import { perform } from '../core-store'
import { t, tr } from '../i18n'
import { Toggle } from './SettingsControls'
import { agentLabel } from '../labels'

const short = (commit: string) => commit.slice(0, 7)

export function SkillRepoSettings({ repo, managed, fallback, onConfigure }: { repo: SkillRepo; managed: boolean; fallback: readonly SkillRef[]; onConfigure: () => void }) {
  const [busy, setBusy] = useState(false)
  const [readme, setReadme] = useState<string | null>(null)
  const [check, setCheck] = useState<SkillUpdateCheck | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const id = useId()
  const selected = activatedSkillNames(repo, fallback)
  const unavailable = check ? selected.filter((name) => !check.skills.some((skill) => skill.name === name && skill.problem === null)) : []
  useEffect(() => { setCheck(null); setAcknowledged(false) }, [repo.commit, repo.activation])
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try { await action() } finally { setBusy(false) }
  }
  const inspect = () => run(async () => {
    setAcknowledged(false)
    setCheck(await perform((rpc) => rpc.call('skills.checkUpdate', { id: repo.id })))
  })
  const toggle = (name: string, enabled: boolean) => run(() => perform((rpc) => rpc.call('skills.setActivation', { id: repo.id, activation: { mode: 'selected', skills: enabled ? [...selected, name] : selected.filter((each) => each !== name), agents: repo.activation?.agents ?? null } })))
  return <li className="settings-skill-repo">
    <div className="skill-library-overview">
      <div className="settings-row-text">
        <div className="settings-entry-title"><strong>{repo.plugin?.name ?? repo.id}</strong>{managed && <span className="settings-state-pill">{t('SkillsSettingsSection.enabledCount', { count: selected.length, total: repo.skills.length })}</span>}</div>
        <p className="skill-library-url mono" title={repo.url}>{repo.url}</p>
        {managed && <p className="settings-row-description">{repo.activation ? repo.activation.agents === null ? t('SkillsSettingsSection.allCompatibleAgents') : repo.activation.agents.length ? t('McpSettingsSection.sharedWith', { value1: repo.activation.agents.map(agentLabel).join('、') }) : t('McpSettingsSection.notSharedWithAnyAgent') : t('SkillsSettingsSection.legacyActivation')}</p>}
      </div>
      {managed && <button type="button" className="button" disabled={busy} onClick={onConfigure}>{t('SkillsSettingsSection.configure')}</button>}
    </div>
    <details className="skill-repo-details">
      <summary><span>{t('SkillsSettingsSection.detailsAndMaintenance')}</span><span className="mono muted" title={repo.commit}>{short(repo.commit)}</span></summary>
      <div className="settings-project">
        <button type="button" className="button" disabled={busy} onClick={() => void run(async () => { if (readme !== null) { setReadme(null); return } const found = await perform((rpc) => rpc.call('skills.readme', { id: repo.id })); setReadme(found?.text ?? t('SkillsSettingsSection.noReadme')) })}>{readme === null ? t('ChatCommandSettings.description') : t('ChatPlan.collapse')}</button>
        <button type="button" className="button" disabled={busy} onClick={() => void inspect()}>{t('SkillsSettingsSection.checkForUpdates')}</button>
        {repo.previousCommit && <button type="button" className="button" disabled={busy} onClick={() => void run(() => perform((rpc) => rpc.call('skills.rollback', { id: repo.id })))}>{tr('SkillsSettingsSection.rollBackTo', { value1: short(repo.previousCommit) })}</button>}
        <button type="button" className="button" disabled={busy} onClick={() => void run(async () => { if (window.confirm(t('SkillsSettingsSection.removeAgentsUsingItLoseTheseSkillsAt', { value1: repo.plugin?.name ?? repo.id }))) await perform((rpc) => rpc.call('skills.remove', { id: repo.id })) })}>{t('ChatQuoteCards.remove')}</button>
      </div>
      {managed ? <>
        <p className="settings-note">{repo.activation ? `${repo.activation.mode === 'all' ? t('SkillsSettingsSection.enableAll') : t('SkillsSettingsSection.selectSkills')} · ${repo.activation.agents === null ? t('SkillsSettingsSection.allCompatibleAgents') : t('SkillsSettingsSection.specificAgentCount', { count: repo.activation.agents.length })}` : t('SkillsSettingsSection.legacyActivation')}</p>
        <div className="skill-repo-skills">{repo.skills.map((skill, index) => <div className="skill-selection-row" key={skill.dir}>
          <Toggle labelId={`${id}-${index}`} checked={selected.includes(skill.name)} disabled={busy || skill.problem !== null || repo.activation?.mode === 'all'} onChange={(enabled) => void toggle(skill.name, enabled)} />
          <div><div id={`${id}-${index}`} className="skill-selection-name">{skill.name}</div><div className="skill-selection-description">{skill.problem ?? skill.description}</div></div>
        </div>)}</div>
      </> : <div className="settings-skill-chips">{repo.skills.map((skill) => <span key={skill.dir} className={`settings-skill-chip${skill.problem ? ' problem' : ''}`} title={skill.problem ?? skill.description}>{skill.name}</span>)}</div>}
      {check && <section className="skill-update-preview" aria-label={t('SkillsSettingsSection.updatePreview')}>
        {check.latest === check.current ? <p className="settings-note">{t('SkillsSettingsSection.alreadyUpToDate')}</p> : <>
          <p className="settings-note mono">{short(check.current)} → {short(check.latest)}</p>
          {check.changes ? <ul className="skill-update-changes">{check.changes.map((change) => <li key={`${change.kind}:${change.name}`}><span className={`skill-change-kind ${change.kind}`}>{change.kind === 'added' ? t('SkillsSettingsSection.added') : change.kind === 'removed' ? t('SkillsSettingsSection.removed') : t('SkillsSettingsSection.changed')}</span>{change.name}</li>)}</ul> : <p className="settings-note">{check.skills.map((skill) => skill.name).join('、')}</p>}
          {managed && <p className="settings-note">{repo.activation?.mode === 'all' ? t('SkillsSettingsSection.updateAllHint') : t('SkillsSettingsSection.updateSelectedHint')}</p>}
          {managed && unavailable.length > 0 && <label className="skill-update-confirmation"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />{t('SkillsSettingsSection.confirmUnavailable', { names: unavailable.join('、') })}</label>}
          <div className="skill-selection-actions"><button type="button" className="button primary" disabled={busy || (managed && unavailable.length > 0 && !acknowledged) || !check.skills.some((skill) => skill.problem === null)} onClick={() => void run(() => perform((rpc) => rpc.call('skills.update', { id: repo.id, commit: check.latest, ...(managed ? { allowUnavailable: acknowledged } : {}) })))}>{t('SettingsPage.update')}</button><button type="button" className="button ghost" disabled={busy} onClick={() => setCheck(null)}>{t('ChatCommandSettings.cancel')}</button></div>
        </>}
      </section>}
      {readme !== null && <pre className="settings-skill-readme">{readme}</pre>}
    </details>
  </li>
}
