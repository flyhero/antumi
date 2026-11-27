import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { cardMention, cardText, feishuCard, platformCard, type ChannelCard } from './channel-cards'

const Body = z.object({ elements: z.array(z.object({ tag: z.string(), content: z.string().optional(), text_size: z.string().optional(), elements: z.array(z.object({ tag: z.string() }).loose()).optional() }).loose()) })

const card: ChannelCard = {
  title: '待验收',
  tone: 'orange',
  sections: ['**#12345678 加导出**', '', '列表页加了导出按钮。'],
  buttons: [{ label: '通过', token: 'tok-accept', tone: 'primary' }, { label: '退回', token: 'tok-reject', tone: 'danger', confirm: '确定退回？' }],
  input: { name: 'reason', placeholder: '退回原因', maxLength: 500 },
  note: '只有主人能验收。'
}

describe('a card', () => {
  it('is a Feishu card that can be drawn again, its buttons carrying only their token', () => {
    const drawn = feishuCard(card)
    expect(drawn).toMatchObject({ schema: '2.0', config: { update_multi: true }, header: { title: { tag: 'plain_text', content: '待验收' }, template: 'orange' } })
    const json = JSON.stringify(drawn)
    expect(json).toContain('"value":{"t":"tok-accept"}')
    expect(json.match(/"value":\{[^}]*\}/g)).toEqual(['"value":{"t":"tok-accept"}', '"value":{"t":"tok-reject"}'])
    const { elements } = Body.parse(drawn.body)
    expect(elements.map((element) => element.tag)).toEqual(['markdown', 'markdown', 'form', 'markdown'])
    expect(elements[2]?.elements?.map((element) => element.tag)).toEqual(['input', 'column_set'])
    expect(elements[3]).toMatchObject({ content: '只有主人能验收。', text_size: 'notation' })
    expect(json).toContain('"form_action_type":"submit"')
    expect(json).toContain('"confirm":{"title":{"tag":"plain_text","content":"退回"},"text":{"tag":"plain_text","content":"确定退回？"}}')
  })

  it('puts buttons with no field to send in a row of their own, and has none when there are none', () => {
    const row = JSON.stringify(feishuCard({ ...card, input: undefined }))
    expect(row).not.toContain('"tag":"form"')
    expect(row).not.toContain('form_action_type')
    expect(JSON.stringify(feishuCard({ ...card, buttons: [] }))).not.toMatch(/"tag":"(form|button|input)"/)
  })

  it('is drawn only for a platform that has cards', () => {
    expect(platformCard('lark', card)).toEqual(feishuCard(card))
    expect(platformCard('slack', card)).toBeNull()
    expect(platformCard('dingtalk', card)).toBeNull()
  })

  it('shows someone else\'s words without the card\'s own tags, and cut to length', () => {
    expect(cardText('提醒 <at id=all></at> 和 <font color=red>红</font>')).toBe('提醒 <​at id=all><​/at> 和 <​font color=red>红<​/font>')
    expect(cardText('a < b')).toBe('a < b')
    expect(cardText('长'.repeat(10), 4)).toBe('长长长长…')
    expect(cardMention('ou_abc')).toBe('<at id=ou_abc></at>')
    expect(cardMention('ou_1></at><at id=all')).toBe('<at id=ou_1atatidall></at>')
  })
})
