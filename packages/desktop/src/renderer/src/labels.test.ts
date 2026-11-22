import { describe, expect, it } from 'vitest'
import { agoText, chatDayAndTime, messageTime, reasonText } from './labels'

it('preserves skill validation and conflict details from core', () => {
  expect(reasonText('skills-name-conflict', 'review · Claude Code：repo-a、repo-b')).toContain('repo-a、repo-b')
  expect(reasonText('skills-none-found', 'skills/tdd：缺少 description')).toContain('缺少 description')
})

it('keeps the source plugin explanation when settings are refused', () => {
  expect(reasonText('source-invalid-settings', '空间地址应以 https:// 开头')).toContain('空间地址应以 https:// 开头')
  expect(reasonText('source-bad-query', 'JQL 有误')).toContain('JQL 有误')
  expect(reasonText('source-auth-failed', 'token secret detail')).not.toContain('secret')
})

describe('messageTime', () => {
  const now = new Date(2026, 9, 3, 10, 30).getTime()

  it('says only the time for a message from today, however early', () => {
    expect(messageTime(new Date(2026, 9, 3, 0, 5).getTime(), now)).toBe('00:05')
    expect(messageTime(new Date(2026, 9, 3, 9, 41).getTime(), now)).toBe('09:41')
  })

  it('adds the day for one from before today, and the year for one from an earlier year', () => {
    expect(messageTime(new Date(2026, 9, 2, 23, 59).getTime(), now)).toBe('10月2日 23:59')
    expect(messageTime(new Date(2026, 0, 15, 8, 0).getTime(), now)).toBe('1月15日 08:00')
    expect(messageTime(new Date(2025, 11, 31, 18, 20).getTime(), now)).toBe('2025年12月31日 18:20')
  })
})

describe('chatDayAndTime', () => {
  const now = new Date(2026, 9, 3, 10, 30).getTime()

  it('always says the day, and the year only for an earlier one', () => {
    expect(chatDayAndTime(new Date(2026, 9, 3, 9, 41).getTime(), now)).toBe('10月3日 09:41')
    expect(chatDayAndTime(new Date(2025, 7, 29, 10, 42).getTime(), now)).toBe('2025年8月29日 10:42')
  })
})

describe('agoText', () => {
  const now = new Date(2026, 9, 14, 15, 30).getTime()
  const at = (...parts: [number, number, number, number, number]) => new Date(...parts).getTime()

  it('counts minutes, then hours within today', () => {
    expect(agoText(now - 20_000, now)).toBe('刚刚')
    expect(agoText(at(2026, 9, 14, 15, 27), now)).toBe('3 分钟前')
    expect(agoText(at(2026, 9, 14, 13, 10), now)).toBe('2 小时前')
    expect(agoText(at(2026, 9, 14, 0, 5), now)).toBe('15 小时前')
  })

  it('counts days and weeks by the calendar, then gives the day', () => {
    expect(agoText(at(2026, 9, 13, 23, 50), now)).toBe('昨天')
    expect(agoText(at(2026, 9, 10, 9, 0), now)).toBe('4 天前')
    expect(agoText(at(2026, 8, 29, 11, 57), now)).toBe('2 周前')
    expect(agoText(at(2026, 7, 2, 8, 0), now)).toBe('8月2日')
    expect(agoText(at(2025, 11, 31, 8, 0), now)).toBe('2025年12月31日')
  })
})
