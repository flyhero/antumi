import { useId } from 'react'
import type { ChatItem, ChatToolStatus } from '@antumi/protocol'
import { toolIconKind, type ToolIconKind } from '../chat-tools'
import { BookIcon, GearIcon, GlobeIcon, ImageIcon, ListIcon, PencilIcon, RobotIcon, SearchIcon, TerminalIcon } from './icons'

function BrowserControlIcon() {
  return <span className="chat-browser-mark"><span className="chat-browser-mark-cursor" /></span>
}

function OrbitGlobeIcon() {
  const cutout = useId()
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <defs>
      <clipPath id={cutout}>
        <path clipRule="evenodd" d="M0 0h20v20H0z M16 10a6 6 0 1 0-12 0 6 6 0 1 0 12 0" />
      </clipPath>
    </defs>
    <ellipse className="chat-globe-orbit" cx="10" cy="10" rx="9" ry="4.5" transform="rotate(-35 10 10)" />
    <g clipPath={`url(#${cutout})`}>
      <g transform="rotate(-35 10 10)">
        <circle className="chat-globe-satellite chat-globe-satellite-back" r="1.65" />
      </g>
    </g>
    <g className="chat-globe-body">
      <circle cx="10" cy="10" r="6" />
      <path d="M4 10h12M10 4c2.2 2.2 2.2 9.8 0 12M10 4c-2.2 2.2-2.2 9.8 0 12" />
    </g>
    <g transform="rotate(-35 10 10)">
      <circle className="chat-globe-satellite chat-globe-satellite-front" r="1.65" />
    </g>
  </svg>
}

const ICONS = {
  read: BookIcon,
  edit: PencilIcon,
  terminal: TerminalIcon,
  search: SearchIcon,
  browser: GlobeIcon,
  'browser-control': BrowserControlIcon,
  image: ImageIcon,
  agent: RobotIcon,
  list: ListIcon,
  tool: GearIcon
} satisfies Record<ToolIconKind, () => React.JSX.Element>

export function ChatToolIcon({ name, display, status }: { name: string; display?: Extract<ChatItem, { kind: 'tool' }>['display']; status: ChatToolStatus }) {
  const kind = toolIconKind(name, display)
  const Icon = kind === 'browser' && status === 'running' ? OrbitGlobeIcon : ICONS[kind]
  return <span className="chat-tool-icon" data-kind={kind} data-status={status} aria-hidden="true"><Icon /></span>
}
