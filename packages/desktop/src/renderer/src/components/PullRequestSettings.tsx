import { t } from '../i18n'
import { setChatSettings, useCore } from '../core-store'
import { usePullRequestsSupported } from '../pull-requests'
import { SettingsRow, Toggle } from './SettingsControls'

// Off by default: accepting a task is the user's say. On, core accepts one for them once every
// pull request of its branches is merged on the host. Hidden against a core without pull requests.
export function PullRequestSettings() {
  const supported = usePullRequestsSupported()
  const on = useCore((state) => state.chatSettings?.pullRequestAutoAccept ?? false)
  if (!supported) return null
  return (
    <SettingsRow
      label={t('PullRequest.autoAccept')}
      description={t('PullRequest.autoAcceptDescription')}
      control={(labelId) => <Toggle labelId={labelId} checked={on} onChange={(next) => void setChatSettings({ pullRequestAutoAccept: next })} />}
    />
  )
}
