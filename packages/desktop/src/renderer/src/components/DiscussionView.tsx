import { useShortcutHint } from '../keyboard-shortcuts'
import { localized, t, tr } from '../i18n'
import { useChatTypeface } from '../chat-typeface'
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { checkDiscussionAction, checkEditDiscussionProjects, checkNewDiscussionTopic, checkRemoveDiscussionMember, currentTopic, MAX_DETAILS_LENGTH, memberLetter, type Discussion, type DiscussionAction, type DiscussionMember, type DiscussionPost } from '@antumi/protocol'
import { loadConversation, openDiscussionDraft, openOverview, perform, selectConversation, selectDiscussion, selectTask, useCore, useDiscussionMembersSupported, useDiscussionProjectsSupported, useDiscussionTopicsSupported } from '../core-store'
import { archiveDiscussion, controlDiscussion, discussionProgress, EVERYONE, loadDiscussionPosts, newDiscussionTopic, removeDiscussionMember, setDiscussionProjects, MEMBER_STATUS_LABEL, mentionedMembers, postToDiscussion, renameDiscussion, useDiscussionPosts } from '../discussions'
import { agentLabel, messageTime, reasonText } from '../labels'
import { setPreference, usePreferences } from '../preferences'
import { ChatMarkdown } from './ChatMarkdown'
import { sendsMessage } from './ChatComposer'
import { DiscussionDot } from './SidebarDiscussions'
import { AgentIcon, CloseIcon, EnterIcon, PlayIcon, StopIcon } from './icons'
import { ProjectPicker, projectNames } from './ProjectPicker'
import { Spinner } from './Spinner'
import { TitleEditor } from './TitleEditor'
import { useDiscussionMentionMenu } from './DiscussionMentions'
import { AddMemberButton } from './DiscussionMemberForm'
import { ArchivedBar } from './ArchivedBar'
import { CopyButton } from './CopyButton'
import { ChatFind, useChatFindState } from './ChatFind'
import { askConfirm } from '../confirm-dialog'

const ACTIONS: Array<{ action: DiscussionAction; label: string; hint: string }> = localized(() => ([
  { action: 'pause', label: t('DiscussionView.pause'), hint: t('DiscussionView.pauseAfterThisRoundFinishes') },
  { action: 'resume', label: t('DiscussionView.continue'), hint: t('DiscussionView.resumeTheDiscussionFromWhereItStopped') },
  { action: 'nextRound', label: t('DiscussionView.anotherRound'), hint: t('DiscussionView.reviewEachOtherSViewsAgainThenSummarize') },
  { action: 'conclude', label: t('DiscussionView.summarizeNow'), hint: t('DiscussionView.askTheChairToSummarizeAfterThisRound') },
  { action: 'stop', label: t('DiscussionView.stop'), hint: t('DiscussionView.interruptCurrentSpeakersAndPause') }
]))

// What the composer's next send is: more on the topic now discussed, or a new one.
const SEND_MODES = localized(() => ([
  { topic: false, label: t('DiscussionView.continueDiscussion'), hint: t('DiscussionView.addThoughtsOrQuestionsToTheCurrentTopic') },
  { topic: true, label: t('DiscussionView.newTopic'), hint: t('DiscussionView.startANewTopicWithIndependentAnswersDiscussion') }
] as const))

const KIND_LABEL: Partial<Record<DiscussionPost['kind'], string>> = localized(() => ({ opening: t('DiscussionView.independentAnswer'), rebuttal: t('DiscussionView.response'), reply: t('DiscussionView.answerToYou'), summary: t('DiscussionView.summary') }))

// A member's own conversation, where its tool calls and approvals are: it is kept out of the list,
// so it may need fetching before it can be shown.
async function openMember(member: DiscussionMember): Promise<void> {
  if (!useCore.getState().conversations[member.conversationId]) await loadConversation(member.conversationId)
  selectConversation(member.conversationId)
}

// What a summary sums up: the topic it closes, and in how many of that topic's rounds.
type Topic = { text: string; rounds: number }

// The summary as a task's details, for the conclusion to be carried out.
async function taskFromSummary(discussion: Discussion, topic: string, summary: DiscussionPost): Promise<void> {
  const details = [t('DiscussionView.conclusionsFromGroupChat', { value1: discussion.title }), '', t('DiscussionView.discussionTopic'), topic, '', summary.text].join('\n').slice(0, MAX_DETAILS_LENGTH)
  const task = await perform((rpc) => rpc.call('tasks.create', { title: discussion.title, details, repos: discussion.projectPaths }))
  if (task) selectTask(task.id)
}

