import { z } from 'zod'
import { AgentKind } from './agent'

// new: never imported; imported: Antumi holds all of it; updated: it went on in the terminal
// after it was imported, and importing again brings in those turns.
export const ExternalSessionStatus = z.enum(['new', 'imported', 'updated'])
export type ExternalSessionStatus = z.infer<typeof ExternalSessionStatus>

// A session an agent ran outside Antumi, as its own transcript tells it.
export const ExternalSession = z.object({
  agent: AgentKind,
  sessionId: z.string(),
  cwd: z.string(),
  title: z.string(),
  firstPrompt: z.string(),
  startedAt: z.number(),
  updatedAt: z.number(),
  status: ExternalSessionStatus,
  conversationId: z.string().nullable(),
  source: z.enum(['cli', 'desktop']).optional(),
  continuation: z.enum(['native', 'handoff']).optional(),
  // missing-cwd: the folder it ran in is gone, and the agent resumes a session only from there.
  problem: z.enum(['missing-cwd']).nullable()
})
export type ExternalSession = z.infer<typeof ExternalSession>

export const ExternalSessionRef = z.object({ agent: AgentKind, sessionId: z.string().min(1).max(200) })
export type ExternalSessionRef = z.infer<typeof ExternalSessionRef>
