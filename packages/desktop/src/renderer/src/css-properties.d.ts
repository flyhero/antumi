import 'react'

// The custom properties components set inline for the stylesheet to read: the share of a run's
// calls that finished, a subagent's place among its siblings, the sidebar's width and the chat's font.
declare module 'react' {
  interface CSSProperties {
    '--chat-rail'?: string
    '--chat-lane'?: number
    '--sidebar-width'?: string
    '--chat-font-custom'?: string
    '--chat-font-cjk'?: string
    '--git-depth'?: number
    '--git-branch-width'?: string
    '--git-detail-width'?: string
  }
}
