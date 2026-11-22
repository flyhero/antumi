import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { codeartsEnv, codeartsInstallation, codeartsSignedIn, findCodearts } from './codearts-cli'
import { codearts } from './codearts-adapter'
import { codeartsSkillDirs } from './codearts-config'

let root: string
let home: string
beforeEach(() => {
  // Real, as the launcher found is: macOS keeps the temporary folder behind a link.
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'antumi-codearts-cli-')))
  home = path.join(root, 'home')
  mkdirSync(home)
})
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

// As its installer lays it out: the launcher script, and the executable in bin/ beside it.
function install(dir: string): { launcher: string; executable: string } {
  mkdirSync(path.join(dir, 'bin'), { recursive: true })
  const launcher = path.join(dir, 'codearts')
  const executable = path.join(dir, 'bin', 'codearts')
  writeFileSync(launcher, '#!/usr/bin/env bash\n', { mode: 0o755 })
  writeFileSync(executable, `#!${process.execPath}\nconsole.log('26.11.11')\n`, { mode: 0o755 })
  return { launcher, executable }
}

describe('CodeArts CLI', () => {
  it.skipIf(process.platform === 'win32')('runs the executable beside the launcher it finds, on PATH through a link or where its installer puts it', async () => {
    expect(await findCodearts('', process.platform, home)).toBeNull()
    const installed = install(path.join(home, '.codeartsdoer', 'installers'))
    expect(await findCodearts('', process.platform, home)).toEqual(installed)
    // A link on PATH leads to the installer's own folder.
    const bin = path.join(root, 'bin')
    mkdirSync(bin)
    symlinkSync(installed.launcher, path.join(bin, 'codearts'))
    expect(await findCodearts(bin, process.platform, home)).toEqual(installed)
    // A wrapper of the user's has no executable beside it: the installer's is used.
    rmSync(path.join(bin, 'codearts'))
    writeFileSync(path.join(bin, 'codearts'), `#!/bin/sh\nexec ${installed.launcher} "$@"\n`, { mode: 0o755 })
    expect(await findCodearts(bin, process.platform, home)).toEqual(installed)
    // Another installation on PATH comes first.
    const other = install(path.join(root, 'other'))
    expect(await findCodearts(path.dirname(other.launcher), process.platform, home)).toEqual(other)
  })

  it('sets what its launcher sets, without turning off certificate checks', () => {
    const env = codeartsEnv({}, '/home/me')
    expect(env).toMatchObject({ KERNEL_DATA_DIR: path.join('/home/me', '.codeartsdoer', 'cli-data'), KERNEL_CONFIG_DIR: path.join('/home/me', '.codeartsdoer'), OPENCODE_CONFIG: path.join('/home/me', '.codeartsdoer', 'codearts_cli.json'), SCENARIO: 'codeartsdoer', PLUGIN_ENV: 'hc' })
    expect(env).not.toHaveProperty('NODE_TLS_REJECT_UNAUTHORIZED')
    expect(codeartsEnv({ KERNEL_STATE_DIR: '/state' }, '/home/me').KERNEL_STATE_DIR).toBe('/state')
  })

  it('runs only with an access key in its environment, its own or Huawei Cloud’s', () => {
    expect(codeartsSignedIn({})).toBe(false)
    expect(codeartsSignedIn({ CODEARTS_CLI_AK: 'ak' })).toBe(false)
    expect(codeartsSignedIn({ CODEARTS_CLI_AK: 'ak', CODEARTS_CLI_SK: 'sk' })).toBe(true)
    expect(codeartsSignedIn({ HW_ACCESS_KEY: 'ak', HW_SECRET_KEY: 'sk' })).toBe(true)
  })

  it('offers its official install scripts and starts Antumi’s bridge with its agents and skills in the config', () => {
    expect(codeartsInstallation('win32')).toMatchObject({ shell: 'powershell', command: expect.stringMatching(/install\.ps1 \| iex$/) })
    expect(codeartsInstallation('darwin')).toMatchObject({ shell: 'bash', command: expect.stringContaining('install.sh') })
    expect(codeartsInstallation('aix')).toBeNull()
    const command = codearts.command({ providerSessionId: null, resume: false, handoffPath: null, extraProjects: [], skills: { dir: '/skills' } })
    expect(command).toMatchObject({ command: process.execPath, args: expect.arrayContaining([expect.stringMatching(/codearts-bridge-main\.ts$/)]), env: { SCENARIO: 'codeartsdoer' } })
    expect(JSON.parse(command.env?.OPENCODE_CONFIG_CONTENT ?? '{}')).toMatchObject({ skills: { paths: [path.join('/skills', '.agents', 'skills')] } })
  })
})

describe('CodeArts skill folders', () => {
  it('puts the project\'s first, then the user\'s, then Antumi\'s library, each once', () => {
    const library = path.join('/skills', '.agents', 'skills')
    expect(codeartsSkillDirs('/work', '/home/me', [library, path.join('/work', '.codeartsdoer', 'skills')])).toEqual([
      path.join('/work', '.codeartsdoer', 'skills'), path.join('/home/me', '.codeartsdoer', 'skills'), library
    ])
  })
})
