import { localized, t, tr } from '../i18n'
import { isShortcut } from '../keyboard-shortcuts'
import { useState } from 'react'
import { openTodoCount, todoGroupDone, type RpcMethod, type RpcParams, type TodoGroup, type TodoItem, type TodoOwner } from '@antumi/protocol'
import { addQuote } from '../chat-quotes'
import { receiveTodos, useConversationTodos } from '../conversation-todos'
import { perform } from '../core-store'
import { PencilIcon, PlusIcon, QuoteIcon, TrashIcon } from './icons'
import { TitleEditor } from './TitleEditor'

const OWNER_LABEL: Record<TodoOwner, string> = localized(() => ({ user: t('TodoPanel.needsYou'), agent: t('TodoPanel.agentCanDo') }))

type TodoMethod = Extract<RpcMethod, 'todos.add' | 'todos.check' | 'todos.edit' | 'todos.remove'>

// Every change answers with the list as it now stands, shown at once rather than on the notice.
async function change<M extends TodoMethod>(method: M, params: RpcParams<M>): Promise<boolean> {
  const groups = await perform((rpc) => rpc.call<M>(method, params))
  if (groups) receiveTodos(params.id, groups)
  return groups !== null
}

// The inspector's to-dos: what the agent wrote down for later, and what the user added. A group's
// box ticks every item; one finished goes under 已完成.
export function TodoPanel({ conversationId }: { conversationId: string }) {
  const groups = useConversationTodos(conversationId)
  const [adding, setAdding] = useState(false)
  const open = groups.filter((group) => !todoGroupDone(group))
  const finished = groups.filter(todoGroupDone)
  const left = openTodoCount(groups)
  return (
    <div className="todo-panel">
      <div className="todo-panel-head">
        <span>{left > 0 ? t('TodoPanel.incompleteGroups', { left: left, value2: open.length }) : groups.length > 0 ? t('OverviewView.allDone') : t('chatTools.toDos')}</span>
        <button type="button" className="todo-link" onClick={() => setAdding(true)}>{t('TodoPanel.add')}</button>
      </div>
      {adding && <NewGroup conversationId={conversationId} onDone={() => setAdding(false)} />}
      {groups.length === 0 && !adding && (
        <p className="todo-empty">{t('TodoPanel.noToDosYetWhenAgentListsThings')}</p>
      )}
      {open.map((group) => <Group key={group.id} conversationId={conversationId} group={group} />)}
      {finished.length > 0 && (
        <details className="todo-finished">
          <summary>{tr('TodoPanel.completedGroups', { value1: finished.length })}</summary>
          {finished.map((group) => <Group key={group.id} conversationId={conversationId} group={group} />)}
        </details>
      )}
    </div>
  )
}

function Group({ conversationId, group }: { conversationId: string; group: TodoGroup }) {
  const [renaming, setRenaming] = useState(false)
  const [adding, setAdding] = useState(false)
  const done = group.items.filter((item) => item.done).length
  const all = done === group.items.length
  const remove = () => {
    if (window.confirm(t('TodoPanel.deleteToDoGroup', { value1: group.title }))) void change('todos.remove', { id: conversationId, groupId: group.id })
  }
  return (
    <section className="todo-group" aria-label={group.title} data-done={all || undefined}>
      <div className="todo-group-head">
        <input
          type="checkbox"
          aria-label={all ? t('TodoPanel.markAllOfIncomplete', { value1: group.title }) : t('TodoPanel.markAllOfComplete', { value1: group.title })}
          checked={all}
          ref={(box) => { if (box) box.indeterminate = done > 0 && !all }}
          onChange={() => void change('todos.check', { id: conversationId, groupId: group.id, done: !all })}
        />
        <span className="todo-group-title">
          {renaming
            ? <TitleEditor title={group.title} label={t('TodoPanel.groupTitle')} maxLength={120} onSave={(title) => void change('todos.edit', { id: conversationId, groupId: group.id, text: title })} onDone={() => setRenaming(false)} />
            : <button type="button" className="todo-text-button" title={t('TodoPanel.clickToEditTitle')} onClick={() => setRenaming(true)}>{group.title}</button>}
          {group.note && <span className="todo-group-note">{group.note}</span>}
        </span>
        <span className="todo-side">
          <span className="todo-group-count">{done}/{group.items.length}</span>
          <span className="todo-actions">
            <button type="button" aria-label={t('TodoPanel.addItem')} data-tooltip={t('TodoPanel.addItem')} onClick={() => setAdding(true)}><PlusIcon /></button>
            <button type="button" aria-label={t('TodoPanel.deleteGroup')} data-tooltip={t('TodoPanel.deleteGroup')} onClick={remove}><TrashIcon /></button>
          </span>
        </span>
      </div>
      <ul className="todo-items">
        {group.items.map((item) => <Item key={item.id} conversationId={conversationId} groupId={group.id} item={item} />)}
        {adding && (
          <li className="todo-item">
            <TitleEditor title="" label={t('TodoPanel.newItem')} maxLength={500} onSave={(text) => void change('todos.add', { id: conversationId, groupId: group.id, title: group.title, items: [{ text, owner: 'user' }] })} onDone={() => setAdding(false)} />
          </li>
        )}
      </ul>
    </section>
  )
}

