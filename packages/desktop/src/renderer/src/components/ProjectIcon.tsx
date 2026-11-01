import { usePreferences } from '../preferences'
import { projectColor } from '../project-colors'
import { FolderIcon } from './icons'

export function ProjectIcon({ path }: { path: string }) {
  const color = usePreferences((state) => projectColor(path, state.projectColors))
  return <span className="project-icon" data-project-color={color} aria-hidden="true"><FolderIcon /></span>
}
