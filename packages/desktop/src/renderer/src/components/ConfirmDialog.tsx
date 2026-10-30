import { useEffect, useRef } from 'react'
import { t } from '../i18n'
import { useOccludesBrowser } from '../browser-occlusion'
import { confirmParts, useConfirmDialog } from '../confirm-dialog'
import { WarningIcon } from './icons'

// The app's own confirm box, in every window: the question as the title, what it means under it.
export function ConfirmDialog() {
  const asking = useConfirmDialog((state) => state.asking)
  return asking ? <ConfirmForm key={asking.message} /> : null
}

function ConfirmForm() {
  useOccludesBrowser()
  const dialog = useRef<HTMLDialogElement>(null)
  const submit = useRef<HTMLButtonElement>(null)
  const asking = useConfirmDialog((state) => state.asking)
  // Enter takes the action only when it loses nothing; otherwise focus stays on Cancel, first.
  useEffect(() => {
    dialog.current?.showModal()
    if (!useConfirmDialog.getState().asking?.danger) submit.current?.focus()
    return () => dialog.current?.close()
  }, [])
  if (!asking) return null
  const { message, confirm, cancel, danger, answer } = asking
  const { title, body } = confirmParts(message)
  return <dialog ref={dialog} className="modal confirm-dialog" data-danger={danger || undefined} aria-labelledby="confirm-dialog-title" aria-describedby={body ? 'confirm-dialog-body' : undefined} onCancel={(event) => { event.preventDefault(); answer(false) }}>
    <form className="confirm-dialog-body" onSubmit={(event) => { event.preventDefault(); answer(true) }}>
      {danger && <span className="confirm-dialog-icon" aria-hidden="true"><WarningIcon /></span>}
      <div className="confirm-dialog-text">
        <h2 id="confirm-dialog-title">{title}</h2>
        {body && <p id="confirm-dialog-body">{body}</p>}
      </div>
      <footer className="confirm-dialog-footer">
        <button type="button" className="button" onClick={() => answer(false)}>{cancel ?? t('ChatCommandSettings.cancel')}</button>
        <button ref={submit} type="submit" className={danger ? 'button danger' : 'button primary'}>{confirm}</button>
      </footer>
    </form>
  </dialog>
}
