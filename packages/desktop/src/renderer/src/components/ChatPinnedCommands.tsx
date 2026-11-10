import { t } from '../i18n'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Conversation, SavedChatCommand } from '@antumi/protocol'
import { pinnedCommands, takesArguments } from '../chat-commands'
import { runInComposer } from '../composer-command-runs'
import { useCore } from '../core-store'
import { ContextMenu, MenuItem, type MenuPoint } from './ContextMenu'
import { MoreIcon } from './icons'

const GAP = 2

function tooltip(command: SavedChatCommand): string {
  const what = command.description || command.prompt.split('\n')[0] || ''
  return `${what}\n${takesArguments(command) ? t('ChatPinnedCommands.fillsTheInput') : t('ChatPinnedCommands.sendsAtOnce')}`
}

// The commands pinned in settings, between the header's chips and its buttons, where it doubles as
// the spacer that pushes the buttons right. Those that do not fit go, rightmost first, into ⋯.
export function ChatPinnedCommands({ conversation, shown }: { conversation: Conversation; shown: boolean }) {
  const supported = useCore((s) => s.rpc?.features.includes('chat-command-pins') ?? false)
  const commands = useCore((s) => s.chatCommands)
  const pinned = useMemo(
    () => supported && shown ? pinnedCommands(commands, conversation.projectPaths) : [],
    [supported, shown, commands, conversation.projectPaths]
  )
  const box = useRef<HTMLDivElement>(null)
  const measure = useRef<HTMLDivElement>(null)
  const more = useRef<HTMLButtonElement>(null)
  const [fit, setFit] = useState(pinned.length)
  const [at, setAt] = useState<MenuPoint | null>(null)
  const close = useCallback(() => setAt(null), [])

  // An unseen copy of every button gives their widths, which the visible row cannot while some hide.
  useLayoutEffect(() => {
    const element = box.current
    if (!element || pinned.length === 0) return
    const update = () => {
      const widths = [...(measure.current?.children ?? [])].map((child) => child.getBoundingClientRect().width)
      const moreWidth = widths.pop() ?? 0
      const room = element.clientWidth
      const width = (n: number) => {
        const folding = n < pinned.length
        const items = n + (folding ? 1 : 0)
        return widths.slice(0, n).reduce((sum, each) => sum + each, 0) + (folding ? moreWidth : 0) + GAP * Math.max(0, items - 1)
      }
      let count = pinned.length
      while (count > 0 && width(count) > room) count--
      setFit(count)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [pinned])

  const visible = pinned.slice(0, fit)
  const folded = pinned.slice(fit)
  const run = (command: SavedChatCommand) => runInComposer(conversation.id, command)
  return (
    <div ref={box} className="chat-dock-spacer chat-pinned-commands">
      {pinned.length > 0 && <>
        <div ref={measure} className="chat-pinned-measure" aria-hidden="true">
          {pinned.map((command) => <span key={command.id} className="chat-pinned-command">/{command.name}</span>)}
          <span className="chat-pinned-command chat-pinned-more"><MoreIcon /></span>
        </div>
        {visible.map((command) => (
          <button
            key={command.id}
            type="button"
            className="chat-pinned-command"
            data-tooltip={tooltip(command)}
            data-tooltip-side="top-end"
            onClick={() => run(command)}
          >
            /{command.name}
          </button>
        ))}
        {folded.length > 0 && (
          <button
            ref={more}
            type="button"
            className="chat-pinned-command chat-pinned-more"
            aria-label={t('ChatPinnedCommands.more')}
            data-tooltip={t('ChatPinnedCommands.more')}
            data-tooltip-side="top-end"
            aria-haspopup="menu"
            aria-expanded={at !== null}
            onClick={() => {
              const rect = more.current?.getBoundingClientRect()
              if (at) close()
              else if (rect) setAt({ x: rect.right, y: rect.top })
            }}
          >
            <MoreIcon />
          </button>
        )}
        {at && folded.length > 0 && (
          <ContextMenu at={at} align="end" above trigger={more.current} label={t('ChatPinnedCommands.more')} onClose={close}>
            {folded.map((command) => (
              <MenuItem key={command.id} label={`/${command.name}`} hint={command.description || null} onSelect={() => { close(); run(command) }} />
            ))}
          </ContextMenu>
        )}
      </>}
    </div>
  )
}
