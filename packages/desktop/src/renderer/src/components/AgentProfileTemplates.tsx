import { AGENT_PROFILE_TEMPLATES, type AgentProfileTemplate } from '../agent-profile-templates'
import { t } from '../i18n'
import { BookIcon, BugIcon, FileChangesIcon, PlusIcon, PulseIcon, SearchIcon } from './icons'

const ICONS = { explorer: <SearchIcon />, reviewer: <FileChangesIcon />, debugger: <BugIcon />, tester: <PulseIcon />, planner: <BookIcon /> }

export function AgentProfileTemplates({ onPick, onBlank }: { onPick: (template: AgentProfileTemplate) => void; onBlank: () => void }) {
  return <section className="agent-profile-templates" aria-label={t('AgentTemplates.title')}>
    <ul className="squad-cards">
      {AGENT_PROFILE_TEMPLATES.map((template) => <li key={template.id}>
        <button type="button" className="squad-card agent-template-card" onClick={() => onPick(template)}>
          <span className="squad-card-top"><span className="squad-card-icon" aria-hidden="true">{ICONS[template.id]}</span><span className="squad-card-name">{template.name}</span></span>
          <span className="squad-card-description">{template.description}</span>
          <span className="agent-template-example">{t('AgentTemplates.example', { example: template.example })}</span>
          <span className="squad-card-foot"><span className="squad-card-member">{t(template.capability === 'readOnly' ? 'Squads.readOnlyAnalysis' : 'Squads.developmentTesting')}</span><span className="agent-template-model">{t(template.model === 'quick' ? 'AgentTemplates.quick' : template.model === 'strong' ? 'AgentTemplates.strong' : 'AgentTemplates.balanced')}</span></span>
        </button>
      </li>)}
      <li><button type="button" className="squad-card squad-card-new" onClick={onBlank}><span className="squad-card-plus"><PlusIcon /></span>{t('AgentTemplates.blank')}<span className="squad-card-new-hint">{t('AgentTemplates.blankHint')}</span></button></li>
    </ul>
  </section>
}