// A member's answer to the user as a task's details: what was asked, and what it answered. Named
// after the question, as the task is what it asked for.
async function taskFromReply(discussion: Discussion, member: DiscussionMember | undefined, question: DiscussionPost | undefined, reply: DiscussionPost): Promise<void> {
  const asked = question?.text.replace(/@\S+/g, '').trim() ?? ''
  const name = member?.name ?? t('DiscussionDraft.members')
  const title = (asked.split('\n').find((line) => line.trim()) ?? discussion.title).trim().slice(0, 80) || discussion.title
  const details = [t('DiscussionView.sAnswerToYouInGroupChat', { value1: discussion.title, name: name }), ...(asked ? ['', t('DiscussionView.yourQuestion'), asked] : []), '', t('DiscussionView.sAnswer', { name: name }), reply.text]
    .join('\n').slice(0, MAX_DETAILS_LENGTH)
  const task = await perform((rpc) => rpc.call('tasks.create', { title, details, repos: discussion.projectPaths }))
  if (task) selectTask(task.id)
}

const LEAVE_BLOCKER: Record<'too-few' | 'chair' | 'busy', string> = localized(() => ({
  'too-few': t('DiscussionView.atLeast2MembersMustRemain'),
  chair: t('DiscussionView.theChairMustStayToWriteTheSummary'),
  busy: t('DiscussionView.theyAreStillSpeakingWaitUntilTheyFinish')
}))

// Takes a member out once the user agrees; what it said stays.
async function leave(discussion: Discussion, member: DiscussionMember): Promise<void> {
  if (await askConfirm({ message: t('DiscussionView.removeFromTheDiscussionTheirPostsWillBe', { value1: member.name }), confirm: t('ConfirmDialog.removeMember') })) await removeDiscussionMember(discussion.id, member.id)
}

function MemberChip({ member, chair, onMention, leaveBlocker, onLeave }: {
  member: DiscussionMember
  chair: boolean
  // Null where nothing can be said to it: the group is archived.
  onMention: (() => void) | null
  // Why it cannot leave now; leaving is offered only where the core takes it.
  leaveBlocker: string | null
  onLeave: (() => void) | null
}) {
  const status = MEMBER_STATUS_LABEL[member.status]
  return (
    <li className="discussion-member" data-status={member.status}>
      <button
        type="button"
        className="discussion-member-open"
        data-tooltip={t('DiscussionView.clickToViewToolCallsAndApprovalRequests', { value1: member.role ? t('DiscussionView.position', { value1: member.role }) : '' })}
        onClick={() => void openMember(member)}
      >
        <span className="discussion-member-mark"><AgentIcon agent={member.agent} /></span>
        <span className="discussion-member-name">{member.name}</span>
        {chair && <span className="discussion-member-chair">{t('DiscussionView.chair')}</span>}
        <span className="discussion-member-status">
          {member.status === 'working' && <Spinner />}
          {status}
        </span>
      </button>
      {onMention && <button type="button" className="icon-button discussion-member-mention" aria-label={`@${member.name}`} data-tooltip={t('DiscussionView.askOnlyThem')} onClick={onMention}>@</button>}
      {onLeave && (
        <button
          type="button"
          className="icon-button discussion-member-leave"
          aria-label={t('DiscussionView.remove', { value1: member.name })}
          aria-disabled={leaveBlocker !== null}
          data-tooltip={leaveBlocker ?? t('DiscussionView.removeFromDiscussion')}
          onClick={() => { if (!leaveBlocker) onLeave() }}
        >
          <CloseIcon />
        </button>
      )}
    </li>
  )
}

// A member's face: its agent's mark, and its letter (A, B…) to tell two on the same agent apart.
function MemberFace({ member, letter }: { member: DiscussionMember | undefined; letter: string | null }) {
  return (
    <span className="discussion-face" aria-hidden="true">
      {member && <AgentIcon agent={member.agent} />}
      {letter && <span className="discussion-face-letter">{letter}</span>}
    </span>
  )
}

