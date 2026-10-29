import { useEffect, useId, useRef } from 'react'
import { AGENT_PROFILE_TEMPLATES, type AgentProfileTemplate } from '../agent-profile-templates'
import { useOccludesBrowser } from '../browser-occlusion'
import { openConversationDraft } from '../core-store'
import { t } from '../i18n'
import { BookIcon, BugIcon, CloseIcon, FileChangesIcon, PlusIcon, PulseIcon, SearchIcon } from './icons'

const ICONS = { explorer: <SearchIcon />, reviewer: <FileChangesIcon />, debugger: <BugIcon />, tester: <PulseIcon />, planner: <BookIcon /> }

export function AgentProfileTemplatesDialog({ onPick, onBlank, onClose }: { onPick: (template: AgentProfileTemplate) => void; onBlank: () => void; onClose: () => void }) {
  useOccludesBrowser()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  // Close before mounting the editor so its name field can receive focus outside the modal.
  const choose = (action: () => void) => { dialog.current?.close(); action() }
  const dismiss = () => choose(onClose)
  return <dialog ref={dialog} className="modal agent-template-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={(event) => { event.preventDefault(); dismiss() }}
    onClick={(event) => { if (event.target === event.currentTarget) dismiss() }}>
    <div className="modal-body">
      <header className="modal-header"><h2 id={titleId}>{t('AgentTemplates.title')}</h2><button type="button" className="icon-button modal-close" aria-label={t('BackdropPicker.close')} onClick={dismiss}><CloseIcon /></button></header>
      <p id={descriptionId} className="agent-template-dialog-description muted">{t('AgentTemplates.chooseHint')}<br />{t('AgentProfiles.createWithAgentHint')}<button type="button" className="link-button" onClick={() => choose(() => { onClose(); openConversationDraft() })}>{t('AgentsPageHeader.openNewConversation')}</button></p>
      <section className="agent-profile-templates" aria-label={t('AgentTemplates.title')}>
        <ul className="squad-cards">
          {AGENT_PROFILE_TEMPLATES.map((template) => <li key={template.id}>
            <button type="button" className="squad-card agent-template-card" onClick={() => choose(() => onPick(template))}>
              <span className="squad-card-top"><span className="squad-card-icon" aria-hidden="true">{ICONS[template.id]}</span><span className="squad-card-name">{template.name}</span></span>
              <span className="squad-card-description">{template.description}</span>
              <span className="agent-template-example">{t('AgentTemplates.example', { example: template.example })}</span>
              <span className="squad-card-foot"><span className="squad-card-member">{t(template.capability === 'readOnly' ? 'Squads.readOnlyAnalysis' : 'Squads.developmentTesting')}</span><span className="agent-template-model">{t(template.model === 'quick' ? 'AgentTemplates.quick' : template.model === 'strong' ? 'AgentTemplates.strong' : 'AgentTemplates.balanced')}</span></span>
            </button>
          </li>)}
          <li><button type="button" className="squad-card squad-card-new" onClick={() => choose(onBlank)}><span className="squad-card-plus"><PlusIcon /></span>{t('AgentTemplates.blank')}<span className="squad-card-new-hint">{t('AgentTemplates.blankHint')}</span></button></li>
        </ul>
      </section>
    </div>
  </dialog>
}
