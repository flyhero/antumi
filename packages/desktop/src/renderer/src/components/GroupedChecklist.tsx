import { useMemo, useState } from 'react'
import { CHECKLIST_OPEN_LIMIT, checklistSize, filterChecklist, groupPicked, withGroup, type ChecklistGroup } from '../grouped-checklist'
import { t } from '../i18n'
import { ChevronRightIcon, CloseIcon, SearchIcon } from './icons'
import './grouped-checklist.css'

// Many things to pick from, as a form field: what is picked first, then a search, then the groups,
// folded once there are too many to read at a glance. A group without a name lists its items bare.
export function GroupedChecklist({ groups, selected, onChange, searchLabel }: {
  groups: readonly ChecklistGroup[]
  selected: readonly string[]
  onChange: (selected: string[]) => void
  searchLabel: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const picked = useMemo(() => new Set(selected), [selected])
  const named = useMemo(() => new Map(groups.flatMap((group) => group.items.map((item) => [item.id, { item, group }] as const))), [groups])
  const size = checklistSize(groups)
  const long = size > CHECKLIST_OPEN_LIMIT
  const shown = filterChecklist(groups, query)
  const searching = query.trim() !== ''
  const toggle = (id: string, on: boolean) => onChange(on ? [...selected, id] : selected.filter((each) => each !== id))
  const fold = (id: string) => setOpen((current) => {
    const next = new Set(current)
    if (!next.delete(id)) next.add(id)
    return next
  })
  return <div className="grouped-checklist">
    {selected.length > 0 && <ul className="grouped-checklist-picked" aria-label={t('GroupedChecklist.picked', { count: selected.length })}>
      {selected.map((id) => {
        const found = named.get(id)
        const label = found?.item.label ?? id
        return <li key={id} className="grouped-checklist-chip" title={found?.group.label ? `${found.group.label} · ${label}` : label}>
          <span>{label}</span>
          <button type="button" aria-label={t('GroupedChecklist.remove', { name: label })} onClick={() => toggle(id, false)}><CloseIcon /></button>
        </li>
      })}
    </ul>}
    {long && <label className="grouped-checklist-search">
      <SearchIcon />
      <input className="input" type="search" value={query} placeholder={searchLabel} aria-label={searchLabel} spellCheck={false} autoComplete="off" onChange={(event) => setQuery(event.target.value)} />
    </label>}
    <div className="grouped-checklist-list">
      {shown.length === 0 && <p className="muted grouped-checklist-empty">{t('GroupedChecklist.noMatches')}</p>}
      {shown.map((group) => {
        const expanded = !group.label || searching || !long || open.has(group.id)
        const whole = groups.find((each) => each.id === group.id) ?? group
        const count = groupPicked(whole, picked)
        // While searching, the group's box picks only what the search shows of it.
        const scope = groupPicked(group, picked)
        return <section key={group.id} className="grouped-checklist-group">
          {group.label && <div className="grouped-checklist-head">
            <input
              type="checkbox"
              aria-label={t('GroupedChecklist.pickGroup', { name: group.label })}
              checked={scope.all}
              ref={(box) => { if (box) box.indeterminate = scope.picked > 0 && !scope.all }}
              onChange={(event) => onChange(withGroup(selected, group, event.target.checked))}
            />
            <button type="button" className="grouped-checklist-fold" aria-expanded={expanded} disabled={searching || !long} onClick={() => fold(group.id)}>
              {long && <span className="grouped-checklist-chevron" aria-hidden="true"><ChevronRightIcon /></span>}
              <span className="grouped-checklist-name">{group.label}</span>
              <span className="grouped-checklist-count">{t('GroupedChecklist.count', { picked: count.picked, total: whole.items.length })}</span>
            </button>
          </div>}
          {expanded && <ul className="grouped-checklist-items" data-nested={group.label ? true : undefined}>
            {group.items.map((item) => <li key={item.id}>
              <label className="grouped-checklist-item" title={item.detail ?? undefined}>
                <input type="checkbox" checked={picked.has(item.id)} onChange={(event) => toggle(item.id, event.target.checked)} />
                <span className="grouped-checklist-text">
                  <span className="grouped-checklist-label">{item.label}</span>
                  {item.detail && <span className="grouped-checklist-detail">{item.detail}</span>}
                </span>
              </label>
            </li>)}
          </ul>}
        </section>
      })}
    </div>
  </div>
}
