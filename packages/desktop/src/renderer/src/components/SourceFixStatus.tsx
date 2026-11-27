import { useEffect, useState } from 'react'
import type { SourceFixInfo } from '@antumi/protocol'
import { selectTask, useCore } from '../core-store'
import { t } from '../i18n'

export function SourceFixStatus({ info }: { info: SourceFixInfo }) {
  return <div className="auto-investigation-summary source-fix-status" role="status">
    <span>{t(`SourceFix.state.${info.state}`)}</span>
    {info.message && <span className="source-fix-message">{info.message}</span>}
    {info.taskId && <button type="button" className="link-button" onClick={() => selectTask(info.taskId)}>{t('SourceFix.openTask')}</button>}
    {info.urls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{url}</a>)}
  </div>
}

export function ConversationSourceFix({ id }: { id: string }) {
  const rpc = useCore((state) => state.rpc)
  const [info, setInfo] = useState<SourceFixInfo | null>(null)
  useEffect(() => {
    setInfo(null)
    if (!rpc?.features.includes('source-auto-fix')) return
    let live = true
    void rpc.call('sources.fix', { id }).then((value) => { if (live) setInfo(value) }, () => {})
    const unsubscribe = rpc.on('sources.autoInvestigationChanged', ({ run }) => { if (run?.id === id && run.fix) setInfo(run.fix) })
    return () => { live = false; unsubscribe() }
  }, [rpc, id])
  return info && <SourceFixStatus info={info} />
}
