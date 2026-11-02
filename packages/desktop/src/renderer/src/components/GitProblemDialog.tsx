import { useEffect, useRef } from 'react'
import { handGitProblemToAgent, type GitProblem } from '../git-handoff'
import { t } from '../i18n'
import { useOccludesBrowser } from '../browser-occlusion'

// A Git action that failed or stopped on conflicts. Antumi resolves neither itself: it says what
// happened and offers the agent a new conversation set up to sort it out.
export function GitProblemDialog({ problem, where, close }: { problem: GitProblem; where: { directory: string; branch: string | null }; close: () => void }) {
  useOccludesBrowser()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  const conflicted = problem.conflicts.length > 0
  return <dialog ref={dialog} className="modal branch-dialog git-dialog git-problem-dialog" onCancel={(event) => { event.preventDefault(); close() }}>
    <div className="modal-body">
      <h2>{conflicted ? t('GitHandoff.conflictTitle') : t('GitHandoff.failedTitle')}</h2>
      {conflicted
        ? <>
          <p>{t('GitHandoff.conflictBody', { operation: problem.operation, count: problem.conflicts.length })}</p>
          <ul className="git-problem-files">{problem.conflicts.map((file) => <li key={file} className="mono">{file}</li>)}</ul>
        </>
        : <pre className="git-problem-output">{problem.message}</pre>}
      <p className="muted">{conflicted ? t('GitHandoff.handOffHint') : t('GitHandoff.handOffFailureHint')}</p>
      <div className="branch-commit-buttons">
        <button className="button" onClick={close}>{t('BackdropPicker.close')}</button>
        <button className="button primary" onClick={() => { close(); void handGitProblemToAgent(problem, where) }}>{t('GitHandoff.handOff')}</button>
      </div>
    </div>
  </dialog>
}
