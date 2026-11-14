import * as SecureStore from 'expo-secure-store'
import { File, Paths } from 'expo-file-system'
import { base64Url, MobileAccess, type ChatItem, type Conversation } from '@antumi/protocol'
import { generateKeyPair, keyPairFromPrivate, type NoiseKeyPair } from '@antumi/protocol/mobile'
import { z } from 'zod'

// What the phone keeps. Its key and the computers it paired with go in the Keystore / Keychain,
// this device only, never into a backup: a new phone pairs again. Conversations seen lately are
// cached in the app's own files, for reading while offline, and go when a computer is forgotten.

const SECURE: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }

export const Computer = z.object({
  // The computer's public key, base64url: who it is.
  key: z.string(),
  name: z.string(),
  port: z.number().int(),
  hosts: z.array(z.string()),
  // Full ws:// URLs through the computer's bridge; none saved before there were bridges.
  bridges: z.array(z.string()).catch([]),
  deviceId: z.string().nullable(),
  access: MobileAccess.nullable(),
  pairedAt: z.number(),
  lastOnlineAt: z.number().nullable()
})
export type Computer = z.infer<typeof Computer>

const Settings = z.object({ lock: z.boolean().catch(false) })
export type Settings = z.infer<typeof Settings>

// When the app last asked GitHub for a newer version, what it found, and the one the user waved away.
const UpdateCheck = z.object({
  checkedAt: z.number().catch(0),
  found: z.object({ version: z.string(), url: z.string() }).nullable().catch(null),
  dismissed: z.string().nullable().catch(null)
})
export type UpdateCheck = z.infer<typeof UpdateCheck>

export async function loadUpdateCheck(): Promise<UpdateCheck> {
  const saved = await SecureStore.getItemAsync('update-check', SECURE)
  try {
    return UpdateCheck.parse(saved ? JSON.parse(saved) : {})
  } catch {
    return { checkedAt: 0, found: null, dismissed: null }
  }
}

export async function saveUpdateCheck(check: UpdateCheck): Promise<void> {
  await SecureStore.setItemAsync('update-check', JSON.stringify(check), SECURE)
}

export async function phoneKey(): Promise<NoiseKeyPair> {
  const saved = await SecureStore.getItemAsync('phone-key', SECURE)
  if (saved) return keyPairFromPrivate(base64Url.decode(saved))
  const key = generateKeyPair()
  await SecureStore.setItemAsync('phone-key', base64Url.encode(key.privateKey), SECURE)
  return key
}

export async function loadComputers(): Promise<Computer[]> {
  const saved = await SecureStore.getItemAsync('computers', SECURE)
  if (!saved) return []
  try {
    const parsed = z.array(Computer).safeParse(JSON.parse(saved))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

export async function saveComputers(computers: readonly Computer[]): Promise<void> {
  await SecureStore.setItemAsync('computers', JSON.stringify(computers), SECURE)
}

export async function loadSettings(): Promise<Settings> {
  const saved = await SecureStore.getItemAsync('settings', SECURE)
  try {
    return Settings.parse(saved ? JSON.parse(saved) : {})
  } catch {
    return { lock: false }
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await SecureStore.setItemAsync('settings', JSON.stringify(settings), SECURE)
}

// The last few conversations opened, with their latest items, per computer.
const Cache = z.object({
  conversations: z.array(z.unknown()),
  chats: z.record(z.string(), z.object({ items: z.array(z.unknown()) }))
})
export type CachedChats = { conversations: Conversation[]; chats: Record<string, ChatItem[]> }

const CACHED_CHATS = 5
const CACHED_ITEMS = 100

function cacheFile(computerKey: string): File {
  // The key's own characters are base64url, safe in a file name.
  return new File(Paths.document, `cache-${computerKey.slice(0, 43)}.json`)
}

export async function readCache(computerKey: string, parse: { conversation(raw: unknown): Conversation | null; item(raw: unknown): ChatItem | null }): Promise<CachedChats> {
  const file = cacheFile(computerKey)
  if (!file.exists) return { conversations: [], chats: {} }
  try {
    const cache = Cache.parse(JSON.parse(await file.text()))
    return {
      conversations: cache.conversations.flatMap((raw) => parse.conversation(raw) ?? []),
      chats: Object.fromEntries(Object.entries(cache.chats).map(([id, chat]) => [id, chat.items.flatMap((raw) => parse.item(raw) ?? [])]))
    }
  } catch {
    return { conversations: [], chats: {} }
  }
}

export async function writeCache(computerKey: string, conversations: readonly Conversation[], chats: Readonly<Record<string, readonly ChatItem[]>>, opened: readonly string[]): Promise<void> {
  const kept = opened.slice(-CACHED_CHATS).filter((id) => chats[id])
  const body = {
    conversations,
    chats: Object.fromEntries(kept.map((id) => [id, { items: chats[id]!.slice(-CACHED_ITEMS) }]))
  }
  await cacheFile(computerKey).write(JSON.stringify(body))
}

export function dropCache(computerKey: string): void {
  const file = cacheFile(computerKey)
  if (file.exists) file.delete()
}
