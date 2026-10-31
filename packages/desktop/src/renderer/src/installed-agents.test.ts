import { describe, expect, it } from 'vitest'
import { AGENT_KINDS, createRpcClient, RpcRequest, type Environment, type EnvironmentCheck, type RpcConnection } from '@antumi/protocol'
import { useCore } from './core-store'
import { detectedAgents, installedAgents, otherInstalledAgent, startDisabledAgentsMirror } from './installed-agents'
import { usePreferences } from './preferences'

const check = (tool: EnvironmentCheck['tool'], status: EnvironmentCheck['status']): EnvironmentCheck => ({ tool, status, version: null, path: null, signedIn: null })
const environment = (...checks: EnvironmentCheck[]): Environment => ({ checks, searchPath: [], checkedAt: 0 })

describe('installedAgents', () => {
  it('offers every agent until core has looked', () => {
    expect(installedAgents(null)).toEqual(AGENT_KINDS)
  })

  it('offers what core found, a shim it could not ask included', () => {
    expect(installedAgents(environment(check('git', 'ok'), check('claude', 'ok'), check('codex', 'missing')))).toEqual(['claude'])
    expect(installedAgents(environment(check('claude', 'missing'), check('codex', 'unknown')))).toEqual(['codex'])
  })

  it('offers every agent when none is found, so there is something to install', () => {
    expect(installedAgents(environment(check('git', 'ok'), check('claude', 'missing'), check('codex', 'missing')))).toEqual(AGENT_KINDS)
  })

  it('leaves out the agents the user turned off', () => {
    const both = environment(check('claude', 'ok'), check('codex', 'ok'))
    expect(installedAgents(both, ['claude'])).toEqual(['codex'])
    expect(installedAgents(null, ['codex'])).toEqual(AGENT_KINDS.filter((kind) => kind !== 'codex'))
  })

  it('keeps the agents found when every one is off, so there is always a choice', () => {
    expect(installedAgents(environment(check('claude', 'ok'), check('codex', 'missing')), ['claude'])).toEqual(['claude'])
  })
})

describe('detectedAgents', () => {
  it('lists what core found whether or not it is turned off', () => {
    expect(detectedAgents(environment(check('claude', 'ok'), check('codex', 'unknown')))).toEqual(['claude', 'codex'])
  })
})

describe('otherInstalledAgent', () => {
  it('names another agent that is here, or none', () => {
    expect(otherInstalledAgent('claude', ['claude', 'codex'])).toBe('codex')
    expect(otherInstalledAgent('claude', ['claude'])).toBeNull()
    expect(otherInstalledAgent('codex', ['claude'])).toBe('claude')
  })
})

describe('startDisabledAgentsMirror', () => {
  it('tells core the agents turned off once it keeps the list, and again on each change', async () => {
    const sent: Array<ReturnType<typeof RpcRequest.parse>> = []
    const client = createRpcClient((frame) => sent.push(RpcRequest.parse(JSON.parse(frame))))
    const rpc: RpcConnection = { ...client, features: [], close() {}, closed: new Promise(() => {}) }
    usePreferences.setState({ disabledAgents: ['codex'] })
    useCore.setState({ rpc, chatSettings: null })
    startDisabledAgentsMirror()
    // An older core keeps no such list.
    useCore.setState({ chatSettings: { promptSuggestions: true } })
    expect(sent).toEqual([])
    useCore.setState({ chatSettings: { promptSuggestions: true, disabledAgents: [] } })
    expect(sent.map((frame) => frame.params)).toEqual([{ disabledAgents: ['codex'] }])
    useCore.setState({ chatSettings: { promptSuggestions: true, disabledAgents: [] } })
    expect(sent).toHaveLength(1)
    rpc.receive(JSON.stringify({ jsonrpc: '2.0', id: sent[0]?.id, result: { promptSuggestions: true, disabledAgents: ['codex'] } }))
    await expect.poll(() => useCore.getState().chatSettings?.disabledAgents).toEqual(['codex'])
    usePreferences.setState({ disabledAgents: [] })
    expect(sent.map((frame) => frame.params)).toEqual([{ disabledAgents: ['codex'] }, { disabledAgents: [] }])
  })
})
