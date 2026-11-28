import { IlinkApi } from './wechat-ilink'
import { IlinkRequest } from './wechat-ilink-worker'

const api = new IlinkApi()
process.on('message', (raw) => {
  const request = IlinkRequest.safeParse(raw)
  if (!request.success) return
  const { id, command } = request.data
  void api.run(command).then((result) => {
    if (process.connected) process.send?.({ id, result }, () => {})
  })
})
process.once('disconnect', () => process.exit(0))
