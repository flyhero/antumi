export const PROJECT_COLORS = ['blue', 'green', 'teal', 'yellow', 'orange', 'red', 'pink', 'purple'] as const
export type ProjectColor = (typeof PROJECT_COLORS)[number]

export function projectColorKey(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

// The path keeps a project's default stable as recent projects are added or reordered.
export function defaultProjectColor(path: string): ProjectColor {
  let hash = 0
  for (const char of projectColorKey(path)) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0
  return PROJECT_COLORS[hash % PROJECT_COLORS.length] ?? 'blue'
}

export function projectColor(path: string, overrides: Readonly<Record<string, ProjectColor>>): ProjectColor {
  return overrides[projectColorKey(path)] ?? defaultProjectColor(path)
}
