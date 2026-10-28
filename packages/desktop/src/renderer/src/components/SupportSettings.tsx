import { useEffect, useState } from 'react'
import { PROJECT_GITHUB_URL } from '@antumi/protocol'
import { t } from '../i18n'
import { ProjectStarSettings } from './ProjectStarSettings'
import { SettingsRow } from './SettingsControls'
import { CheckIcon, CopyIcon } from './icons'

export function SupportSettings() {
  const [result, setResult] = useState<'idle' | 'success' | 'error'>('idle')
  const [copiedAt, setCopiedAt] = useState<number | null>(null)
  const [copying, setCopying] = useState(false)

  useEffect(() => {
    if (copiedAt === null) return
    const timer = setTimeout(() => setCopiedAt(null), 3000)
    return () => clearTimeout(timer)
  }, [copiedAt])

  const share = async () => {
    if (copying) return
    setCopying(true)
    try {
      await navigator.clipboard.writeText(t('SupportSettings.shareText', { url: PROJECT_GITHUB_URL }))
      setResult('success')
      setCopiedAt(Date.now())
    } catch {
      setResult('error')
      setCopiedAt(null)
    } finally {
      setCopying(false)
    }
  }

  return <>
    <ProjectStarSettings />
    <SettingsRow label={t('SupportSettings.share')} description={<>
      {t('SupportSettings.shareDescription')}
      <span className="support-share-status" role="status" aria-atomic="true" data-error={result === 'error' || undefined}>
        {result === 'success' ? t('SupportSettings.shareThanks') : result === 'error' ? t('SupportSettings.shareFailed') : null}
      </span>
    </>} control={() => (
      <button type="button" className="button support-share-button" disabled={copying} onClick={() => void share()}>
        {copiedAt !== null ? <CheckIcon /> : <CopyIcon />}
        {t(copiedAt !== null ? 'BranchStatus.copied' : 'SupportSettings.copyShare')}
      </button>
    )} />
    <SettingsRow label={t('SettingsPage.projectWebsite')} control={() => (
      <a className="settings-project-link" href={PROJECT_GITHUB_URL} target="_blank" rel="noreferrer">{PROJECT_GITHUB_URL}</a>
    )} />
    <SettingsRow label={t('SupportSettings.feedback')} description={t('SupportSettings.feedbackDescription')} control={() => (
      <a className="button support-feedback-link" href={`${PROJECT_GITHUB_URL}/issues/new`} target="_blank" rel="noreferrer">{t('SupportSettings.openFeedback')}</a>
    )} />
    <SettingsRow label={t('SupportSettings.community')} description={t('SupportSettings.communityDescription')} control={() => (
      <span className="muted">{t('SupportSettings.comingSoon')}</span>
    )} />
  </>
}
