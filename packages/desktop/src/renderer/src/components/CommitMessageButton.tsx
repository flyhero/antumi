import { t } from '../i18n'
import { useState } from 'react'
import { RpcError, type GitTarget } from '@antumi/protocol'
import { useCommitMessageSupported, useCore } from '../core-store'
import { reasonText } from '../labels'
import { usePreferences } from '../preferences'
import { SparkIcon } from './icons'
import { Spinner } from './Spinner'

// Has the target's own agent write a message for its changes, on its small model, into the form:
// to read over before committing.
export function CommitMessageButton({ target, disabled, onMessage }: { target: GitTarget; disabled?: boolean; onMessage: (message: string) => void }) {
  const supported = useCommitMessageSupported()
  const agent = useCore((s) => (target.kind === 'conversation' ? s.conversations[target.id]?.agent : target.kind === 'task' ? s.tasks[target.id]?.agent : null) ?? null)
  const model = usePreferences((p) => (agent ? p.quickModels[agent] : undefined))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!supported || !agent) return null
  const generate = async () => {
    const { rpc } = useCore.getState()
    if (!rpc || busy) return
    setBusy(true)
    setError(null)
    try {
      const { message } = await rpc.call('git.commitMessage', { ...target, ...(model ? { model } : {}) })
      onMessage(message)
    } catch (failure) {
      setError(failure instanceof RpcError && failure.reason ? reasonText(failure.reason, failure.message) : failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="commit-message-generate">
      <button type="button" className="button ghost" disabled={disabled || busy} data-tooltip={t('CommitMessageButton.useThisAgentSSmallModelToDraft')} onClick={() => void generate()}>
        {busy ? <Spinner /> : <SparkIcon />}
        {busy ? t('CommitMessageButton.generating') : t('CommitMessageButton.generateCommitMessage')}
      </button>
      {error && <span className="commit-message-error" role="alert">{error}</span>}
    </span>
  )
}
