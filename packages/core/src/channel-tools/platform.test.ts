import { describe, expect, it } from 'vitest'
import { MAX_PLATFORM_TEXT, agentToolName, callTarget, createdDoc, givenTools, placed, platformSpecs, platformToolOf, resultText, writesWith } from './platform'

describe('platform tools', () => {
  it('are named for the agent apart from Antumi\'s own, and only those a channel gives are known', () => {
    expect(agentToolName('create-doc')).toBe('lark_create_doc')
    expect(givenTools('feishu', ['fetch-doc', 'search-doc', 'made-up', 'fetch-doc'])).toEqual(['fetch-doc'])
    expect(givenTools('slack', ['fetch-doc'])).toEqual([])
    expect(givenTools('feishu', undefined)).toEqual([])
    expect(platformToolOf('lark_fetch_doc', ['fetch-doc'])).toBe('fetch-doc')
    expect(platformToolOf('lark_create_doc', ['fetch-doc'])).toBeNull()
    expect(writesWith('feishu', 'create-doc')).toBe(true)
    expect(writesWith('feishu', 'fetch-doc')).toBe(false)
  })

  it('put a document where the channel says, whatever the agent asked for', () => {
    const asked = { title: '方案', markdown: '# x', folder_token: 'fldEvil', wiki_space: 'my_library' }
    expect(placed(asked, null)).toEqual({ title: '方案', markdown: '# x' })
    expect(placed(asked, { kind: 'wikiNode', value: 'https://acme.feishu.cn/wiki/wikcnA' })).toEqual({ title: '方案', markdown: '# x', wiki_node: 'https://acme.feishu.cn/wiki/wikcnA' })
    expect(placed(asked, { kind: 'wikiSpace', value: '7000' })).toEqual({ title: '方案', markdown: '# x', wiki_space: '7000' })
    expect(placed(asked, { kind: 'folder', value: 'https://acme.feishu.cn/drive/folder/fldcnB?from=x' })).toEqual({ title: '方案', markdown: '# x', folder_token: 'fldcnB' })
    // Asking after an earlier create names no place at all.
    expect(placed({ task_id: 't1', wiki_node: 'x' }, { kind: 'folder', value: 'fldcnB' })).toEqual({ task_id: 't1' })
  })

  it('read a result as text, cut to length, an error as one', () => {
    expect(resultText({ content: [{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }] })).toEqual({ text: 'a\nb', isError: false })
    expect(resultText({ content: [{ type: 'text', text: 'denied' }], isError: true })).toEqual({ text: 'denied', isError: true })
    expect(resultText('nonsense')).toEqual({ text: '（没有返回内容）', isError: true })
    const long = resultText({ content: [{ type: 'text', text: '长'.repeat(MAX_PLATFORM_TEXT + 10) }] }).text
    expect(long.startsWith('长'.repeat(MAX_PLATFORM_TEXT))).toBe(true)
    expect(long).toContain('已截断')
  })

  it('find the document create-doc made, and name what a call was about', () => {
    const made = JSON.stringify({ doc_id: 'doxA', doc_url: 'https://acme.feishu.cn/docx/doxA', message: 'ok' })
    expect(createdDoc(made)).toEqual({ token: 'doxA', url: 'https://acme.feishu.cn/docx/doxA' })
    expect(createdDoc(JSON.stringify({ task_id: 't1' }))).toBeNull()
    expect(createdDoc('not json')).toBeNull()
    expect(callTarget('create-doc', { title: '方案' }, made)).toBe('create-doc https://acme.feishu.cn/docx/doxA')
    expect(callTarget('fetch-doc', { doc_id: 'doxB' }, '...')).toBe('fetch-doc doxB')
    expect(callTarget('list-docs', {}, '...')).toBe('list-docs')
  })

  it('are listed as the platform describes them, only those given', () => {
    const listed = { tools: [
      { name: 'fetch-doc', description: '读', inputSchema: { type: 'object', properties: { doc_id: { type: 'string' } } } },
      { name: 'update-doc', description: '改', inputSchema: { type: 'object' } }
    ] }
    expect(platformSpecs('feishu', ['fetch-doc'], listed)).toEqual([{ name: 'lark_fetch_doc', description: '飞书工具（以机器人身份）：读', inputSchema: { type: 'object', properties: { doc_id: { type: 'string' } } }, readOnly: true }])
    expect(platformSpecs('feishu', ['update-doc'], listed)[0]?.readOnly).toBe(false)
    expect(platformSpecs('feishu', ['fetch-doc'], { nope: 1 })).toEqual([])
    expect(platformSpecs('lark', ['fetch-doc'], listed)[0]?.description).toBe('Lark 工具（以机器人身份）：读')
    expect(givenTools('lark', ['fetch-doc', 'made-up'])).toEqual(['fetch-doc'])
  })
})
