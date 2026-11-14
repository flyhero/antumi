import { useEffect, useState } from 'react'
import { askConfirm } from '../confirm-dialog'
import { perform, useCore } from '../core-store'
import { t } from '../i18n'
import { formatBytes } from '../worktree-groups'
import { SettingsGroup, SettingsRow } from './SettingsControls'

// 设置 → 存储: how much the attachment store holds, and letting go of what nothing refers to any more
// (core's attachment-sweep.ts). Counting reads every conversation's logs, so it is done on opening.

type Usage = { files: number; bytes: number; unusedFiles: number; unusedBytes: number }

export function useAttachmentSweepSupported(): boolean {
  return useCore((s) => s.rpc?.features.includes('attachment-sweep') ?? false)
}

export function StorageSettings() {
  const rpc = useCore((s) => s.rpc)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [sweeping, setSweeping] = useState(false)
  const [swept, setSwept] = useState<{ files: number; bytes: number } | null>(null)
  useEffect(() => {
    if (!rpc) return
    let live = true
    void perform((connection) => connection.call('attachments.usage', {})).then((found) => { if (live && found) setUsage(found) })
    return () => { live = false }
  }, [rpc])
  const sweep = async () => {
    if (!usage || sweeping) return
    const confirmed = await askConfirm({
      message: t('StorageSettings.sweepConfirm', { files: usage.unusedFiles, size: formatBytes(usage.unusedBytes) }),
      confirm: t('StorageSettings.sweep'),
      danger: true
    })
    if (!confirmed) return
    setSweeping(true)
    const done = await perform((connection) => connection.call('attachments.sweep', {}))
    if (done) setSwept(done)
    const next = await perform((connection) => connection.call('attachments.usage', {}))
    if (next) setUsage(next)
    setSweeping(false)
  }
  const description = !usage
    ? t('StorageSettings.counting')
    : usage.files === 0 && usage.unusedFiles === 0
      ? t('StorageSettings.empty')
      : usage.unusedFiles > 0
      ? t('StorageSettings.usage', { files: usage.files, size: formatBytes(usage.bytes), unusedFiles: usage.unusedFiles, unusedSize: formatBytes(usage.unusedBytes) })
      : t('StorageSettings.usageAllUsed', { files: usage.files, size: formatBytes(usage.bytes) })
  return (
    <SettingsGroup>
      <SettingsRow
        label={t('StorageSettings.attachments')}
        description={swept ? `${description} ${t('StorageSettings.swept', { files: swept.files, size: formatBytes(swept.bytes) })}` : description}
        control={() => (
          <button type="button" className="button" disabled={!usage || usage.unusedFiles === 0 || sweeping} onClick={() => void sweep()}>
            {sweeping ? t('StorageSettings.sweeping') : t('StorageSettings.sweep')}
          </button>
        )}
      />
      <SettingsRow label={t('StorageSettings.automatic')} description={t('StorageSettings.automaticDescription')} control={() => null} />
    </SettingsGroup>
  )
}
