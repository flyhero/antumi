import { t } from '../i18n'
import { blocksEverything, environmentProblems } from '@antumi/protocol'
import { setSettingsOpen, useCore } from '../core-store'
import { problemText } from '../environment-text'
import { PulseIcon } from './icons'
import { usePreferences } from '../preferences'

// Shown over the lists while nothing can run: a missing git or agent is found out at the first
// start otherwise, as an agent that fails. Clicking goes to where it is fixed, which says what to
// type: 关于 for Git, 外部智能体 for the agents.
export function EnvironmentNotice() {
  const environment = useCore((s) => s.environment)
  const providers = useCore((s) => s.modelProviders)
  const disabled = usePreferences((s) => s.disabledAgents)
  if (!environment) return null
  const blocking = environmentProblems(environment, { providers, disabled }).filter(blocksEverything)
  if (blocking.length === 0) return null
  return (
    <button type="button" className="environment-notice" onClick={() => setSettingsOpen(true, blocking[0]!.code === 'git-missing' ? 'about' : 'agents')}>
      <PulseIcon />
      <span>{problemText(blocking[0]!)}</span>
      <span className="environment-notice-action">{t('EnvironmentNotice.view')}</span>
    </button>
  )
}
