import { describe, expect, it } from 'vitest'
import { CHANNEL_PLATFORMS, Channel, ChannelFields, ChannelInput, TaskChannelSource } from './channel'
import { CHANNEL_PLATFORM_DESCRIPTORS, channelPlatform } from './channel-platforms'
import { mobileMayCall } from './mobile-access'
import { rpcSchemas, type RpcMethod } from './rpc'

const PROFILE = '11111111-1111-4111-8111-111111111111'

describe('a channel', () => {
  it('lets nobody ask until someone is named', () => {
    const fields = ChannelFields.parse({ profileId: PROFILE, platform: 'slack' })
    expect(fields).toMatchObject({ enabled: true, projectPaths: [], allowedUsers: [], allowedPlaces: [], allowDirect: false, dailyPerUser: 20 })
    expect(fields.allowTaskCreation).toBeUndefined()
    expect(ChannelInput.parse({ profileId: PROFILE, platform: 'slack', allowTaskCreation: true }).allowTaskCreation).toBe(true)
  })

  it('keeps its tasks\' progress to itself until told otherwise, and a save without the switch leaves it', () => {
    expect(ChannelFields.parse({ profileId: PROFILE, platform: 'feishu' }).reportTasks).toBeUndefined()
    expect(ChannelInput.parse({ profileId: PROFILE, platform: 'feishu', reportTasks: true }).reportTasks).toBe(true)
  })

  it('never carries a credential to a client, only which are stored', () => {
    expect(Object.keys(Channel.shape)).not.toContain('credentials')
    expect(Channel.shape.stored).toBeDefined()
  })

  it('keeps a stored credential when a save leaves it out or null', () => {
    const input = ChannelInput.parse({ profileId: PROFILE, platform: 'slack', credentials: { appToken: 'xapp-1', botToken: null } })
    expect(input.credentials).toEqual({ appToken: 'xapp-1', botToken: null })
    expect(ChannelInput.parse({ profileId: PROFILE, platform: 'slack' }).credentials).toBeUndefined()
  })

  it('refuses limits outside what a person could mean', () => {
    for (const bad of [{ dailyPerUser: 0 }, { maxConcurrent: 6 }, { turnTimeoutSec: 5 }]) {
      expect(ChannelFields.safeParse({ profileId: PROFILE, platform: 'slack', ...bad }).success, JSON.stringify(bad)).toBe(false)
    }
  })
})

describe('a task from a chat platform', () => {
  const source = { channelId: '22222222-2222-4222-8222-222222222222', requestId: '33333333-3333-4333-8333-333333333333', conversationId: '44444444-4444-4444-8444-444444444444', platform: 'feishu', tenant: 'T', asker: 'ou_1', place: 'oc_1', messageId: 'om_1', text: '加个导出', createdAt: 1 }

  it('reads one saved before it knew its thread', () => {
    const parsed = TaskChannelSource.parse(source)
    expect(parsed.thread).toBeUndefined()
    expect(parsed.direct).toBeUndefined()
  })

  it('keeps the thread its answer went to, a direct chat\'s none', () => {
    expect(TaskChannelSource.parse({ ...source, thread: 'om_1', direct: false })).toMatchObject({ thread: 'om_1', direct: false })
    expect(TaskChannelSource.parse({ ...source, thread: null, direct: true })).toMatchObject({ thread: null, direct: true })
  })
})

describe('chat platforms', () => {
  it('describes every platform, with credentials to ask for', () => {
    for (const platform of CHANNEL_PLATFORMS) {
      const descriptor = channelPlatform(platform)
      expect(descriptor.credentials.length, platform).toBeGreaterThan(0)
      expect(descriptor.textLimit, platform).toBeGreaterThan(500)
    }
  })

  it('offers the platform\'s own tools only where the bot can use them, none of them a user\'s', () => {
    const tools = CHANNEL_PLATFORM_DESCRIPTORS.feishu.tools
    expect(tools.mcp).toBe('https://mcp.feishu.cn/mcp')
    expect(tools.catalog.map((tool) => tool.name)).toEqual(['fetch-doc', 'list-docs', 'get-comments', 'fetch-file', 'create-doc', 'update-doc', 'add-comments'])
    expect(tools.catalog.filter((tool) => tool.write).map((tool) => tool.name)).toEqual(['create-doc', 'update-doc', 'add-comments'])
    for (const platform of ['slack', 'lark', 'dingtalk'] as const) expect(channelPlatform(platform).tools, platform).toBeUndefined()
    expect(ChannelFields.parse({ profileId: PROFILE, platform: 'feishu' }).platformTools).toBeUndefined()
  })

  it('goes on in a thread without a mention only where the platform has threads, asking for every group message', () => {
    expect(CHANNEL_PLATFORMS.filter((platform) => channelPlatform(platform).features.followUps)).toEqual(['feishu', 'lark'])
    expect(channelPlatform('feishu').followUpScopes).toEqual(['im:message.group_msg'])
    expect(ChannelFields.parse({ profileId: PROFILE, platform: 'feishu' }).followUps).toBeUndefined()
  })

  it('gives Slack a manifest asking for no more than it uses', () => {
    const manifest = JSON.parse(CHANNEL_PLATFORM_DESCRIPTORS.slack.manifest)
    expect(manifest.oauth_config.scopes.bot).toEqual(['app_mentions:read', 'chat:write', 'reactions:write', 'im:history', 'files:read'])
    expect(manifest.settings.socket_mode_enabled).toBe(true)
    expect(manifest.settings.event_subscriptions.bot_events).toEqual(['app_mention', 'message.im'])
  })

  it('gives Feishu scopes to import that ask nothing of the user and read no contacts', () => {
    const { scopes } = JSON.parse(CHANNEL_PLATFORM_DESCRIPTORS.feishu.manifest)
    expect(scopes.user).toEqual([])
    expect(scopes.tenant).toContain('im:message.group_at_msg:readonly')
    expect(scopes.tenant.filter((scope: string) => scope.startsWith('contact:') || scope === 'im:message.group_msg')).toEqual([])
  })
})

describe('channels over RPC', () => {
  it('are no phone\'s to set up, read or run tools for', () => {
    const methods = (Object.keys(rpcSchemas) as RpcMethod[]).filter((method) => method.startsWith('channels.') || method.startsWith('channelTools.'))
    expect(methods).toEqual(['channels.list', 'channels.save', 'channels.remove', 'channels.requests', 'channels.toolCalls', 'channels.readiness', 'channels.taskReports', 'channels.taskFeedback', 'channels.continueTask', 'channelTools.call', 'channelTools.list'])
    for (const method of methods) expect(mobileMayCall(method, 'operate'), method).toBe(false)
  })
})
