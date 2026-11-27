import { describe, expect, it } from 'vitest'
import { EMPTY_WRITEBACK } from '@antumi/protocol'
import { channelReportInstruction, condensedReport, condensePrompt, reportInstruction } from './source-report-prompt'

describe('source report prompts', () => {
  it('tells the agent who reads the summary, how long it runs and what stays out, with the source’s own wishes', () => {
    const text = reportInstruction('Jira', { ...EMPTY_WRITEBACK, review: { status: '', comment: true }, guidance: '附上测试环境地址' })
    expect(text).toContain('Jira')
    expect(text).toContain('2 到 4 句')
    expect(text).toContain('commit 号')
    expect(text).toContain('附上测试环境地址')
    expect(text).toContain('作为评论发到事项上')
    expect(reportInstruction('Jira', null)).not.toContain('额外要求')
  })

  it('writes a chat task\'s summary for the colleague who asked, in their words', () => {
    const text = channelReportInstruction('飞书')
    expect(text).toContain('飞书')
    expect(text).toContain('原话题')
    expect(text).toContain('用提问人原话的语言')
    expect(text).not.toContain('事项原文')
    const prompt = condensePrompt('飞书', '改好了', '', 'chat')
    expect(prompt).toContain('聊天话题')
    expect(prompt).toContain('用提问人原话的语言')
    expect(condensePrompt('Jira', '改好了')).toContain('事项上的完成评论')
    expect(condensePrompt('Jira', '改好了')).toContain('用事项原文的语言')
  })

  it('fences the reply off as material for a new piece of writing', () => {
    const prompt = condensePrompt('Linear', '## 改动\n- login.js\n要不要我推送？')
    expect(prompt).toContain('不是继续下面的对话')
    expect(prompt).toMatch(/<agent-reply>\n## 改动[\s\S]*<\/agent-reply>$/)
  })

  it('takes the small model’s wrapping off its answer and refuses one too long to be a summary', () => {
    expect(condensedReport('以下是评论：\n\n「登录后回到原页面。」')).toBe('登录后回到原页面。')
    expect(condensedReport('```\nDone in PR #3.\n```')).toBe('Done in PR #3.')
    expect(condensedReport('<think>hmm</think>\nFixed.')).toBe('Fixed.')
    expect(condensedReport('   ')).toBeNull()
    expect(condensedReport('长'.repeat(601))).toBeNull()
  })
})
