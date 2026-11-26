import { useEffect, useRef, useState } from 'react'
import { dismissError } from '../core-store'
import { t } from '../i18n'
import { CloseIcon, WarningIcon } from './icons'

export const ERROR_TOAST_DURATION_MS = 3_000

export function scheduleErrorToastDismiss(dismiss: () => void) {
  let remaining = ERROR_TOAST_DURATION_MS
  let started = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  const pause = () => {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
    remaining = Math.max(0, remaining - (Date.now() - started))
  }
  const resume = () => {
    if (timer !== undefined) return
    started = Date.now()
    timer = setTimeout(dismiss, remaining)
  }
  resume()
  return { pause, resume, cancel: pause }
}

export function ErrorToast({ message }: { message: string }) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const countdown = useRef<ReturnType<typeof scheduleErrorToastDismiss> | null>(null)
  useEffect(() => {
    const next = scheduleErrorToastDismiss(dismissError)
    countdown.current = next
    return next.cancel
  }, [message])
  useEffect(() => {
    if (hovered || focused) countdown.current?.pause()
    else countdown.current?.resume()
  }, [message, hovered, focused])

  return (
    <div className="toast error-toast" role="alert" aria-atomic="true"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
      <span className="toast-icon" aria-hidden="true"><WarningIcon /></span>
      <span className="toast-message">{message}</span>
      <button type="button" className="icon-button" aria-label={t('BackdropPicker.close')} onClick={dismissError}><CloseIcon /></button>
    </div>
  )
}
