import { describe, expect, it } from 'vitest'
import { chatCommand } from './conversation-command'

describe('chatCommand', () => {
  it('gives Codex Antumi\'s tools and hides the ChatGPT app\'s browser beside them', () => {
    const mcp = { command: 'node', args: ['mcp.mjs', '--home', '/k'] }
    const args = chatCommand('codex', null, false, null, [], { mcp }).args
    expect(args.slice(0, 5)).toEqual(['app-server', '-c', 'mcp_servers.antumi.command="node"', '-c', 'mcp_servers.antumi.args=["mcp.mjs","--home","/k"]'])
    expect(args).toEqual(expect.arrayContaining(['-c', 'mcp_servers.cua_repl={command="/usr/bin/true",enabled=false}']))
    // Without Antumi's tools there is nothing to choose between, and nothing is hidden.
    expect(chatCommand('codex', null, false, null, []).args).toEqual(['app-server'])
  })

  it('starts Claude with what the conversation chose, and bypass only when allowed now', () => {
    const args = chatCommand('claude', 'session-1', true, null, [], { preferred: { permissionMode: 'plan', model: 'sonnet', effort: 'high' } }).args
    expect(args).toEqual(expect.arrayContaining(['--permission-mode', 'plan', '--model', 'sonnet', '--effort', 'high', '--resume', 'session-1']))
    expect(args).not.toContain('--allow-dangerously-skip-permissions')
    expect(chatCommand('claude', 's', false, null, [], { preferred: { permissionMode: 'bypass' } }).args).not.toContain('--permission-mode')
    const allowed = chatCommand('claude', 's', false, null, [], { preferred: { permissionMode: 'bypass' }, allowBypass: true }).args
    expect(allowed).toEqual(expect.arrayContaining(['--allow-dangerously-skip-permissions', '--permission-mode', 'bypassPermissions']))
    // Asking is passed as manual, so a default mode in Claude Code's settings cannot override it.
    expect(chatCommand('claude', 's', false, null, [], { preferred: { permissionMode: 'ask' } }).args).toEqual(expect.arrayContaining(['--permission-mode', 'manual']))
    expect(chatCommand('claude', 's', false, null, []).args).not.toContain('--permission-mode')
  })

  it('gives each agent the user\'s MCP servers beside Antumi\'s, asking about their tools as for any other', () => {
    const userMcp = [
      { name: 'github', type: 'stdio' as const, command: 'node', args: ['mcp.mjs', '--run', 'github'] },
      { name: 'docs', type: 'http' as const, url: 'https://mcp.example.com/mcp' }
    ]
    const mcp = { command: 'node', args: ['mcp.mjs'] }
    const claude = chatCommand('claude', 's', false, null, [], { mcp, userMcp }).args
    expect(JSON.parse(claude[claude.indexOf('--mcp-config') + 1] ?? '{}')).toEqual({ mcpServers: {
      antumi: { type: 'stdio', command: 'node', args: ['mcp.mjs'] },
      github: { type: 'stdio', command: 'node', args: ['mcp.mjs', '--run', 'github'] },
      docs: { type: 'http', url: 'https://mcp.example.com/mcp' }
    } })
    expect(claude).not.toContain('--strict-mcp-config')
    expect(claude[claude.indexOf('--allowedTools') + 1]).not.toContain('github')
    // Without Antumi's server the user's still go.
    expect(chatCommand('claude', 's', false, null, [], { userMcp }).args).toContain('--mcp-config')
    expect(chatCommand('codex', null, false, null, [], { userMcp }).args).toEqual([
      'app-server',
      '-c', 'mcp_servers.github={command="node",args=["mcp.mjs","--run","github"]}',
      '-c', 'mcp_servers.docs={url="https://mcp.example.com/mcp"}'
    ])
  })

  it('starts the packaged MCP launcher with the env it needs, which no wrapper could add on Windows', () => {
    const env = { ELECTRON_RUN_AS_NODE: '1' }
    const mcp = { command: 'Antumi.exe', args: ['mcp.mjs'], env }
    const userMcp = [{ name: 'github', type: 'stdio' as const, command: 'Antumi.exe', args: ['mcp.mjs', '--run', 'github'], env }]
    const claude = chatCommand('claude', 's', false, null, [], { mcp, userMcp }).args
    expect(JSON.parse(claude[claude.indexOf('--mcp-config') + 1] ?? '{}')).toMatchObject({ mcpServers: { antumi: { env }, github: { env } } })
    expect(chatCommand('codex', null, false, null, [], { mcp, userMcp }).args).toEqual(expect.arrayContaining([
      '-c', 'mcp_servers.antumi.env={"ELECTRON_RUN_AS_NODE"="1"}',
      '-c', 'mcp_servers.github={command="Antumi.exe",args=["mcp.mjs","--run","github"],env={"ELECTRON_RUN_AS_NODE"="1"}}'
    ]))
  })

  it('lets Claude show a file, read its own terminals and the user\'s history without asking', () => {
    const args = chatCommand('claude', 's', false, null, [], { mcp: { command: 'node', args: ['mcp.mjs'] } }).args
    const allowed = args[args.indexOf('--allowedTools') + 1]?.split(',') ?? []
    expect(allowed).toEqual(expect.arrayContaining(['mcp__antumi__show_preview', 'mcp__antumi__terminal_read', 'mcp__antumi__history_list', 'mcp__antumi__history_read']))
    expect(allowed).not.toContain('mcp__antumi__terminal_run')
  })

  it('gives Cursor each extra project as a workspace root before its ACP server', () => {
    expect(chatCommand('cursor', null, false, null, ['/code/web', '/code/api']).args).toEqual(['--add-dir', '/code/web', '--add-dir', '/code/api', 'acp'])
    expect(chatCommand('cursor', null, false, null).args).toEqual(['acp'])
  })

  it('lets Claude drive the user\'s Chrome as the setting says, either way, and leaves Codex as it is', () => {
    expect(chatCommand('claude', 's', false, null, [], { userBrowser: true }).args).toContain('--chrome')
    expect(chatCommand('claude', 's', false, null, [], { userBrowser: false }).args).toContain('--no-chrome')
    // Unset (a catalog probe) leaves Claude Code's own default.
    expect(chatCommand('claude', 's', false, null, []).args.filter((arg) => arg.endsWith('chrome'))).toEqual([])
    expect(chatCommand('codex', null, false, null, [], { userBrowser: true }).args).toEqual(['app-server'])
  })

  it('gives each agent the user\'s vault as its own folder, writable where the stage may write, and says where it is', () => {
    const vault = { path: '/notes/vault', write: true }
    const claude = chatCommand('claude', 's', false, null, ['/code/web'], { knowledgeBase: vault }).args
    expect(claude).toEqual(expect.arrayContaining(['--add-dir', '/code/web', '--add-dir', '/notes/vault', '--append-system-prompt', expect.stringContaining('/notes/vault')]))
    expect(claude).not.toContain('--allowedTools')
    // Where it may not write, the vault is readable without asking, and not a working folder.
    const fenced = chatCommand('claude', 's', false, null, [], { planOnly: { dirs: ['/code/app'] }, knowledgeBase: { ...vault, write: false } }).args
    expect(fenced).not.toContain('--add-dir')
    expect(fenced[fenced.indexOf('--allowedTools') + 1]).toContain('Read(//notes/vault/**)')
    expect(fenced).toEqual(expect.arrayContaining(['--append-system-prompt', expect.stringContaining('/notes/vault')]))
    // Codex hears of it in its config; the root itself goes with each turn.
    expect(chatCommand('codex', null, false, null, [], { knowledgeBase: vault }).args).toEqual(['app-server', '-c', expect.stringMatching(/^developer_instructions=".*\/notes\/vault.*"$/)])
    expect(chatCommand('cursor', null, false, null, ['/code/web'], { knowledgeBase: vault }).args).toEqual(['--add-dir', '/code/web', '--add-dir', '/notes/vault', 'acp'])
    expect(chatCommand('cursor', null, false, null, [], { knowledgeBase: { ...vault, write: false } }).args).toEqual(['acp'])
    // Without one, nothing changes.
    expect(chatCommand('claude', 's', false, null, []).args).not.toContain('--append-system-prompt')
  })

  it('lets a read-only Claude worker read anywhere without asking, and only it', () => {
    const allowed = (args: string[]) => args[args.indexOf('--allowedTools') + 1]?.split(',') ?? []
    expect(allowed(chatCommand('claude', 's', false, null, [], { readOnly: { dirs: ['/code/app'] }, preferred: { permissionMode: 'ask' } }).args)).toEqual(expect.arrayContaining(['Read', 'Glob', 'Grep']))
    expect(allowed(chatCommand('claude', 's', false, null, [], { planOnly: { dirs: ['/code/app'] } }).args)).not.toContain('Read')
    expect(chatCommand('claude', 's', false, null, []).args).not.toContain('--allowedTools')
  })

  it('tells each agent with Antumi\'s tools when to note down what is left for the user, beside its vault', () => {
    const mcp = { command: 'node', args: ['mcp.mjs'] }
    const vault = { path: '/notes/vault', write: true }
    const claude = chatCommand('claude', 's', false, null, [], { mcp, knowledgeBase: vault }).args
    // One system prompt carries both notes.
    expect(claude.filter((arg) => arg === '--append-system-prompt')).toHaveLength(1)
    const note = claude[claude.indexOf('--append-system-prompt') + 1]
    expect(note).toContain('/notes/vault')
    expect(note).toContain('user_todo_add')
    expect(claude[claude.indexOf('--allowedTools') + 1]).toContain('mcp__antumi__user_todo_add')
    expect(chatCommand('codex', null, false, null, [], { mcp }).args).toContainEqual(expect.stringMatching(/^developer_instructions=".*user_todo_add.*"$/))
    // Without Antumi's tools there is nothing to note them down with.
    expect(chatCommand('claude', 's', false, null, []).args).not.toContain('--append-system-prompt')
  })

  it('leaves the to-dos out when the user turned them off', () => {
    const mcp = { command: 'node', args: ['mcp.mjs'] }
    const claude = chatCommand('claude', 's', false, null, [], { mcp, todos: false }).args
    expect(claude).not.toContain('--append-system-prompt')
    expect(claude[claude.indexOf('--allowedTools') + 1]).not.toContain('user_todo')
    expect(chatCommand('codex', null, false, null, [], { mcp, todos: false }).args.join(' ')).not.toContain('user_todo')
  })

  it('hands Antumi\'s skills to the agents that load a folder of them, each its own way', () => {
    const skills = { dir: '/antumi/skills/bundles/abc' }
    expect(chatCommand('claude', 's', false, null, [], { skills }).args).toEqual(expect.arrayContaining(['--plugin-dir', '/antumi/skills/bundles/abc']))
    expect(chatCommand('claude', 's', false, null, [], { skills }).args).not.toContain('--add-dir')
    expect(chatCommand('cursor', null, false, null, ['/code/web'], { skills }).args).toEqual(['--add-dir', '/code/web', '--add-dir', '/antumi/skills/bundles/abc', 'acp'])
    expect(chatCommand('codex', null, false, null, [], { skills }).args).toEqual(['app-server'])
    expect(chatCommand('claude', 's', false, null, []).args).not.toContain('--plugin-dir')
  })

  it.each(['markdown', 'obsidian'] as const)('passes %s instructions to Claude and Codex without changing folder access', (kind) => {
    const base = { path: '/notes', write: true, kind }
    const format = kind === 'markdown' ? '普通 Markdown' : 'Obsidian Markdown'
    const claude = chatCommand('claude', null, false, null, [], { knowledgeBase: base }).args
    expect(claude).toEqual(expect.arrayContaining(['--add-dir', '/notes', '--append-system-prompt', expect.stringContaining(format)]))
    const codex = chatCommand('codex', null, false, null, [], { knowledgeBase: base }).args
    expect(codex).toEqual(['app-server', '-c', expect.stringContaining(format)])
  })

  it('starts a Claude stage that may only plan in plan mode, its folders not editable and no bypass', () => {
    const args = chatCommand('claude', 's', false, null, ['/code/web'], {
      preferred: { permissionMode: 'acceptEdits' },
      allowBypass: true,
      planOnly: { dirs: ['/code/app', '/code/web'] },
      readable: ['/antumi/attachments/a.png']
    }).args
    expect(args).toEqual(expect.arrayContaining(['--permission-mode', 'plan', '--disallowedTools', 'Edit(//code/app/**),Edit(//code/web/**)']))
    expect(args).not.toContain('--allow-dangerously-skip-permissions')
    // One list of what it may read: its images and git history.
    expect(args.filter((arg) => arg === '--allowedTools')).toHaveLength(1)
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('Read(//antumi/attachments/a.png),Bash(git log:*),Bash(git diff:*),Bash(git show:*)')
  })
})
