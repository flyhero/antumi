import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ErrorToast, ERROR_TOAST_DURATION_MS, scheduleErrorToastDismiss } from './components/ErrorToast'

afterEach(() => {
  vi.useRealTimers()
})

it('shows private error details without an author contact or prefilled issue link', () => {
  const message = '私人项目 /repo/private 发送失败'
  const html = renderToStaticMarkup(createElement(ErrorToast, { message }))
  expect(html).toContain(message)
  expect(html).not.toContain('support-actions')
  expect(html).not.toContain('找作者')
  expect(html).not.toContain('GitHub Issue')
})

it('dismisses an error toast without user interaction', () => {
  vi.useFakeTimers()
  const dismiss = vi.fn()
  scheduleErrorToastDismiss(dismiss)

  vi.advanceTimersByTime(ERROR_TOAST_DURATION_MS - 1)
  expect(dismiss).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(dismiss).toHaveBeenCalledOnce()
})

it('cancels dismissal when a toast is replaced', () => {
  vi.useFakeTimers()
  const dismiss = vi.fn()
  const countdown = scheduleErrorToastDismiss(dismiss)

  countdown.cancel()
  vi.advanceTimersByTime(ERROR_TOAST_DURATION_MS)
  expect(dismiss).not.toHaveBeenCalled()
})

it('resumes the remaining time after interaction instead of restarting it', () => {
  vi.useFakeTimers()
  const dismiss = vi.fn()
  const countdown = scheduleErrorToastDismiss(dismiss)
  vi.advanceTimersByTime(2_000)
  countdown.pause()
  countdown.pause()
  vi.advanceTimersByTime(10_000)
  expect(dismiss).not.toHaveBeenCalled()
  countdown.resume()
  countdown.resume()
  vi.advanceTimersByTime(999)
  expect(dismiss).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(dismiss).toHaveBeenCalledOnce()
})
