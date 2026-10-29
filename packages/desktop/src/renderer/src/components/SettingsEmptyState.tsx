import type { ReactNode } from 'react'

export function SettingsEmptyState({ icon, title, children, actions }: { icon: ReactNode; title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="settings-empty-state">
      <span className="settings-empty-state-icon" aria-hidden="true">{icon}</span>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
        {actions && <div className="settings-empty-state-actions">{actions}</div>}
      </div>
    </div>
  )
}
