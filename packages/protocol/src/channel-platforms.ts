import type { ChannelCredentialKey, ChannelPlatform } from './channel'

// One of a platform's own tools an agent may be given to use as the bot (docs/CHANNEL-LOOP.md): its
// name on the platform, whether it can change something, and the scopes the app needs for it.
export type PlatformTool = { name: string; write: boolean; label: string; scopes: readonly string[]; translations?: { en: { label: string } } }

// Everything core and the desktop know of one chat platform beyond its connector: a platform is
// added by an entry here, a connector in core's gateway and a formatter (docs/CHANNELS.md, 扩展点).
export type ChannelPlatformDescriptor = {
  label: string
  // What the user pastes in to connect, in the order asked. prefix: how a real one starts, to catch
  // two pasted the wrong way round.
  credentials: readonly { key: ChannelCredentialKey; label: string; prefix?: string }[]
  // Where its apps are made, and what to paste there to make one with everything set.
  console: string
  manifest?: string
  // One message's longest text, and the least time between two posts in one place.
  textLimit: number
  minGapMs: number
  // cards: buttons on a message, their clicks reported back (docs/CHANNEL-LOOP.md).
  features: { reactions: boolean; cards: boolean }
  // The platform's hosted MCP its tools are reached through, those that may be given, and the scope
  // giving the asker access to a document the bot made needs. The catalog only names and groups
  // them: what each takes is what the platform lists.
  tools?: { mcp: string; catalog: readonly PlatformTool[]; accessScopes: readonly string[] }
}

const SLACK_MANIFEST = JSON.stringify({
  display_information: { name: 'Antumi' },
  features: {
    bot_user: { display_name: 'Antumi', always_online: false },
    app_home: { messages_tab_enabled: true, messages_tab_read_only_enabled: false }
  },
  oauth_config: { scopes: { bot: ['app_mentions:read', 'chat:write', 'reactions:write', 'im:history', 'files:read'] } },
  settings: {
    event_subscriptions: { bot_events: ['app_mention', 'message.im'] },
    interactivity: { is_enabled: false },
    org_deploy_enabled: false,
    socket_mode_enabled: true,
    token_rotation_enabled: false
  }
}, null, 2)

// Pasted into 权限管理 → 批量导入/导出权限. Images are read through im:message:readonly, the
// narrowest scope the message resource API takes; the company's name and key need tenant:tenant:readonly.
const FEISHU_SCOPES = JSON.stringify({
  scopes: {
    tenant: ['im:message.group_at_msg:readonly', 'im:message.p2p_msg:readonly', 'im:message:send_as_bot', 'im:message.reactions:write_only', 'im:message:readonly', 'tenant:tenant:readonly'],
    user: []
  }
}, null, 2)

const DOC_WRITE_SCOPES = ['docx:document:create', 'docx:document:write_only', 'docx:document:readonly', 'wiki:node:read', 'wiki:node:create', 'docs:document.media:upload', 'board:whiteboard:node:create']
// Feishu's hosted MCP as the bot (tenant token) may use it: search-doc and search-user take a user's.
const FEISHU_TOOLS = [
  { name: 'fetch-doc', write: false, label: '读文档', scopes: ['docx:document:readonly', 'task:task:read', 'im:chat:read'], translations: { en: { label: 'Read documents' } } },
  { name: 'list-docs', write: false, label: '浏览知识库目录', scopes: ['wiki:wiki:readonly'], translations: { en: { label: 'Browse wiki pages' } } },
  { name: 'get-comments', write: false, label: '读文档评论', scopes: ['docs:document.comment:read', 'contact:contact.base:readonly'], translations: { en: { label: 'Read comments' } } },
  { name: 'fetch-file', write: false, label: '读文档里的图片和附件', scopes: ['docs:document.media:download', 'board:whiteboard:node:read'], translations: { en: { label: 'Read images and attachments' } } },
  { name: 'create-doc', write: true, label: '新建文档', scopes: DOC_WRITE_SCOPES, translations: { en: { label: 'Create documents' } } },
  { name: 'update-doc', write: true, label: '修改文档', scopes: DOC_WRITE_SCOPES, translations: { en: { label: 'Edit documents' } } },
  { name: 'add-comments', write: true, label: '发评论', scopes: ['docs:document.comment:create'], translations: { en: { label: 'Comment on documents' } } }
] satisfies PlatformTool[]

export const CHANNEL_PLATFORM_DESCRIPTORS = {
  slack: {
    label: 'Slack',
    credentials: [
      { key: 'appToken', label: 'App-Level Token', prefix: 'xapp-' },
      { key: 'botToken', label: 'Bot User OAuth Token', prefix: 'xoxb-' }
    ],
    console: 'https://api.slack.com/apps?new_app=1',
    manifest: SLACK_MANIFEST,
    textLimit: 3500,
    minGapMs: 1100,
    // Block Kit buttons are not wired yet.
    features: { reactions: true, cards: false }
  },
  feishu: {
    label: '飞书',
    credentials: [
      { key: 'appId', label: 'App ID', prefix: 'cli_' },
      { key: 'appSecret', label: 'App Secret' }
    ],
    console: 'https://open.feishu.cn/app',
    manifest: FEISHU_SCOPES,
    // A rich-text message holds 30 KB, a Chinese character three of them.
    textLimit: 4000,
    // Five messages a second to one chat, shared by every bot in it.
    minGapMs: 250,
    features: { reactions: true, cards: true },
    tools: { mcp: 'https://mcp.feishu.cn/mcp', catalog: FEISHU_TOOLS, accessScopes: ['docs:permission.member:create'] }
  },
  // Feishu outside China: the same platform, apps and limits, on its own domain.
  lark: {
    label: 'Lark',
    credentials: [
      { key: 'appId', label: 'App ID', prefix: 'cli_' },
      { key: 'appSecret', label: 'App Secret' }
    ],
    console: 'https://open.larksuite.com/app',
    manifest: FEISHU_SCOPES,
    textLimit: 4000,
    minGapMs: 250,
    features: { reactions: true, cards: true }
  },
  dingtalk: {
    label: '钉钉',
    // Its Client ID and Client Secret, stored under the same names as Feishu's App ID and Secret.
    credentials: [
      { key: 'appId', label: 'Client ID', prefix: 'ding' },
      { key: 'appSecret', label: 'Client Secret' }
    ],
    console: 'https://open-dev.dingtalk.com/fe/app',
    // A robot's message takes 15000 bytes, a Chinese character three of them.
    textLimit: 3500,
    // Twenty messages a minute from a robot to one chat.
    minGapMs: 3100,
    // A robot has no way to react to a message; interactive cards are not wired yet.
    features: { reactions: false, cards: false }
  }
} satisfies Record<ChannelPlatform, ChannelPlatformDescriptor>

export function channelPlatform(platform: ChannelPlatform): ChannelPlatformDescriptor {
  return CHANNEL_PLATFORM_DESCRIPTORS[platform]
}