function PostHead({ post, member, chair, left }: { post: DiscussionPost; member: DiscussionMember | undefined; chair: boolean; left: boolean }) {
  return (
    <div className="discussion-msg-head">
      <span className="discussion-msg-name">{member ? member.name : t('DiscussionView.removedMember')}</span>
      {left && <span className="discussion-tag">{t('DiscussionView.left')}</span>}
      {chair && <span className="discussion-tag" data-chair="">{t('DiscussionView.chair')}</span>}
      {KIND_LABEL[post.kind] && post.kind !== 'summary' && <span className="discussion-tag">{KIND_LABEL[post.kind]}</span>}
      {member?.model && <span>{member.model}</span>}
      <span className="discussion-msg-time">{messageTime(post.createdAt)}</span>
    </div>
  )
}

// The user's words with the members it names standing out, as a chat app marks an @.
function MentionedText({ text, names }: { text: string; names: readonly string[] }) {
  const tags = [EVERYONE, ...names].map((name) => `@${name}`).sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`(${tags.map((tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`)
  return <>{text.split(pattern).map((part, index) => (tags.includes(part) ? <span key={index} className="discussion-at">{part}</span> : part))}</>
}

// A post that failed: the reason as the app words it, and what the agent said, where core kept it.
function FailedPost({ error }: { error: string | null }) {
  const [reason = '', ...said] = (error ?? '').split('\n')
  const detail = said.join('\n').trim()
  return (
    <div className="discussion-post-failed">
      <p>{tr('DiscussionView.couldNotPostThisTime', { value1: reasonText(reason, reason || t('DiscussionView.unknownReason')) })}</p>
      {detail && <p className="discussion-post-failed-detail">{detail}</p>}
    </div>
  )
}

function PendingPost({ member }: { member: DiscussionMember | undefined }) {
  if (member?.status === 'awaiting') {
    return <span className="discussion-typing">{tr('DiscussionView.awaitingYourApproval', { value1: <button type="button" className="link-button" onClick={() => void openMember(member)}>{t('DiscussionView.respond')}</button> })}</span>
  }
  return <span className="discussion-typing" role="status">{tr('DiscussionView.thinking', { value1: <i />, value2: <i />, value3: <i /> })}</span>
}

// One post, as a chat app lays a group out: a member's on the left, its face beside a bubble under
// its name; the user's on the right; Antumi's own notes in the middle; the summary as a card.
function Post({ post, discussion, topic, question }: { post: DiscussionPost; discussion: Discussion; topic: Topic; question?: DiscussionPost }) {
  if (post.kind === 'notice') return <p className="discussion-system">{post.text}</p>
  if (post.kind === 'user') {
    return (
      <div className="discussion-msg" data-mine="">
        <span className="discussion-face discussion-face-me" aria-hidden="true">{t('DiscussionView.me')}</span>
        <div className="discussion-msg-body">
          <div className="discussion-bubble"><MentionedText text={post.text} names={discussion.members.map((member) => member.name)} /></div>
          <PostActions text={post.text} />
        </div>
      </div>
    )
  }
  // A member that has left still answers for what it said, under its name and letter.
  const current = discussion.members.find((each) => each.id === post.memberId)
  const member = current ?? discussion.formerMembers.find((each) => each.id === post.memberId)
  const summary = post.kind === 'summary' && post.state === 'done'
  return (
    <article className="discussion-msg" data-kind={post.kind} data-state={post.state}>
      <MemberFace member={member} letter={post.memberId ? memberLetter(discussion, post.memberId) : null} />
      <div className="discussion-msg-body">
        <PostHead post={post} member={member} chair={member !== undefined && member.id === discussion.chairId} left={member !== undefined && current === undefined} />
        {summary ? (
          <div className="discussion-bubble discussion-summary">
            <div className="discussion-summary-head">{t('DiscussionView.discussionSummary')}</div>
            <div className="discussion-summary-body"><ChatMarkdown text={post.text} /></div>
            <div className="discussion-summary-foot">
              <span>{tr('DiscussionView.membersRounds', { value1: discussion.members.length, value2: topic.rounds })}</span>
              <button type="button" className="link-button" onClick={() => void taskFromSummary(discussion, topic.text, post)}>{t('DiscussionView.createTaskFromConclusions')}</button>
            </div>
          </div>
        ) : (
          <div className="discussion-bubble" data-failed={post.state === 'failed' || undefined}>
            {post.state === 'pending' ? <PendingPost member={member} /> : (
              <>
                {post.text && <ChatMarkdown text={post.text} />}
                {post.state === 'failed' && <FailedPost error={post.error} />}
              </>
            )}
            {post.kind === 'reply' && post.state === 'done' && post.text.trim() && (
              <div className="discussion-reply-foot">
                <button type="button" className="link-button" onClick={() => void taskFromReply(discussion, member, question, post)}>{t('DiscussionView.createTaskFromAnswer')}</button>
              </div>
            )}
          </div>
        )}
        {post.state !== 'pending' && <PostActions text={post.text} />}
      </div>
    </article>
  )
}

