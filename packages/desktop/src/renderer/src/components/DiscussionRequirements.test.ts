import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DISCUSSION_REQUIREMENTS, MAX_DISCUSSION_REQUIREMENTS } from '@antumi/protocol'
import { DiscussionRequirements } from './DiscussionRequirements'
import { DISCUSSION_REQUIREMENT_PRESETS } from '../discussion-requirements'

const render = (value: string) => renderToStaticMarkup(createElement(DiscussionRequirements, { value, onChange: () => {} }))

describe('discussion requirements field', () => {
  it('makes the shared defaults editable without a title or signature restriction', () => {
    const html = render(DEFAULT_DISCUSSION_REQUIREMENTS)
    expect(html).toContain('简洁讨论')
    expect(html).toContain('600 字')
    expect(html).toContain(`maxLength="${MAX_DISCUSSION_REQUIREMENTS}"`)
    expect(html).not.toContain('不要写标题或署名')
  })

  it('shows custom or empty content without reapplying a preset', () => {
    expect(render('请使用标题和表格')).toContain('自定义')
    expect(render('请使用标题和表格')).not.toContain('600 字')
    expect(render('')).toContain('使用预设')
    expect(render('')).not.toContain('600 字')
    expect(render('')).toContain('清空后不加额外要求')
  })

  it("names a debate's requirements as such only where a round table can take them", () => {
    const debate = DISCUSSION_REQUIREMENT_PRESETS.find((preset) => preset.id === 'debate')?.text ?? ''
    expect(renderToStaticMarkup(createElement(DiscussionRequirements, { value: debate, onChange: () => {}, roundtable: true }))).toContain('正反辩论')
    expect(render(debate)).toContain('自定义')
  })
})

