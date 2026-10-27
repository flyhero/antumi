import { localized, t } from '../i18n'
import { setRoutinesOpen, useCore, useSchedulesSupported, type RoutinesTab } from '../core-store'
import { RoutinesSection } from './RoutinesSection'
import { SchedulesPanel } from './SchedulesPanel'
import './agent-profiles.css'

const TABS: ReadonlyArray<{ value: RoutinesTab; label: string }> = localized(() => ([{ value: 'routines', label: t('RoutinesEntry.scheduled') }, { value: 'schedules', label: t('OverviewView.schedules') }]))

// What runs later without anyone there: the routines that run again and again, and beside them the
// reservations (预约) that run once, each on a tab of its own. The tabs sit above the page as the
// agents' do, so the sidebar's pages switch alike.
export function RoutinesView() {
  const schedulesSupported = useSchedulesSupported()
  const chosen = useCore((s) => s.routinesTab)
  const tab = schedulesSupported ? chosen : 'routines'
  return (
    <section className="agents-hub">
      {schedulesSupported && (
        <nav className="agents-tabs" aria-label={t('RoutinesEntry.scheduled')}>
          <div className="agents-tabs-inner">
            {TABS.map((each) => (
              <button key={each.value} type="button" className="button ghost" aria-pressed={tab === each.value} onClick={() => setRoutinesOpen(true, each.value)}>{each.label}</button>
            ))}
          </div>
        </nav>
      )}
      <section className="worktrees-page routines-page" aria-label={TABS.find((each) => each.value === tab)?.label}>
        {tab === 'schedules' ? <SchedulesPanel /> : <RoutinesSection />}
      </section>
    </section>
  )
}
