import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { IlinkCommand, IlinkResult } from './wechat-ilink'

export const IlinkRequest = z.object({ id: z.number(), command: IlinkCommand })
export const IlinkResponse = z.object({ id: z.number(), result: IlinkResult })

export type IlinkWorker = { call(command: IlinkCommand): Promise<IlinkResult>; stop(): void }
export type LaunchIlink = (onExit: () => void) => IlinkWorker

export const launchIlink: LaunchIlink = (onExit) => {
  const source = import.meta.url.endsWith('.ts')
  const script = fileURLToPath(new URL(source ? './wechat-ilink-main.ts' : './wechat-ilink.mjs', import.meta.url))
  const child = fork(script, [], {
    execArgv: source ? ['--import', new URL('../node_modules/tsx/dist/loader.mjs', import.meta.url).href] : [],
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    env: { SystemRoot: process.env.SystemRoot, ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) }
  })
  const waiting = new Map<number, (value: IlinkResult) => void>()
  let next = 0
  let closed = false
  const finish = () => {
    if (closed) return
    closed = true
    for (const resolve of waiting.values()) resolve({ type: 'error', code: 'network' })
    waiting.clear()
    onExit()
  }
  child.on('message', (raw) => {
    const parsed = IlinkResponse.safeParse(raw)
    if (!parsed.success) return
    const { id, result } = parsed.data
    const resolve = waiting.get(id)
    waiting.delete(id)
    resolve?.(result)
  })
  child.once('error', finish)
  child.once('exit', finish)
  child.once('disconnect', finish)
  return {
    call: (command) => new Promise((resolve) => {
      if (closed || !child.connected) return resolve({ type: 'error', code: 'network' })
      const id = ++next
      waiting.set(id, resolve)
      child.send({ id, command }, (error) => {
        if (!error) return
        waiting.get(id)?.({ type: 'error', code: 'network' })
        waiting.delete(id)
      })
    }),
    stop: () => { child.kill(); finish() }
  }
}
