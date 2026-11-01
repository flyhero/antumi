import { useEffect, useState } from 'react'
import type { AgentKind, DiscussionFormat } from '@antumi/protocol'
import { useCore } from './core-store'

// Asked once typing pauses, and only for a topic long enough to judge: each ask is a small model's
// turn. Core remembers its answers, so going back to a topic asks nothing.
const DELAY_MS = 1200
const MIN_LENGTH = 6

export type FormatSuggestion = { state: 'idle' | 'asking' | 'done' | 'failed'; format: DiscussionFormat | null; model: string | null }

const IDLE: FormatSuggestion = { state: 'idle', format: null, model: null }

// The format a member agent's small model judges the topic suits (discussions.suggestFormat), for the
// topic as it now reads; idle while off or too short, failed when it could not say.
export function useFormatSuggestion(topic: string, agents: readonly { agent: AgentKind; model?: string }[], enabled: boolean): FormatSuggestion {
  const rpc = useCore((s) => s.rpc)
  const supported = rpc?.features.includes('discussion-format-suggest') ?? false
  const text = topic.trim()
  const wanted = enabled && supported && text.length >= MIN_LENGTH && agents.length > 0
  const key = JSON.stringify(agents)
  const [answer, setAnswer] = useState<FormatSuggestion & { topic: string }>({ ...IDLE, topic: '' })
  useEffect(() => {
    if (!rpc || !wanted) return
    let current = true
    const timer = setTimeout(() => {
      setAnswer({ state: 'asking', format: null, model: null, topic: text })
      // Not through perform: a small model that cannot say leaves the page's own guess, no error.
      void rpc.call('discussions.suggestFormat', { topic: text, agents: JSON.parse(key) }).then(
        (found) => { if (current) setAnswer({ state: 'done', format: found.format, model: found.model, topic: text }) },
        () => { if (current) setAnswer({ state: 'failed', format: null, model: null, topic: text }) }
      )
    }, DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [rpc, wanted, text, key])
  return wanted && answer.topic === text ? answer : IDLE
}
