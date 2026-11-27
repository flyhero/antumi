import { t } from '../i18n'
import { useEffect, useRef } from 'react'
import { useOccludesBrowser } from '../browser-occlusion'
import { useProjectTrust } from '../project-trust'
import { CloseIcon } from './icons'

// Asks before Antumi first runs a project's own commands, and again whenever they change: they
// come from the repo, which the user may not have written.
export function ProjectTrustDialog() {
  const asking = useProjectTrust((state) => state.asking)
  return asking ? <TrustForm key={asking.info.hash + asking.info.path} /> : null
}

function TrustForm() {
  useOccludesBrowser()
  const dialog = useRef<HTMLDialogElement>(null)
  const asking = useProjectTrust((state) => state.asking)
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close() }, [])
  if (!asking) return null
  const { info, answer } = asking
  const commands = [['setup', t('ProjectTrustDialog.runAfterCreatingAWorktree'), info.config.setup], ['check', t('ProjectTrustDialog.runBeforeSubmittingForReview'), info.config.check]] as const
  return <dialog ref={dialog} className="modal project-trust-dialog" aria-labelledby="project-trust-title" onCancel={(event) => { event.preventDefault(); answer(false) }}>
    <form className="modal-body" onSubmit={(event) => { event.preventDefault(); answer(true) }}>
      <header className="modal-header"><h2 id="project-trust-title">{t('ProjectTrustDialog.runCommandsFromProjectConfiguration')}</h2><button type="button" className="icon-button modal-close" aria-label={t('BackdropPicker.close')} onClick={() => answer(false)}><CloseIcon /></button></header>
      <p className="project-trust-path">{info.path}/.antumi/project.json</p>
      {commands.map(([name, when, command]) => command && (
        <div key={name} className="project-trust-command">
          <span className="modal-label">{name} · {when}</span>
          <pre>{command}</pre>
        </div>
      ))}
      {info.config.copy?.length ? (
        <div className="project-trust-command">
          <span className="modal-label">{t('ProjectTrustDialog.filesCopiedToTheNewWorktree')}</span>
          <pre>{info.config.copy.join('\n')}</pre>
        </div>
      ) : null}
      <p className="project-trust-note">{t('ProjectTrustDialog.commandsRunInYourLoginShellInsideThe')}</p>
      <footer className="modal-footer"><button type="button" className="button ghost" onClick={() => answer(false)}>{t('ChatCommandSettings.cancel')}</button>{asking.canSkip && <button type="button" className="button" onClick={() => answer('skip')}>{t('ProjectTrustDialog.skipOnce')}</button>}<button type="submit" className="button primary">{t('ProjectTrustDialog.allowAndContinue')}</button></footer>
    </form>
  </dialog>
}
