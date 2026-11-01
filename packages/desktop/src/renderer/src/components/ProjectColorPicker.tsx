import { t } from '../i18n'
import { setPreference, usePreferences } from '../preferences'
import { defaultProjectColor, PROJECT_COLORS, projectColorKey } from '../project-colors'
import { ChatPicker } from './ChatPicker'

export function ProjectColorPicker({ path }: { path: string }) {
  const key = projectColorKey(path)
  const chosen = usePreferences((state) => state.projectColors[key])
  const swatch = (color: string) => <span className="project-color-swatch" data-project-color={color} />
  return <ChatPicker
    label={t('ProjectColor.label')}
    placeholder={t('ProjectColor.default')}
    value={chosen ?? 'default'}
    placement="below"
    size="large"
    options={[
      { value: 'default', label: t('ProjectColor.default'), icon: swatch(defaultProjectColor(path)) },
      ...PROJECT_COLORS.map((color) => ({ value: color, label: t(`ProjectColor.${color}`), icon: swatch(color) }))
    ]}
    onChange={(value) => {
      const next = { ...usePreferences.getState().projectColors }
      const color = PROJECT_COLORS.find((entry) => entry === value)
      if (color) next[key] = color
      else delete next[key]
      setPreference('projectColors', next)
    }}
  />
}
