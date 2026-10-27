import type { ChatPermissionMode } from '../chat'
import type { ModelPrice } from '../model-cost'
import type { ProviderWire } from '../model-provider'

export type AgentModeText = { label: string; description: string }

// What core and every client know of an agent without running it: plain data, so a client reads
// the agent's rules here rather than re-encoding them, and a new agent is one more descriptor.
export type AgentDescriptor = {
  label: string
  translations?: { en: Partial<Pick<AgentDescriptor, 'modes' | 'environment' | 'usageWhere' | 'nativePlanRun'>> }
  // The command the user runs themselves, to sign in or refresh its credentials.
  cli: string
  // Where native credentials come from; separate from Antumi-managed model providers.
  setup: 'account' | 'provider' | 'first-use'
  // Antumi's permission modes as this agent's users know them; a mode left out is one it lacks.
  modes: Partial<Record<ChatPermissionMode, AgentModeText>>
  // What a new conversation can start in, before the catalog adds auto and the settings bypass.
  // The first is the fallback when defaultStartMode is unavailable.
  startModes: readonly ChatPermissionMode[]
  defaultStartMode: ChatPermissionMode
  // What it runs in as a member of a group chat: it reads the projects and answers in words, and
  // changes nothing. A conversation opened to look into an inbox issue starts in it too.
  discussionMode: ChatPermissionMode
  // What it works in as a squad's leader or read-only member: its folders stay read-only whatever
  // the mode, so not a planning mode, in which it would propose a plan rather than do the work.
  readOnlyMode: ChatPermissionMode
  capabilities: {
    // False when a stage required to keep its workspace read-only cannot start. Unset means supported.
    readOnly?: boolean
    // Runs with nobody there: schedules and routines.
    unattended: boolean
    // Can run with nothing asked and nothing sandboxed, where the user allows it.
    bypass: boolean
    // Offers auto where its catalog says the model takes it.
    autoMode: boolean
    // Reads `@path` in a message itself; without it the agent gets the path to read.
    pathMentions: boolean
    // Takes a mode, model or effort switch while a turn runs.
    optionsWhileBusy: boolean
    // Loads a folder of Agent Skills Antumi built for its start (the skills library).
    skills: boolean
    // Takes the user's MCP servers at its start, beside Antumi's (Settings → MCP).
    userMcp: boolean
    // The wires it can reach a third-party model provider over, the one it prefers first; none, and
    // it only runs on its own account.
    modelProviders: readonly ProviderWire[]
    // Signs in to more than one account, each in a config folder of its own (agent-account.ts).
    accounts: boolean
  }
  // Its file tools reach only the primary project: it gets at the others, a task's reference
  // projects among them, through commands alone. Clients say so where it is given several.
  primaryOnlyFiles?: boolean
  // A plan it approves runs on in one of its own modes, named as the agent names them, rather than
  // in Antumi's run modes.
  nativePlanRun?: { hint: string }
  environment: {
    // Why Antumi needs it, and how it runs it.
    role: string
    install: string
    signIn: string
    // A CLI found, but too old to speak the protocol Antumi runs it with.
    outdated?: { status: string; hint: string }
    // Missing, for one whose runtime Antumi downloads itself: without it the row reads as a CLI to install.
    missing?: { status: string; hint: string }
  }
  // Where a usage reset can be used.
  usageWhere: string
  quotaAutomation?: { model: string; resetCredits: boolean }
  // Its product on limitreset.net, which gathers the resets its service announces for everyone.
  resetTracker?: string
  // The models it is cheapest on, for a small one-off job such as translating a reply: preferred
  // first, each matched against its catalog in the catalog's order (newest first). See quickModel.
  quickModels?: readonly RegExp[]
  prices?: readonly ModelPrice[]
  // Folders under %LOCALAPPDATA% its Windows installer puts the CLI in, which PATH may lack.
  windowsPathDirs?: readonly string[]
}
