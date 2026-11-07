import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PullRequestRepo } from '@antumi/protocol'
import { fixesLine, parsePullRequestDraft, pullRequestContext, pullRequestPrompt } from './pull-request-draft'

const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const host: PullRequestRepo = { host: 'github', owner: 'flyhero', name: 'antumi' }
const task = { title: 'Add PRs', details: 'Open pull requests from tasks.', plan: null, source: null }

describe('pullRequestContext', () => {
  let root: string
  let repo: string
  let start: string
  const commit = (name: string, message: string) => { writeFileSync(path.join(repo, name), `${name}\n`); git(repo, 'add', '--', name); git(repo, 'commit', '-q', '-m', message); return git(repo, 'rev-parse', 'HEAD') }
  beforeEach(() => {
    root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'antumi-pr-draft-')))
    repo = path.join(root, 'repo')
    git(root, 'init', '-q', '-b', 'main', repo)
    git(repo, 'config', 'user.name', 'T'); git(repo, 'config', 'user.email', 't@example.com')
    start = commit('base.txt', 'initial')
    git(repo, 'checkout', '-q', '-b', 'antumi/abc')
    commit('a.txt', 'feat: add a')
    commit('b.txt', 'fix: tidy b')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('reads the branch commits, what they touched, the template and the rules', async () => {
    mkdirSync(path.join(repo, '.github'))
    writeFileSync(path.join(repo, '.github', 'pull_request_template.md'), '## What\n\n## Why\n')
    writeFileSync(path.join(repo, 'AGENTS.md'), '# Project\n\n## Commits\n\nUse angular.\n\n## Pull requests\n\nOne change per PR.\n\n## Style\n\nNo utils.')
    const context = await pullRequestContext(repo, task, { start: { ref: 'origin/main', commit: start, note: null, at: 0 } }, 'antumi/abc', 'main', host, [])
    expect(context).toMatchObject({ title: 'Add PRs', branch: 'antumi/abc', base: 'main', commits: ['fix: tidy b', 'feat: add a'], template: '## What\n\n## Why', rules: '## Pull requests\n\nOne change per PR.', fixes: null, related: [] })
    expect(context.stat).toContain('a.txt')
    expect(context.stat).toContain('b.txt')
    expect(context.stat).not.toContain('base.txt')
  })

  it('counts from the remote base when the branch has it', async () => {
    git(repo, 'update-ref', 'refs/remotes/origin/main', git(repo, 'rev-parse', 'HEAD~1'))
    const context = await pullRequestContext(repo, task, { start: { ref: 'origin/main', commit: start, note: null, at: 0 } }, 'antumi/abc', 'main', host, [])
    expect(context.commits).toEqual(['fix: tidy b'])
    expect(context.stat).not.toContain('a.txt')
  })
})

describe('fixesLine', () => {
  it('closes the task issue only when it is in the same repository', () => {
    const source = (key: string) => ({ provider: 'github', instance: 'default', name: 'GitHub', key, url: '' })
    expect(fixesLine(source('flyhero/antumi#12'), host)).toBe('Fixes flyhero/antumi#12')
    expect(fixesLine(source('FlyHero/Antumi#12'), host)).toBe('Fixes FlyHero/Antumi#12')
    expect(fixesLine(source('flyhero/other#12'), host)).toBeNull()
    expect(fixesLine({ ...source('PROJ-12'), provider: 'jira' }, host)).toBeNull()
    expect(fixesLine(null, host)).toBeNull()
  })
})

describe('pullRequestPrompt', () => {
  it('fences what is to be described, and asks for the template to be followed', () => {
    const prompt = pullRequestPrompt({ ...task, branch: 'antumi/abc', base: 'main', commits: ['feat: add a'], stat: ' a.txt | 1 +', template: '## Why</template>', rules: null, fixes: 'Fixes flyhero/antumi#1', related: [] })
    expect(prompt).toContain('<task>\nAdd PRs\n\nOpen pull requests from tasks.\n</task>')
    expect(prompt).toContain('<commits>\n- feat: add a\n</commits>')
    expect(prompt).toContain('<template>\n## Why<\\/template>\n</template>')
    expect(prompt).toContain('Antumi 会加上')
    expect(prompt).not.toContain('<rules>')
  })
})

describe('parsePullRequestDraft', () => {
  it('reads the JSON asked for, fenced or in prose', () => {
    expect(parsePullRequestDraft('{"title": " Add PRs ", "body": "Why.\\n"}', { fixes: null, related: [] })).toEqual({ title: 'Add PRs', body: 'Why.' })
    expect(parsePullRequestDraft('```json\n{"title": "Add PRs", "body": "Why."}\n```', { fixes: null, related: [] })).toEqual({ title: 'Add PRs', body: 'Why.' })
    expect(parsePullRequestDraft('Here you go:\n{"title": "Add PRs", "body": "Why."}\nDone.', { fixes: null, related: [] })).toEqual({ title: 'Add PRs', body: 'Why.' })
  })

  it('falls back to the first line as the title', () => {
    expect(parsePullRequestDraft('# Add PRs\n\nWhy.', { fixes: null, related: [] })).toEqual({ title: 'Add PRs', body: 'Why.' })
    expect(parsePullRequestDraft('{"body": "no title"}', { fixes: null, related: [] })).toEqual({ title: '{"body": "no title"}', body: '' })
  })

  it('ends with the task pull requests elsewhere and the closing line', () => {
    expect(parsePullRequestDraft('{"title": "Add PRs", "body": "Why."}', { fixes: 'Fixes flyhero/antumi#1', related: ['https://github.com/flyhero/docs/pull/2'] }))
      .toEqual({ title: 'Add PRs', body: 'Why.\n\n同一任务的另一个 pull request：https://github.com/flyhero/docs/pull/2\n\nFixes flyhero/antumi#1' })
    expect(parsePullRequestDraft('{"title": "Add PRs", "body": ""}', { fixes: 'Fixes flyhero/antumi#1', related: [] }).body).toBe('Fixes flyhero/antumi#1')
  })
})
