import { create } from 'zustand'

// A plain stack of screens: few enough that a navigation library would be more than it saves.

export type Route =
  | { name: 'computers' }
  // link: a pairing link the app was opened with, paired at once.
  | { name: 'pair'; link?: string }
  | { name: 'conversations' }
  | { name: 'chat'; id: string }
  | { name: 'new' }
  | { name: 'tasks' }
  | { name: 'task'; id: string }
  | { name: 'newTask' }
  | { name: 'settings' }

export const useNavigation = create<{ stack: Route[] }>()(() => ({ stack: [{ name: 'computers' }] }))

export function push(route: Route): void {
  useNavigation.setState((state) => ({ stack: [...state.stack, route] }))
}

// false when already at the bottom, for the back button to leave the app.
export function pop(): boolean {
  const { stack } = useNavigation.getState()
  if (stack.length <= 1) return false
  useNavigation.setState({ stack: stack.slice(0, -1) })
  return true
}

export function reset(route: Route): void {
  useNavigation.setState({ stack: route.name === 'computers' ? [route] : [{ name: 'computers' }, route] })
}
