import { t } from '../i18n'
import { DEFAULT_WORKTREE_CLEAN_DAYS, WORKTREE_CLEAN_DAYS } from '@antumi/protocol'
import { setChatSettings, useCore } from '../core-store'
import { Segmented, SettingsRow, Toggle } from './SettingsControls'

// On by default; on, how long a worktree no conversation or task uses waits before core cleans it,
// when it holds nothing that would be lost. Hidden against a core that does not clean on its own.
export function WorktreeCleanSettings() {
  const days = useCore((state) => state.chatSettings?.worktreeCleanDays)
  if (days === undefined) return null
  return <>
    <SettingsRow
      label={t('WorktreeCleanSettings.cleanUpUnusedWorktrees')}
      description={t('WorktreeCleanSettings.description')}
      control={(labelId) => (
        <Toggle labelId={labelId} checked={days !== null} onChange={(on) => void setChatSettings({ worktreeCleanDays: on ? DEFAULT_WORKTREE_CLEAN_DAYS : null })} />
      )}
    />
    {days !== null && (
      <SettingsRow
        label={t('WorktreeCleanSettings.after')}
        control={(labelId) => (
          <Segmented labelId={labelId} value={String(days)}
            options={WORKTREE_CLEAN_DAYS.map((each) => ({ value: String(each), label: t('WorktreeCleanSettings.days', { each }) }))}
            onChange={(value) => void setChatSettings({ worktreeCleanDays: Number(value) })} />
        )}
      />
    )}
  </>
}
