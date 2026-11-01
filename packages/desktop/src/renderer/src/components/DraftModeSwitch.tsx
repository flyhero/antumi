import { t } from '../i18n'
import { switchDraftMode, useDiscussionsSupported, type DraftCarry, type DraftMode } from '../core-store'

// The top of the new page: one agent, or several discussing. Switching takes along what was
// written and the projects. `blocked` says why the page cannot become a group chat now.
export function DraftModeSwitch({ mode, carry, blocked = null, disabled = false }: { mode: DraftMode; carry: () => DraftCarry; blocked?: string | null; disabled?: boolean }) {
  const supported = useDiscussionsSupported()
  if (!supported) return null
  const choose = (next: DraftMode) => {
    if (next === mode || disabled || (next === 'group' && blocked)) return
    switchDraftMode(next, carry())
  }
  return (
    <div className="segmented chat-draft-mode" role="radiogroup" aria-label={t('DraftModeSwitch.label')}>
      <button type="button" role="radio" aria-checked={mode === 'single'} disabled={disabled} onClick={() => choose('single')}>{t('DraftModeSwitch.single')}</button>
      <button type="button" role="radio" aria-checked={mode === 'group'} aria-disabled={Boolean(blocked) || undefined} disabled={disabled} data-tooltip={blocked ?? t('DraftModeSwitch.groupHint')} onClick={() => choose('group')}>{t('DraftModeSwitch.group')}</button>
    </div>
  )
}
