import { create } from 'zustand'
import type { ProjectConfigInfo } from '@antumi/protocol'

// The project whose setup and check the user is asked to allow, and where their answer goes.
type Asking = { info: ProjectConfigInfo; canSkip: boolean; answer(allowed: boolean | 'skip'): void }

export const useProjectTrust = create<{ asking: Asking | null }>()(() => ({ asking: null }))

// Resolves with the user's answer; a second question while one is open declines the first.
export function askProjectTrust(info: ProjectConfigInfo, canSkip = false): Promise<boolean | 'skip'> {
  useProjectTrust.getState().asking?.answer(false)
  return new Promise((resolve) => {
    const asking: Asking = {
      info, canSkip,
      answer: (allowed) => {
        if (useProjectTrust.getState().asking === asking) useProjectTrust.setState({ asking: null })
        resolve(allowed)
      }
    }
    useProjectTrust.setState({ asking })
  })
}
