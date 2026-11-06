import { useEffect, useState } from 'react'
import { activatedSkillNames, agentDescriptor, AGENT_KINDS, type AgentKind, type LocalSkillFolder, type SkillRef, type SkillRepo } from '@antumi/protocol'
import { perform } from '../core-store'
import { t } from '../i18n'
import { agentLabel } from '../labels'

// Which of Antumi's skills each agent is given, by name: a skill of the user's own by the same name
// reaches that agent twice.
export function antumiSkillAgents(repos: readonly SkillRepo[], fallback: readonly SkillRef[]): Map<string, Set<AgentKind>> {
  const takers = AGENT_KINDS.filter((kind) => agentDescriptor(kind).capabilities.skills)
  const byName = new Map<string, Set<AgentKind>>()
  for (const repo of repos) {
    const agents = (repo.activation?.agents ?? takers).filter((agent) => takers.includes(agent))
    for (const name of activatedSkillNames(repo, fallback)) {
      const known = byName.get(name) ?? new Set<AgentKind>()
      for (const agent of agents) known.add(agent)
      byName.set(name, known)
    }
  }
  return byName
}

// The skills agents load by themselves from the user's own folders: read here, changed by the user
// in those folders, as Antumi never touches them.
export function LocalSkillsList({ repos, fallback }: { repos: readonly SkillRepo[]; fallback: readonly SkillRef[] }) {
  const [folders, setFolders] = useState<LocalSkillFolder[] | null>(null)
  const [loading, setLoading] = useState(false)
  const load = async () => {
    setLoading(true)
    const found = await perform((rpc) => rpc.call('skills.local', {}))
    setFolders(found ?? [])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  if (folders === null) return <p className="settings-note" role="status">{t('SkillsSettingsSection.localLoading')}</p>
  const antumi = antumiSkillAgents(repos, fallback)
  const total = folders.reduce((sum, folder) => sum + folder.skills.length, 0)
  const twiceFor = (folder: LocalSkillFolder, name: string) => folder.agents.filter((agent) => antumi.get(name)?.has(agent))
  return (
    <>
      <div className="settings-list-toolbar local-skills-toolbar">
        <p className="settings-note">{t('SkillsSettingsSection.localIntro')}</p>
        <button type="button" className="button" disabled={loading} onClick={() => void load()}>{t('SkillsSettingsSection.localRefresh')}</button>
      </div>
      {total === 0 && <p className="settings-note">{t('SkillsSettingsSection.localEmpty')}</p>}
      <ul className="settings-project-list">
        {folders.filter((folder) => folder.skills.length > 0).map((folder) => (
          <li key={folder.dir} className="settings-skill-repo">
            <div className="settings-row-text">
              <div className="settings-entry-title"><strong className="mono" title={folder.dir}>{folder.dir}</strong><span className="settings-state-pill">{t('SkillsSettingsSection.localCount', { count: folder.skills.length })}</span></div>
              <p className="settings-row-description">{t('SkillsSettingsSection.localLoadedBy', { value1: folder.agents.map(agentLabel).join('、') })}</p>
            </div>
            <div className="settings-skill-chips">
              {folder.skills.map((skill) => <span key={skill.dir} className={`settings-skill-chip${twiceFor(folder, skill.name).length ? ' problem' : ''}`} title={skill.description || skill.dir}>{skill.name}</span>)}
            </div>
            {folder.skills.filter((skill) => twiceFor(folder, skill.name).length > 0).map((skill) => (
              <p key={skill.dir} className="settings-note warning">{t('SkillsSettingsSection.localSameName', { value1: skill.name, value2: twiceFor(folder, skill.name).map(agentLabel).join('、') })}</p>
            ))}
          </li>
        ))}
      </ul>
    </>
  )
}
