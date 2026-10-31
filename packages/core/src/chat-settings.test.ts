import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENT_KINDS, ChatSettings, knowledgeBaseKind } from '@antumi/protocol'
import { ChatSettingsStore } from './chat-settings'

const defaultConcurrency = Object.fromEntries(AGENT_KINDS.map((kind) => [kind, 6]))

describe('ChatSettingsStore', () => {
  let root: string
  let file: string
  let changes: ChatSettings[]

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'antumi-chat-settings-'))
    file = path.join(root, 'chat-settings.json')
    changes = []
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('suggests the next message and lets scheduled runs edit, unless the user changed that, and keeps it', async () => {
    const store = new ChatSettingsStore(file, (settings) => changes.push(settings))
    expect(await store.load()).toEqual({ promptSuggestions: true, titleNaming: 'first', titleModels: {}, unattendedMode: 'acceptEdits', maxConcurrentAgents: 20, agentConcurrency: defaultConcurrency, wireLog: false, userBrowser: true, readHistory: true, userTodos: true, knowledgeBase: null, autoArchiveDays: null, resetAnnouncements: true, disabledAgents: [] })

    await store.update({ promptSuggestions: false })
    await store.update({ unattendedMode: 'bypass' })
    expect(changes).toEqual([
      { promptSuggestions: false, titleNaming: 'first', titleModels: {}, unattendedMode: 'acceptEdits', maxConcurrentAgents: 20, agentConcurrency: defaultConcurrency, wireLog: false, userBrowser: true, readHistory: true, userTodos: true, knowledgeBase: null, autoArchiveDays: null, resetAnnouncements: true, disabledAgents: [] },
      { promptSuggestions: false, titleNaming: 'first', titleModels: {}, unattendedMode: 'bypass', maxConcurrentAgents: 20, agentConcurrency: defaultConcurrency, wireLog: false, userBrowser: true, readHistory: true, userTodos: true, knowledgeBase: null, autoArchiveDays: null, resetAnnouncements: true, disabledAgents: [] }
    ])

    const reopened = new ChatSettingsStore(file, () => {})
    expect(await reopened.load()).toEqual({ promptSuggestions: false, titleNaming: 'first', titleModels: {}, unattendedMode: 'bypass', maxConcurrentAgents: 20, agentConcurrency: defaultConcurrency, wireLog: false, userBrowser: true, readHistory: true, userTodos: true, knowledgeBase: null, autoArchiveDays: null, resetAnnouncements: true, disabledAgents: [] })
  })

  it('falls back to the default for a file it cannot read', async () => {
    writeFileSync(file, '{"promptSuggestions": "nope", "unattendedMode": "yolo"}')
    expect(await new ChatSettingsStore(file, () => {}).load()).toEqual({ promptSuggestions: true, titleNaming: 'first', titleModels: {}, unattendedMode: 'acceptEdits', maxConcurrentAgents: 20, agentConcurrency: defaultConcurrency, wireLog: false, userBrowser: true, readHistory: true, userTodos: true, knowledgeBase: null, autoArchiveDays: null, resetAnnouncements: true, disabledAgents: [] })
    writeFileSync(file, 'not json')
    expect(await new ChatSettingsStore(file, () => {}).load()).toEqual({ promptSuggestions: true, titleNaming: 'first', titleModels: {}, unattendedMode: 'acceptEdits', maxConcurrentAgents: 20, agentConcurrency: defaultConcurrency, wireLog: false, userBrowser: true, readHistory: true, userTodos: true, knowledgeBase: null, autoArchiveDays: null, resetAnnouncements: true, disabledAgents: [] })
  })

  it('keeps per-agent limits when another agent changes, and rejects invalid limits', async () => {
    const store = new ChatSettingsStore(file, () => {})
    await store.load()
    await store.update({ agentConcurrency: { claude: 2 } })
    expect(store.current().agentConcurrency).toEqual({ ...defaultConcurrency, claude: 2 })
    await store.update({ maxConcurrentAgents: 3 })
    expect(store.current().maxConcurrentAgents).toBe(3)
    expect(() => ChatSettings.parse({ promptSuggestions: true, maxConcurrentAgents: 0 })).toThrow()
  })

  it('archives nothing on its own until the user picks a number of days, and turns it off again', async () => {
    const store = new ChatSettingsStore(file, () => {})
    expect((await store.load()).autoArchiveDays).toBeNull()
    await store.update({ autoArchiveDays: 30 })
    await store.update({ promptSuggestions: false })
    expect((await new ChatSettingsStore(file, () => {}).load()).autoArchiveDays).toBe(30)
    await store.update({ autoArchiveDays: null })
    expect(store.current().autoArchiveDays).toBeNull()
    expect(() => ChatSettings.parse({ promptSuggestions: true, autoArchiveDays: 0 })).toThrow()
  })

  it('lets an agent drive the user\'s own browser until the user turns it off', async () => {
    const store = new ChatSettingsStore(file, () => {})
    expect((await store.load()).userBrowser).toBe(true)
    await store.update({ userBrowser: false })
    expect((await new ChatSettingsStore(file, () => {}).load()).userBrowser).toBe(false)
  })

  it('lets agents read the user\'s history until the user turns it off', async () => {
    const store = new ChatSettingsStore(file, () => {})
    expect((await store.load()).readHistory).toBe(true)
    await store.update({ readHistory: false })
    expect((await new ChatSettingsStore(file, () => {}).load()).readHistory).toBe(false)
  })

  it('has agents note down to-dos until the user turns it off', async () => {
    const store = new ChatSettingsStore(file, () => {})
    expect((await store.load()).userTodos).toBe(true)
    await store.update({ userTodos: false })
    expect((await new ChatSettingsStore(file, () => {}).load()).userTodos).toBe(false)
  })

  it('keeps no wire log until the user turns it on', async () => {
    const store = new ChatSettingsStore(file, () => {})
    expect((await store.load()).wireLog).toBe(false)
    await store.update({ wireLog: true })
    expect((await new ChatSettingsStore(file, () => {}).load()).wireLog).toBe(true)
  })

  it('defaults title naming to the first turn and persists the mode and lightweight models', async () => {
    const store = new ChatSettingsStore(file, (settings) => changes.push(settings))
    expect((await store.load()).titleNaming).toBe('first')
    for (const titleNaming of ['first', 'latest', 'off'] as const) {
      await store.update({ titleNaming, titleModels: { claude: 'haiku' } })
      expect(await new ChatSettingsStore(file, () => {}).load()).toMatchObject({ titleNaming, titleModels: { claude: 'haiku' } })
    }
    await store.update({ promptSuggestions: false })
    expect(store.current().titleModels).toEqual({ claude: 'haiku' })
    await store.update({ titleModels: {} })
    expect(store.current().titleModels).toEqual({})
    expect(() => ChatSettings.partial().parse({ titleNaming: 'sometimes' })).toThrow()
    writeFileSync(file, JSON.stringify({ titleNaming: 'invalid', promptSuggestions: false }))
    expect(await new ChatSettingsStore(file, () => {}).load()).toMatchObject({ titleNaming: 'first', promptSuggestions: false })
  })

  it('loads the existing knowledge base as Obsidian', async () => {
    writeFileSync(file, JSON.stringify({ knowledgeBase: { path: '/notes/vault', write: true } }))
    const settings = await new ChatSettingsStore(file, () => {}).load()
    expect(settings.knowledgeBase).toEqual({ path: '/notes/vault', write: true })
    expect(knowledgeBaseKind(settings.knowledgeBase!)).toBe('obsidian')
  })

  it.each(['markdown', 'obsidian'] as const)('persists %s mode and keeps it for an older client changing write access', async (kind) => {
    const store = new ChatSettingsStore(file, () => {})
    await store.load()
    await store.update({ knowledgeBase: { path: '/notes', write: true, kind } })
    expect((await new ChatSettingsStore(file, () => {}).load()).knowledgeBase).toEqual({ path: '/notes', write: true, kind })
    await store.update({ knowledgeBase: { path: '/notes', write: false } })
    expect(store.current().knowledgeBase).toEqual({ path: '/notes', write: false, kind })
    expect((await new ChatSettingsStore(file, () => {}).load()).knowledgeBase).toEqual({ path: '/notes', write: false, kind })
    await store.update({ knowledgeBase: { path: '/other', write: true } })
    expect(knowledgeBaseKind(store.current().knowledgeBase!)).toBe('obsidian')
    await store.update({ knowledgeBase: null, autoArchiveDays: null, resetAnnouncements: true })
    expect((await new ChatSettingsStore(file, () => {}).load()).knowledgeBase).toBeNull()
  })

  it('switches formats without losing the folder or read-only choice', async () => {
    const store = new ChatSettingsStore(file, () => {})
    await store.load()
    await store.update({ knowledgeBase: { path: '/notes', write: false, kind: 'obsidian' } })
    await store.update({ knowledgeBase: { ...store.current().knowledgeBase!, kind: 'markdown' } })
    expect(store.current().knowledgeBase).toEqual({ path: '/notes', write: false, kind: 'markdown' })
    await store.update({ userBrowser: false })
    expect((await new ChatSettingsStore(file, () => {}).load()).knowledgeBase).toEqual({ path: '/notes', write: false, kind: 'markdown' })
  })
})
