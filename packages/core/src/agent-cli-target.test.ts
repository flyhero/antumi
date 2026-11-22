import { describe, expect, it } from 'vitest'
import type { Environment } from '@antumi/protocol'
import { cliCommandText, cliVersion, compareCliVersions, desktopCli, inside, latestCliVersion, resolveCliTarget, type CliTargetHost } from './agent-cli-target'

const environment: Environment = { checks: [{ tool: 'codex', status: 'ok', version: '1.0.0', path: '/bin/codex', signedIn: true }], searchPath: [], checkedAt: 0 }
function host(overrides: Partial<CliTargetHost> = {}): CliTargetHost {
  return { platform: 'darwin', home: '/home', canonical: async (file) => file, read: async () => { throw new Error('missing') }, run: async ({ args }) => {
    if (args[0] === '--version') return 'codex-cli 1.0.0'
    throw new Error('missing')
  }, ...overrides }
}

describe('CLI install identity and release versions', () => {
  it('keeps prerelease and Cursor build identities, without inventing an order for hashes', () => {
    expect(cliVersion('codex-cli 1.2.3-beta.4')).toBe('1.2.3-beta.4')
    expect(cliVersion('2026.10.19-6bbf2c4')).toBe('2026.10.19-6bbf2c4')
    expect(compareCliVersions('1.2.3-beta.4', '1.2.3')).toBe(-1)
    expect(compareCliVersions('1.2.10', '1.2.9')).toBe(1)
    expect(compareCliVersions('2026.10.19-aaa', '2026.10.19-bbb')).toBeNull()
    expect(compareCliVersions('2026.10.19-aaa', '2026.10.20-bbb')).toBe(-1)
    expect(compareCliVersions('unrecognized', '1.0.0')).toBeNull()
  })

  it('writes an upgrade a user can paste, keeping a path with spaces whole', () => {
    expect(cliCommandText({ command: 'npm', args: ['install', '-g', '@openai/codex@latest'] })).toBe('npm install -g @openai/codex@latest')
    expect(cliCommandText({ command: 'C:\\Users\\Jo Doe\\AppData\\Local\\pi\\pi.exe', args: ['update', '--self'] })).toBe('"C:\\Users\\Jo Doe\\AppData\\Local\\pi\\pi.exe" update --self')
  })

  it('uses path boundaries and recognizes app-owned binaries on both platforms', () => {
    expect(inside('/opt/package-other/bin', '/opt/package', 'linux')).toBe(false)
    expect(inside('C:\\Tools\\Pi\\bin.exe', 'c:\\tools\\pi', 'win32')).toBe(true)
    expect(desktopCli('/Applications/Codex.app/Contents/Resources/codex', 'darwin')).toBe(true)
    expect(desktopCli('C:\\Program Files\\WindowsApps\\Codex\\codex.exe', 'win32')).toBe(true)
  })

  it('never upgrades a desktop bundle or an arbitrary standalone executable', async () => {
    const target = await resolveCliTarget('codex', environment, host())
    expect(target).toMatchObject({ channel: 'unknown', command: null })
    const bundled = await resolveCliTarget('codex', environment, host({ canonical: async () => '/Applications/Codex.app/Contents/Resources/codex' }))
    expect(bundled).toMatchObject({ channel: 'desktop', command: null, latestUrl: null })
  })

  it.each(['npm', 'pnpm', 'bun'] as const)('proves %s ownership through the actual package bin', async (manager) => {
    const root = manager === 'bun' ? '/home/.bun/install/global/node_modules' : '/global/node_modules'
    const packageRoot = `${root}/@openai/codex`
    const target = await resolveCliTarget('codex', environment, host({
      canonical: async (file) => file === '/bin/codex' ? `${packageRoot}/bin/codex.js` : file,
      read: async (file) => {
        if (file !== `${packageRoot}/package.json`) throw new Error('wrong root')
        return JSON.stringify({ name: '@openai/codex', bin: { codex: 'bin/codex.js' } })
      },
      run: async ({ command, args }) => {
        if (args[0] === '--version') return 'codex-cli 1.0.0'
        if (command !== manager) throw new Error('not installed')
        return manager === 'bun' ? '/home/.bun/bin' : root
      }
    }))
    expect(target).toMatchObject({ channel: manager, command: { command: manager, args: [manager === 'npm' ? 'install' : 'add', '-g', '@openai/codex@latest'] } })
  })

  it('rejects a different package bin even when the package and manager exist', async () => {
    const target = await resolveCliTarget('codex', environment, host({ read: async () => JSON.stringify({ name: '@openai/codex', bin: 'other.js' }), run: async ({ args }) => args[0] === '--version' ? '1.0.0' : '/global/node_modules' }))
    expect(target?.command).toBeNull()
  })

  it('uses the owner of a package beneath a Homebrew node prefix, rather than upgrading the wrong cask', async () => {
    const root = '/opt/homebrew/lib/node_modules/@openai/codex'
    const target = await resolveCliTarget('codex', environment, host({ canonical: async (file) => file === '/bin/codex' ? `${root}/bin/codex.js` : file, read: async () => JSON.stringify({ name: '@openai/codex', bin: 'bin/codex.js' }), run: async ({ command, args }) => {
      if (args[0] === '--version') return '1.0.0'
      if (command === 'npm') return '/opt/homebrew/lib/node_modules'
      throw new Error('missing')
    } }))
    expect(target?.channel).toBe('npm')
  })

  it('proves a Homebrew cask against its installed prefix before selecting its updater', async () => {
    const target = await resolveCliTarget('codex', environment, host({
      canonical: async (file) => file === '/bin/codex' ? '/opt/homebrew/Caskroom/codex/1.0.0/codex' : file,
      run: async ({ command, args }) => {
        if (args[0] === '--version') return 'codex-cli 1.0.0'
        if (command !== 'brew') throw new Error('missing')
        if (args[0] === '--prefix') return '/opt/homebrew/Caskroom/codex'
        return JSON.stringify({ casks: [{ version: '2.0.0', installed: '1.0.0' }] })
      }
    }))
    expect(target).toMatchObject({ channel: 'homebrew', command: { command: 'brew', args: ['upgrade', '--cask', 'codex'] }, latestUrl: 'https://formulae.brew.sh/api/cask/codex.json' })
  })

  it('does not mistake a project-local package for a global installation', async () => {
    const target = await resolveCliTarget('codex', environment, host({
      canonical: async (file) => file === '/bin/codex' ? '/repo/node_modules/@openai/codex/bin/codex.js' : file,
      read: async () => JSON.stringify({ name: '@openai/codex', bin: 'bin/codex.js' }),
      run: async ({ args }) => args[0] === '--version' ? '1.0.0' : '/global/node_modules'
    }))
    expect(target).toMatchObject({ channel: 'unknown', command: null })
  })

  it('uses a proven native updater only when help advertises the command', async () => {
    const cursor: Environment = { ...environment, checks: [{ ...environment.checks[0]!, tool: 'cursor', path: '/home/.local/bin/agent' }] }
    const native = host({ canonical: async () => '/home/.local/share/cursor-agent/versions/2026.10.19/cursor-agent', run: async ({ args }) => args[0] === '--version' ? '2026.10.19-abc' : 'Commands:\n  update  Update Cursor' })
    expect(await resolveCliTarget('cursor', cursor, native)).toMatchObject({ channel: 'native', command: { args: ['update'] }, latestUrl: null })
    expect((await resolveCliTarget('cursor', cursor, { ...native, run: async () => '2026.10.19-abc' }))?.command).toBeNull()
  })

  it.each(['darwin', 'linux'] as const)('recognizes a linked Codex standalone installation on %s', async (platform) => {
    const selected = '/home/.local/bin/codex'
    const standalone: Environment = { ...environment, checks: [{ tool: 'codex', status: 'ok', version: '0.160.1', path: selected, signedIn: true }] }
    const native = host({
      platform,
      canonical: async (file) => file === selected ? '/home/.codex/packages/standalone/releases/0.160.1/bin/codex' : file,
      run: async ({ command, args }) => {
        if (command !== selected) throw new Error('missing')
        if (args[0] === '--version') return 'codex-cli 0.160.1'
        if (args[0] === '--help') return 'Commands:\n  update  Update Codex to the latest version'
        throw new Error('unexpected command')
      }
    })
    expect(await resolveCliTarget('codex', standalone, native)).toMatchObject({
      channel: 'native', version: '0.160.1', command: { command: selected, args: ['update'] },
      latestUrl: 'https://api.github.com/repos/openai/codex/releases/latest', tagPrefix: 'rust-v'
    })
    expect(await resolveCliTarget('codex', standalone, { ...native, run: async () => 'codex-cli 0.160.1' })).toMatchObject({ channel: 'unknown', command: null })
    expect(await resolveCliTarget('codex', standalone, { ...native, canonical: async () => '/home/.codex/packages/standalone-other/bin/codex' })).toMatchObject({ channel: 'unknown', command: null })
  })

  it('reads versions only from successful official metadata responses', async () => {
    const target = await resolveCliTarget('codex', environment, host())
    if (!target) throw new Error('no target')
    const feed = { ...target, latestUrl: 'https://api.github.com/repos/openai/codex/releases/latest', tagPrefix: 'rust-v' }
    expect(await latestCliVersion(feed, async () => new Response(JSON.stringify({ tag_name: 'rust-v1.2.3' })))).toBe('1.2.3')
    await expect(latestCliVersion(feed, async () => new Response('', { status: 503 }))).rejects.toThrow('agent-cli-network')
    expect(await latestCliVersion(feed, async () => new Response('{}'))).toBeNull()
  })
})
