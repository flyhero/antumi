import { Component, type ReactNode } from 'react'
import { t } from '../i18n'

export class WindowErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  override state: { error: string | null } = { error: null }

  static getDerivedStateFromError(error: unknown): { error: string } {
    return { error: error instanceof Error ? error.message : String(error) }
  }

  override render() {
    if (this.state.error === null) return this.props.children
    return <div className="app"><section className="detail-empty" role="alert"><div className="detail-empty-body">
      <h2>Antumi</h2>
      <p>{t('ContactAuthor.crashed')}</p>
      <button type="button" className="button" onClick={() => location.reload()}>{t('ContactAuthor.reload')}</button>
    </div></section></div>
  }
}