// Under a post, on hover as under a chat reply: copying what was said, as Markdown for a member's.
function PostActions({ text }: { text: string }) {
  if (!text.trim()) return null
  return <div className="discussion-msg-actions"><CopyButton text={text} label={t('DiscussionView.copyPost')} /></div>
}

// What a member's reply answers: the user's latest post before it that named the member.
function askedOf(posts: readonly DiscussionPost[], reply: DiscussionPost): DiscussionPost | undefined {
  return posts.findLast((post) => post.kind === 'user' && post.sequence < reply.sequence && reply.memberId !== null && post.mentions.includes(reply.memberId))
}

// Posts by round, each opened by a note in the middle. The first round's independent answers go one
// after another, or side by side to compare them; the summary is announced by who gives it. A new
// topic the user moved the group on to opens its first round, and its rounds count from there.
function Rounds({ discussion, posts }: { discussion: Discussion; posts: readonly DiscussionPost[] }) {
  const sideBySide = usePreferences((p) => p.discussionSideBySide)
  const rounds = new Map<number, DiscussionPost[]>()
  for (const post of posts) rounds.set(post.round, [...(rounds.get(post.round) ?? []), post])
  const chair = discussion.members.find((member) => member.id === discussion.chairId)
  const moves = posts.filter((post) => post.topic)
  return (
    <>
      {[...rounds].map(([round, list]) => {
        const moved = list.find((post) => post.topic)
        const since = moves.findLast((post) => post.round <= round)
        const shown = round - (since ? since.round - 1 : 0)
        const topic = { text: currentTopic(discussion, since ? [since] : []), rounds: shown }
        const openings = list.filter((post) => post.kind === 'opening')
        const rest = list.filter((post) => post.kind !== 'opening' && !post.topic)
        const what = openings.length > 0 ? t('DiscussionView.independentAnswersHiddenFromEachOther') : list.some((post) => post.kind === 'rebuttal') ? t('DiscussionView.mutualResponses') : null
        return (
          <section key={round} className="discussion-round" aria-label={round === 0 ? t('DiscussionView.opening') : t('DiscussionView.round', { shown: shown })}>
            {moved && (
              <div className="discussion-topic" data-moved="">
                <span className="discussion-post-kind">{t('DiscussionView.newTopic')}</span>
                <ChatMarkdown text={moved.text} />
              </div>
            )}
            {round > 0 && (
              <div className="discussion-system">{tr('DiscussionView.round_897', { shown: shown, value2: what && ` · ${what}`, value3: openings.length > 1 && (
                  <button type="button" className="link-button" aria-pressed={sideBySide} onClick={() => setPreference('discussionSideBySide', !sideBySide)}>
                    {sideBySide ? t('DiscussionView.viewSequentially') : t('DiscussionView.compareSideBySide')}
                  </button>
                ) })}</div>
            )}
            {openings.length > 0 && (
              <div className="discussion-openings" data-side-by-side={(sideBySide && openings.length > 1) || undefined}>
                {openings.map((post) => <Post key={post.id} post={post} discussion={discussion} topic={topic} />)}
              </div>
            )}
            {rest.map((post) => (
              <Fragment key={post.id}>
                {post.kind === 'summary' && <p className="discussion-system">{tr('DiscussionView.discussionEnded', { value1: chair ? t('DiscussionView.summary_901', { value1: chair.name }) : t('DiscussionView.summary') })}</p>}
                <Post post={post} discussion={discussion} topic={topic} question={post.kind === 'reply' ? askedOf(posts, post) : undefined} />
              </Fragment>
            ))}
          </section>
        )
      })}
    </>
  )
}

