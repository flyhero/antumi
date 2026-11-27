import { usePreferences } from './preferences'
import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { z } from 'zod'
import { AgentProfileFields, type AgentKind, type AgentProfile } from '@antumi/protocol'

// Empty names are valid drafts, but never valid saved profiles.
const DraftFields = AgentProfileFields.extend({ name: z.string().max(60) })
const STORAGE_KEY = 'antumi.agent-profile-drafts'
let memory: Record<string, z.infer<typeof DraftFields>> = {}
let loaded = false
let storageAvailable = true

function loadDrafts(): void {
  if (loaded) return
  loaded = true
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    const record = z.record(z.string(), z.unknown()).safeParse(stored)
    if (record.success) {
      for (const [id, value] of Object.entries(record.data)) {
        const entry = DraftFields.safeParse(value)
        if (entry.success) memory[id] = entry.data
      }
    }
  } catch {
    storageAvailable = false
  }
}

export function readProfileDraft(key: string): AgentProfileFields | null {
  loadDrafts()
  return memory[key] ?? null
}

export function saveProfileDraft(key: string, fields: AgentProfileFields | null): boolean {
  loadDrafts()
  if (fields === null) {
    const { [key]: removed, ...rest } = memory
    memory = rest
  } else {
    memory = { ...memory, [key]: DraftFields.parse(fields) }
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory))
    storageAvailable = true
    return true
  } catch {
    storageAvailable = false
    return false
  }
}

export function profileFieldsEqual(a: AgentProfileFields, b: AgentProfileFields): boolean {
  return JSON.stringify(DraftFields.parse(a)) === JSON.stringify(DraftFields.parse(b))
}

export function useAgentProfileDraft(profile: AgentProfile | null, seed: AgentProfileFields | null, template: string | undefined, agent: AgentKind) {
  const key = useRef(profile?.id ?? `new:${template ?? seed?.name ?? 'blank'}`)
  const baseline = useRef<AgentProfileFields>(profile ?? seed ?? { name: '', agent, capability: 'readOnly', modelProvider: usePreferences.getState().defaultProviders[agent] ?? null })
  const [fields, updateFields] = useState<AgentProfileFields>(() => readProfileDraft(key.current) ?? baseline.current)
  const current = useRef(fields)
  const [persisted, setPersisted] = useState(storageAvailable)
  const setFields: Dispatch<SetStateAction<AgentProfileFields>> = useCallback((next) => {
    const value = typeof next === 'function' ? next(current.current) : next
    current.current = value
    setPersisted(saveProfileDraft(key.current, profileFieldsEqual(value, baseline.current) ? null : value))
    updateFields(value)
  }, [])
  const commit = (saved: AgentProfileFields, profileId?: string) => {
    baseline.current = saved
    current.current = saved
    saveProfileDraft(key.current, null)
    if (profileId) key.current = profileId
    updateFields(saved)
  }
  return {
    fields, setFields, persisted,
    dirty: !profileFieldsEqual(fields, baseline.current),
    commit,
    reset: () => commit(baseline.current)
  }
}
