import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { Channel, ChannelReadiness, ChannelTaskFeedback, ChannelTaskReport } from '@antumi/protocol'
import { perform, useCore } from './core-store'

// Agents' channels on chat platforms (docs/CHANNELS.md), as core holds them: read once per
// connection, then kept current by core's own word of every change.
const useChannelStore = create<{ channels: Channel[]; loaded: boolean }>(() => ({ channels: [], loaded: false }))

export function useChannelsSupported(): boolean {
  return useCore((state) => state.rpc?.features.includes('channels') ?? false)
}

export function useChannelTasksSupported(): boolean {
  return useCore((state) => state.rpc?.features.includes('channel-tasks') ?? false)
}

export function useChannelTaskReportsSupported(): boolean {
  return useCore((state) => state.rpc?.features.includes('channel-task-reports') ?? false)
}

export function useChannelPlatformToolsSupported(): boolean {
  return useCore((state) => state.rpc?.features.includes('channel-platform-tools') ?? false)
}

export function useChannelTaskCardsSupported(): boolean {
  return useCore((state) => state.rpc?.features.includes('channel-task-cards') ?? false)
}

// Why a task from a chat platform was sent back on its card, kept current by core's word.
export function useChannelTaskFeedback(taskId: string, fromChat: boolean): ChannelTaskFeedback[] {
  const rpc = useCore((state) => state.rpc)
  const supported = useChannelTaskCardsSupported()
  const [feedback, setFeedback] = useState<ChannelTaskFeedback[]>([])
  useEffect(() => {
    if (!rpc || !supported || !fromChat) return setFeedback([])
    let live = true
    const off = rpc.on('channels.taskFeedbackChanged', (changed) => { if (live && changed.taskId === taskId) setFeedback(changed.feedback) })
    void rpc.call('channels.taskFeedback', { taskId }).then((next) => { if (live) setFeedback(next) }, () => {})
    return () => {
      live = false
      off()
    }
  }, [rpc, supported, fromChat, taskId])
  return feedback
}

export function setChannels(channels: Channel[]): void {
  useChannelStore.setState({ channels, loaded: true })
}

// Every channel, or none where core has no channels.
export function useChannels(): Channel[] {
  const rpc = useCore((state) => state.rpc)
  const supported = useChannelsSupported()
  useEffect(() => {
    if (!rpc || !supported) return
    let live = true
    const off = rpc.on('channels.changed', ({ channels }) => { if (live) setChannels(channels) })
    void perform((link) => link.call('channels.list', {})).then((channels) => { if (live && channels) setChannels(channels) })
    return () => {
      live = false
      off()
    }
  }, [rpc, supported])
  return useChannelStore((state) => state.channels)
}

// What was posted back in the thread a task came from, kept current by core's word of each change.
// Asked only of a task from a chat platform.
export function useChannelTaskReports(taskId: string, fromChat: boolean): ChannelTaskReport[] {
  const rpc = useCore((state) => state.rpc)
  const supported = useChannelTaskReportsSupported()
  const [reports, setReports] = useState<ChannelTaskReport[]>([])
  useEffect(() => {
    if (!rpc || !supported || !fromChat) return setReports([])
    let live = true
    const off = rpc.on('channels.taskReportsChanged', (changed) => { if (live && changed.taskId === taskId) setReports(changed.reports) })
    void rpc.call('channels.taskReports', { taskId }).then((next) => { if (live) setReports(next) }, () => {})
    return () => {
      live = false
      off()
    }
  }, [rpc, supported, fromChat, taskId])
  return reports
}

// Whether this computer can answer from a chat platform: asked again whenever the channels change
// or the window comes back, since the daemon is replaced underneath while the app stays open.
// Null where core cannot say, or has not yet.
export function useChannelReadiness(): ChannelReadiness | null {
  const rpc = useCore((state) => state.rpc)
  const supported = useCore((state) => state.rpc?.features.includes('channel-readiness') ?? false)
  const channels = useChannelStore((state) => state.channels)
  const [readiness, setReadiness] = useState<ChannelReadiness | null>(null)
  useEffect(() => {
    if (!rpc || !supported) return setReadiness(null)
    let live = true
    // A check in the background: a failure only leaves the warning as it was, never an error.
    const check = () => void rpc.call('channels.readiness', {}).then((next) => { if (live) setReadiness(next) }, () => {})
    check()
    window.addEventListener('focus', check)
    return () => {
      live = false
      window.removeEventListener('focus', check)
    }
  }, [rpc, supported, channels])
  return readiness
}
