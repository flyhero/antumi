import { describe, expect, it, vi } from 'vitest'
import { createRpcClient, RpcRequest, type RpcConnection } from '@antumi/protocol'

vi.hoisted(() => {
  vi.stubGlobal('window', { antumi: undefined, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel' })
})

const { availableProjects, plainProject, recentProjectChoices, sourceProject, sourceProjects } = await import('./project-choices')

describe('source project suggestions', () => {
  it('offers the source of an already selected copy, and a copy of an already selected source', () => {
    const copy = { path: '/worktrees/copy/magi', source: '/code/magi', worktree: true, branch: 'feature' }
    expect(availableProjects([copy], [copy.path])).toEqual({ sources: [plainProject('/code/magi')], copies: [] })
    expect(availableProjects([copy, plainProject('/code/magi')], ['/code/magi'])).toEqual({ sources: [], copies: [copy] })
    expect(availableProjects([copy], [copy.path, '/code/magi'])).toEqual({ sources: [], copies: [] })
  })
  it('offers the source once when recent entries include multiple copies, keeping recency', () => {
    const copies = [
      { path: '/worktrees/one/magi', source: '/code/magi', worktree: true, branch: 'one' },
      plainProject('/code/orca'),
      { path: '/worktrees/two/magi', source: '/code/magi', worktree: true, branch: 'two' },
      plainProject('/code/magi')
    ]
    expect(sourceProjects(copies)).toEqual([plainProject('/code/magi'), plainProject('/code/orca')])
    expect(copies[0]?.path).toBe('/worktrees/one/magi')
  })

  it('keeps independent projects with the same name and never treats an unresolved copy as a source', () => {
    expect(sourceProjects([
      plainProject('/work/magi'), plainProject('/personal/magi'),
      { path: '/worktrees/copy/magi', source: null, worktree: true, branch: null }
    ])).toEqual([plainProject('/work/magi'), plainProject('/personal/magi')])
  })
})

function connection(features = ['project-choices', 'project-suggestions']) {
  const sent: Array<{ id: number; method: string; params: unknown }> = []
  const client = createRpcClient((frame) => { const request = RpcRequest.parse(JSON.parse(frame)); sent.push({ id: request.id, method: request.method, params: request.params }) })
  const rpc: RpcConnection = { ...client, features, close() {}, closed: new Promise(() => {}) }
  const reply = (index: number, result: unknown) => client.receive(JSON.stringify({ jsonrpc: '2.0', id: sent[index]!.id, result }))
  return { rpc, sent, reply }
}

describe('progressive project choices', () => {
  it('publishes sources before a slow copy query, without querying source checkouts again', async () => {
    const { rpc, sent, reply } = connection()
    const source = plainProject('/code/app')
    const copy = { path: '/worktrees/app', source: source.path, worktree: true, branch: 'old' }
    const publish = vi.fn()
    let settled = false
    const loading = recentProjectChoices(rpc, publish).then((choices) => { settled = true; return choices })
    expect(sent[0]?.method).toBe('projects.suggestions')
    reply(0, { paths: [source.path, copy.path], choices: [source, copy] })
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    expect(publish).toHaveBeenCalledWith([source, copy])
    expect(availableProjects(publish.mock.calls[0]![0], []).sources).toEqual([source])
    expect(settled).toBe(false)
    expect(sent[1]).toMatchObject({ method: 'projects.describe', params: { paths: [copy.path] } })
    reply(1, [{ ...copy, branch: 'new' }])
    expect(await loading).toEqual([source, { ...copy, branch: 'new' }])
  })

  it('never temporarily offers an unclassified copy as a source', async () => {
    const { rpc, sent, reply } = connection()
    const publish = vi.fn()
    const loading = recentProjectChoices(rpc, publish)
    reply(0, { paths: ['/unknown/copy'], choices: [] })
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    expect(publish).toHaveBeenCalledWith([])
    const copy = { path: '/unknown/copy', source: '/code/app', worktree: true, branch: 'feature' }
    reply(1, [copy])
    expect(availableProjects(await loading, []).sources).toEqual([plainProject('/code/app')])
  })

  it('shares an outstanding copy inspection across repeated openings', async () => {
    const { rpc, sent, reply } = connection()
    const first = recentProjectChoices(rpc)
    reply(0, { paths: ['/copy'], choices: [] })
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    const second = recentProjectChoices(rpc)
    reply(2, { paths: ['/copy'], choices: [] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sent.filter((request) => request.method === 'projects.describe')).toHaveLength(1)
    reply(1, [{ path: '/copy', source: '/source', worktree: true, branch: null }])
    expect(await first).toEqual(await second)
  })

  it('uses the recent list directly on older cores without checkout descriptions', async () => {
    const { rpc, sent, reply } = connection([])
    const publish = vi.fn()
    const loading = recentProjectChoices(rpc, publish)
    expect(sent[0]?.method).toBe('projects.recent')
    reply(0, ['/source'])
    expect(await loading).toEqual([plainProject('/source')])
    expect(publish).toHaveBeenCalledWith([plainProject('/source')])
    expect(sent).toHaveLength(1)
  })
})

describe('a project group starting a conversation', () => {
  const copy = { path: '/worktrees/one/app', source: '/code/app', worktree: true, branch: 'one' }

  it('starts in the source of a copy core already knows, without asking Git', async () => {
    const { rpc, sent, reply } = connection()
    const source = sourceProject(rpc, copy.path)
    reply(0, { paths: [copy.path], choices: [copy] })
    expect(await source).toBe('/code/app')
    expect(sent).toHaveLength(1)
  })

  it('asks for an unknown path, and keeps a copy whose source is gone or a plain project', async () => {
    const { rpc, sent, reply } = connection()
    const resolved = sourceProject(rpc, copy.path)
    reply(0, { paths: [], choices: [] })
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[1]).toMatchObject({ method: 'projects.describe', params: { paths: [copy.path] } })
    reply(1, [copy])
    expect(await resolved).toBe('/code/app')
    const orphan = sourceProject(rpc, copy.path)
    reply(2, { paths: [copy.path], choices: [{ ...copy, source: null }] })
    expect(await orphan).toBe(copy.path)
    const plain = sourceProject(rpc, '/code/app')
    reply(3, { paths: ['/code/app'], choices: [plainProject('/code/app')] })
    expect(await plain).toBe('/code/app')
  })

  it('keeps the path on older cores', async () => {
    const { rpc, sent } = connection([])
    expect(await sourceProject(rpc, copy.path)).toBe(copy.path)
    expect(sent).toHaveLength(0)
  })
})
