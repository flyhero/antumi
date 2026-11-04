import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DiffLines } from './DiffLines'

const patch = ['--- a/x.txt', '+++ b/x.txt', '@@ -4,2 +4,2 @@', ' same', '-before', '+after'].join('\n')

describe('DiffLines', () => {
  it('lays a diff side by side: the old file\'s numbers and lines on the left, the new on the right', () => {
    const html = renderToStaticMarkup(createElement(DiffLines, { patch, path: 'x.txt', split: true }))
    const pairs = [...html.matchAll(/<div class="diff-split-pair">(.*?)<\/div><\/div>(?=<div|$)/g)].map((match) => match[1]?.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|'))
    expect(pairs).toEqual(['|4|same|4|same|', '|5|before|5|after|'])
    // The marks a side already says are left out; the file header still spans both.
    expect(html).not.toContain('>-before')
    expect(html).toContain('<div class="diff-split-full diff-meta">--- a/x.txt</div>')
  })

  it('keeps one line per row, marks and all, unless asked for the split', () => {
    const html = renderToStaticMarkup(createElement(DiffLines, { patch, path: 'x.txt' }))
    expect(html).toMatch(/^<pre class="diff-view">/)
    expect(html).toContain('<div class="diff-del">-before</div>')
  })
})
