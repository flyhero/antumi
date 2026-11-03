import type { ChatContextUse } from '@antumi/protocol'
import { t } from '../i18n'

function tokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  return count >= 1000 ? `${Math.round(count / 1000)}k` : String(count)
}

// A missing window can still show its reported token count, without inventing a percentage.
export function ContextUsage({ context, showTokens = false, showDetails = false }: { context: ChatContextUse; showTokens?: boolean; showDetails?: boolean }) {
  const ratio = context.window ? Math.min(1, context.used / context.window) : null
  const title = ratio === null
    ? t('ChatOptionsBar.contextTokens', { value1: tokens(context.used) })
    : t('ChatOptionsBar.context', { value1: Math.round(ratio * 100), value2: tokens(context.used), value3: tokens(context.window ?? 0) })
  const radius = 7
  const length = 2 * Math.PI * radius
  const level = ratio === null ? 'normal' : ratio >= 0.85 ? 'critical' : ratio >= 0.6 ? 'warning' : 'normal'
  return <span className="chat-context" role="img" aria-label={title} title={title} data-tooltip={title} data-tooltip-side="top-end" data-level={level}>
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r={radius} className="chat-context-track" />
      {ratio !== null && <circle cx="10" cy="10" r={radius} className="chat-context-fill" strokeDasharray={`${ratio * length} ${length}`} transform="rotate(-90 10 10)" />}
    </svg>
    {ratio !== null
      ? <span>{Math.round(ratio * 100)}%{showDetails && ` (${tokens(context.used)} / ${tokens(context.window ?? 0)})`}</span>
      : (showTokens || showDetails) && <span>{tokens(context.used)}{showDetails && ' tokens'}</span>}
  </span>
}