function Item({ conversationId, groupId, item }: { conversationId: string; groupId: string; item: TodoItem }) {
  const [editing, setEditing] = useState(false)
  return (
    <li className="todo-item" data-done={item.done || undefined}>
      <input
        type="checkbox"
        aria-label={item.done ? t('TodoPanel.markIncomplete') : t('TodoPanel.markComplete')}
        checked={item.done}
        onChange={() => void change('todos.check', { id: conversationId, groupId, itemId: item.id, done: !item.done })}
      />
      {editing
        ? <TitleEditor title={item.text} label={t('TodoPanel.thisItem')} maxLength={500} onSave={(text) => void change('todos.edit', { id: conversationId, groupId, itemId: item.id, text })} onDone={() => setEditing(false)} />
        : <span className="todo-item-text">{item.text}</span>}
      {/* The owner, or on hover the actions in its place: a slot as wide as both, so the text never rewraps. */}
      <span className="todo-side">
        <span className="todo-owner" data-owner={item.owner}>{OWNER_LABEL[item.owner]}</span>
        {!editing && (
          <span className="todo-actions">
            {!item.done && (
              <button type="button" aria-label={t('OverviewView.assignToAgent')} data-tooltip={t('TodoPanel.assignToAgentPutInComposerForIt')} onClick={() => addQuote(conversationId, null, item.text, t('OverviewView.pleaseHandleThisToDoAndMarkIt'))}>
                <QuoteIcon />
              </button>
            )}
            <button type="button" aria-label={t('chatTools.edit')} data-tooltip={t('chatTools.edit')} onClick={() => setEditing(true)}><PencilIcon /></button>
            <button type="button" aria-label={t('ChatCommandSettings.delete')} data-tooltip={t('ChatCommandSettings.delete')} onClick={() => void change('todos.remove', { id: conversationId, groupId, itemId: item.id })}><TrashIcon /></button>
          </span>
        )}
      </span>
    </li>
  )
}

// A group the user writes: a heading, then one item a line.
function NewGroup({ conversationId, onDone }: { conversationId: string; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [lines, setLines] = useState('')
  const items = lines.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 30)
  const ready = title.trim() !== '' && items.length > 0
  const submit = async () => {
    if (!ready) return
    const added = await change('todos.add', { id: conversationId, title: title.trim(), items: items.map((text) => ({ text: text.slice(0, 500), owner: 'user' as const })) })
    if (added) onDone()
  }
  return (
    <form className="todo-new" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <input className="input" aria-label={t('TodoPanel.groupTitle')} placeholder={t('TodoPanel.titleEGBeforeRelease')} value={title} maxLength={120} autoFocus onChange={(event) => setTitle(event.target.value)} />
      <textarea
        className="input"
        aria-label={t('TodoPanel.items')}
        placeholder={t('TodoPanel.oneItemPerLine')}
        rows={3}
        value={lines}
        onChange={(event) => setLines(event.target.value)}
        onKeyDown={(event) => {
          if (!event.repeat && isShortcut('submit-form', event.nativeEvent)) {
            event.preventDefault()
            void submit()
          } else if (event.key === 'Escape') onDone()
        }}
      />
      <div className="todo-new-actions">
        <button type="button" className="button ghost" onClick={onDone}>{t('ChatCommandSettings.cancel')}</button>
        <button type="submit" className="button primary" disabled={!ready}>{t('ProjectPicker.add')}</button>
      </div>
    </form>
  )
}