export function DiscussionView({ id }: { id: string }) {
  const sendLabel = useShortcutHint('send-message', t('ChatComposer.send'))
  const discussion = useCore((s) => s.discussions[id])
  const posts = useDiscussionPosts((all) => all[id])
  const width = usePreferences((s) => s.chatWidth)
  const typeface = useChatTypeface()
  const [renaming, setRenaming] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  // The next send moves the group on to a new topic rather than adding to this one.
  const [asTopic, setAsTopic] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const mentionMenu = useDiscussionMentionMenu({ text, setText, members: asTopic ? [] : discussion?.members ?? [], input })
  const topicsSupported = useDiscussionTopicsSupported()
  // An archived group is read-only until it is taken out again.
  const archived = (discussion?.archivedAt ?? null) !== null
  // Archived before it loaded is not archived just now.
  const membersEditable = useDiscussionMembersSupported() && !archived
  // A group begun without projects has none to change.
  const projectsEditable = useDiscussionProjectsSupported() && (discussion?.projectPaths.length ?? 0) > 0 && !archived
  const projectsBlocked = discussion ? checkEditDiscussionProjects(discussion) !== null : true
  const list = useRef<HTMLDivElement>(null)
  const view = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const find = useChatFindState(id)
  const findOpened = useCallback(() => { pinned.current = false }, [])

  useEffect(() => { if (!posts) void loadDiscussionPosts(id) }, [id, posts])
  // Follows new posts while the user is at the bottom; leaves them be once they scroll up.
  useLayoutEffect(() => {
    const element = list.current
    if (element && !find.open && pinned.current) element.scrollTop = element.scrollHeight
  }, [posts, find.open])

  if (!discussion) return null
  const mentions = asTopic ? [] : mentionedMembers(text, discussion.members)
  const busyNamed = discussion.members.filter((member) => mentions.includes(member.id) && member.status !== 'idle')
  const topicBlocked = checkNewDiscussionTopic(discussion) !== null
  const canSend = !busy && text.trim() !== '' && busyNamed.length === 0 && !(asTopic && topicBlocked)
  const chairId = discussion.chairId

  const act = async (action: DiscussionAction) => {
    setBusy(true)
    await controlDiscussion(id, action)
    setBusy(false)
  }
  // The input empties as the words go, as a chat app's does; refused, they come back, unless
  // something new was typed meanwhile.
  const send = async () => {
    if (!canSend) return
    const said = text.trim()
    setBusy(true)
    setText('')
    pinned.current = true
    const sent = asTopic ? await newDiscussionTopic(id, said) : await postToDiscussion(id, said, mentions)
    setBusy(false)
    if (sent) setAsTopic(false)
    else setText((current) => current || said)
  }
  const mention = (member: DiscussionMember) => {
    const tag = `@${member.name} `
    setText((current) => (current.includes(`@${member.name}`) ? current : `${tag}${current}`))
    input.current?.focus()
  }

  return (
    <section className="detail terminal-view discussion-view" aria-label={t('DiscussionView.groupChat', { value1: discussion.title })}>
      <header className="detail-header conversation-header">
        <DiscussionDot discussion={discussion} />
        <div className="header-meta">
          {renaming
            ? <TitleEditor title={discussion.title} label={t('DiscussionView.groupChatTitle')} onSave={(title) => void renameDiscussion(id, title)} onDone={() => setRenaming(false)} />
            : <button type="button" className="terminal-view-title conversation-title" title={t('ConversationView.clickToRename', { value1: discussion.title })} onClick={() => setRenaming(true)}>{discussion.title}</button>}
          <span className="muted">（{discussion.members.length}）</span>
          <span className="muted">{discussionProgress(discussion)}</span>
          {!projectsEditable && discussion.projectPaths.length > 0 && <span className="muted" title={discussion.projectPaths.join('\n')}>{projectNames(discussion.projectPaths)}</span>}
          {discussion.anonymous && <span className="muted">{t('DiscussionView.anonymousPeerReview')}</span>}
          {archived && <span className="archived-tag">{t('ConversationList.archived')}</span>}
        </div>
        <div className="toolbar">
          {ACTIONS.filter(({ action }) => !archived && checkDiscussionAction(discussion, action) === null).map(({ action, label, hint }) => (
            <button key={action} type="button" className="button discussion-action" data-tooltip={hint} disabled={busy} onClick={() => void act(action)}>
              {action === 'resume' && <PlayIcon />}
              {action === 'stop' && <StopIcon />}
              {label}
            </button>
          ))}
          <button type="button" className="button discussion-action" data-tooltip={t('DiscussionView.startAnotherGroupChatWithTheseMembersProjects')} onClick={() => openDiscussionDraft(discussion)}>{t('DiscussionView.newGroupWithSameMembers')}</button>
          <span className="toolbar-separator" aria-hidden="true" />
          <button type="button" className="tool-button" aria-label={t('BackdropPicker.close')} data-tooltip={t('BackdropPicker.close')} onClick={openOverview}><CloseIcon /></button>
        </div>
      </header>
      <div className="terminal-body">
        <div ref={view} className="chat-view discussion-body" data-width={width} {...typeface}>
          <ChatFind key={id} state={find} scope={view} container={list} onOpen={findOpened} />
          <ul className="discussion-members" aria-label={t('DiscussionDraft.members')}>
            {discussion.members.map((member) => {
              const blocked = checkRemoveDiscussionMember(discussion, member.id)
              return (
                <MemberChip
                  key={member.id}
                  member={member}
                  chair={member.id === chairId}
                  onMention={archived ? null : () => mention(member)}
                  leaveBlocker={blocked === null || blocked === 'full' ? null : LEAVE_BLOCKER[blocked]}
                  onLeave={membersEditable ? () => void leave(discussion, member) : null}
                />
              )
            })}
            {membersEditable && <AddMemberButton discussion={discussion} />}
            {projectsEditable && (
              <li className="discussion-projects" data-tooltip={projectsBlocked ? t('DiscussionView.waitUntilThisRoundEndsToChangeProjects') : t('DiscussionView.theFirstProjectIsFixedOtherProjectsCan')} data-tooltip-align="start">
                <ProjectPicker
                  projects={discussion.projectPaths.map((path) => ({ path, worktreePath: null }))}
                  primaryLocked
                  locked={projectsBlocked}
                  onChange={(paths) => void setDiscussionProjects(id, paths)}
                />
              </li>
            )}
          </ul>
          <div
            ref={list}
            className="chat-list discussion-list"
            onScroll={(event) => {
              const element = event.currentTarget
              pinned.current = !find.open && element.scrollHeight - element.scrollTop - element.clientHeight < 48
            }}
          >
            <div className="discussion-topic">
              <span className="discussion-post-kind">{t('DiscussionDraft.topic')}</span>
              <ChatMarkdown text={discussion.topic} />
            </div>
            {posts ? <Rounds discussion={discussion} posts={posts} /> : <p className="muted">{tr('DiscussionView.loadingPosts', { value1: <Spinner /> })}</p>}
          </div>
          <div className="chat-dock">
            {archived && <ArchivedBar what={t('DiscussionView.groupChat_910')} onRestore={() => archiveDiscussion(id, false)} />}
            <div className="chat-input-card" data-working={busy || undefined} hidden={archived}>
              {mentionMenu.menu}
              <textarea
                ref={input}
                className="chat-input"
                rows={2}
                value={text}
                aria-label={t('DiscussionView.posts')}
                placeholder={asTopic
                  ? t('DiscussionView.writeANewTopicIndependentAnswersUpTo', { value1: discussion.maxRounds })
                  : discussion.state === 'done' || discussion.state === 'paused'
                  ? t('DiscussionView.addThoughtsOrQuestionsForAnotherRoundMember')
                  : t('DiscussionView.addANoteForEveryoneToSeeNext')}
                {...mentionMenu.inputProps}
                onChange={(event) => {
                  setText(event.target.value)
                  mentionMenu.track(event.target)
                }}
                onKeyDown={(event) => {
                  if (mentionMenu.onKeyDown(event)) return
                  if (!sendsMessage(event)) return
                  event.preventDefault()
                  void send()
                }}
              />
              <div className="chat-options">
                {topicsSupported && (
                  <div className="segmented discussion-send-mode" role="radiogroup" aria-label={t('DiscussionView.sentMessages')}>
                    {SEND_MODES.map(({ topic, label, hint }) => {
                      const blocked = topic && topicBlocked && !asTopic
                      return (
                        <button
                          key={label}
                          type="button"
                          role="radio"
                          aria-checked={asTopic === topic}
                          aria-disabled={blocked || undefined}
                          disabled={busy}
                          data-tooltip={blocked ? t('DiscussionView.membersAreStillSpeakingPauseOrWaitUntil') : hint}
                          onClick={() => {
                            if (blocked) return
                            setAsTopic(topic)
                            input.current?.focus()
                          }}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                )}
                {asTopic && topicBlocked && <span className="chat-options-note muted">{t('DiscussionView.membersAreStillSpeakingPauseOrWaitUntil_917')}</span>}
                {busyNamed.length > 0 && <span className="chat-options-note muted">{tr('DiscussionView.isStillSpeakingWaitBeforeAskingAgain', { value1: busyNamed.map((member) => member.name).join('、') })}</span>}
                <span className="chat-dock-spacer" />
                <button type="button" className="chat-input-button" aria-label={sendLabel} data-tooltip={sendLabel} data-tooltip-side="top-end" disabled={!canSend} onClick={() => void send()}>
                  <EnterIcon />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
