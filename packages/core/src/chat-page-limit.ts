// A page of chat stages (oldest first, the oldest at stage index `first`) cut to its newest `limit`
// items. Whole stages dropped come back on the next page back, which starts before `first`; only
// a stage cut short loses its start, and the page says so.
export function limitChatPage<T>(pages: readonly (readonly T[])[], first: number, limit: number): { items: T[]; first: number; truncated: boolean } {
  const kept = pages.map((page) => [...page])
  let drop = kept.reduce((sum, page) => sum + page.length, 0) - limit
  let index = first
  while (drop > 0 && kept.length > 0 && drop >= kept[0]!.length) {
    drop -= kept.shift()!.length
    index++
  }
  if (drop > 0 && kept.length > 0) kept[0] = kept[0]!.slice(drop)
  return { items: kept.flat(), first: index, truncated: drop > 0 }
}
