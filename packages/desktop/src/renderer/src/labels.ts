import { getLocale, localized, t } from './i18n'
import { agentDescriptor, type AgentKind, type SourceFailure, type SourceProblem, type TaskStatus } from '@antumi/protocol'

export const STATUS_LABEL: Record<TaskStatus, string> = localized(() => ({
  pending: t('labels.pending'),
  running: t('TaskActivity.running'),
  review: t('SquadWorkPanel.awaitingReview'),
  done: t('ChatTodos.completed'),
  abandoned: t('ChatRequestCards.cancelled')
}))

export const STATUS_HINT: Record<TaskStatus, string> = localized(() => ({
  pending: t('labels.notAssignedToAgentYet'),
  running: t('labels.agentIsExecuting'),
  review: t('labels.agentFinishedReviewTheResultThenAcceptRequest'),
  done: t('labels.resultAcceptedDependentTasksCanNowRun'),
  abandoned: t('labels.cancelledCanBeReopened')
}))

export function agentLabel(kind: AgentKind): string {
  return agentDescriptor(kind).label
}

const SOURCE_FAILURE_TEXT: Record<SourceFailure, string> = localized(() => ({
  'not-configured': t('labels.notConfiguredOrNotSignedIn'),
  'invalid-settings': t('labels.invalidSettings'),
  'auth-failed': t('labels.authenticationFailedAccountOrTokenIsInvalidOr'),
  forbidden: t('labels.noPermissionToAccessTheseIssues'),
  'bad-query': t('labels.invalidFilterQuery'),
  'not-found': t('labels.issueNotFoundItMayBeDeletedOr'),
  'request-failed': t('labels.cannotConnect'),
  'response-too-large': t('labels.responseIsTooLargeAndWasRejected'),
  'login-cancelled': t('labels.signInCancelled'),
  'login-timeout': t('labels.signInEndedAfterWaitingTooLong')
}))

// The tracker's own words say which part is wrong, or what the network did.
export function sourceProblemText(problem: SourceProblem): string {
  const text = SOURCE_FAILURE_TEXT[problem.code]
  const specific = ['invalid-settings', 'bad-query', 'request-failed'].includes(problem.code)
  return specific ? `${text}（${problem.message}）` : text
}

const REASON_TEXT: Record<string, string> = localized(() => ({
  'squad-leader-read-only': t('squad.leaderReadOnly'),
  'squad-developer-required': t('squad.developerRequired'),
  'squad-member-duplicate': t('squad.memberDuplicate'),
  'squad-busy': t('labels.squadIsDevelopingStopItOrWaitUntil'),
  'squad-archived': t('labels.squadIsArchivedRestoreItOrChooseAnother'),
  'squad-managed': t('labels.memberExecutionIsCoordinatedByTheSquadUse'),
  'squad-not-leader': t('labels.onlyTheLeaderExecutingThisTaskCanAssign'),
  'squad-run-not-found': t('labels.noSquadRunToResumeStartSquadDevelopment'),
  'squad-work-unfinished': t('labels.handleUnfinishedOrFailedWorkFirst'),
  'squad-member-invalid': t('labels.thisMemberCannotTakeThisAssignment'),
  'squad-schedule-unsupported': t('labels.schedulingSquadTasksIsNotSupportedYet'),
  'read-only-workspace': t('labels.thisMemberCanOnlyReadTheWorkspaceAssign'),

  ...Object.fromEntries(Object.entries(SOURCE_FAILURE_TEXT).map(([code, text]) => [`source-${code}`, text])),
  'source-already-imported': t('labels.thisIssueHasAlreadyBeenImportedAsA'),
  'attachment-not-image': t('labels.onlyPngJpegGifAndWebpImagesAre'),
  'attachment-too-many-pixels': t('labels.imageDimensionsExceed40MillionPixelsOr16384'),
  'attachment-too-large': t('labels.imageExceeds10mb'),
  'attachment-not-found': t('labels.imageFileNoLongerExists'),
  'attachment-busy': t('labels.tooManySimultaneousImageUploadsTryAgainShortly'),
  'too-many-images': t('labels.upTo20ImagesPerTask'),
  'source-invalid-key': t('labels.invalidIssueKey'),
  'source-unknown': t('labels.taskSourceNotFound'),
  'source-none': t('labels.thisTaskWasNotImportedFromASource'),
  'source-login-in-progress': t('labels.aSignInIsAlreadyInProgressFor'),
  'source-login-not-found': t('labels.signInHasEnded'),
  'source-login-stale': t('labels.thisQuestionHasExpiredSignInAgain'),
  'invalid-transition': t('labels.thisMoveIsUnavailableInTheCurrentState'),
  'not-pending': t('labels.onlyPendingTasksCanStartPreviouslyExecutedTasks'),
  'not-done': t('labels.onlyTasksAwaitingReviewOrCompletedTasksCan'),
  'missing-repo': t('labels.addAProjectFirst'),
  'missing-agent': t('labels.chooseAnAgentFirst'),
  'missing-dependencies': t('TaskDetail.autoRunNeedsDependencies'),
  'agent-unattended-unsupported': t('TaskDetail.autoRunUnsupportedAgent'),
  'auto-run-cancelled': t('TaskDetail.autoRunCancelled'),
  'repo-not-found': t('labels.projectPathDoesNotExist'),
  'repo-path-not-absolute': t('labels.projectPathMustBeAbsoluteIsSupported'),
  'repo-not-git': t('labels.everyDirectoryMustBeAGitRepositoryWhen'),
  'repo-duplicate': t('labels.twoProjectPathsPointToTheSameGit'),
  'task-running': t('labels.cannotChangeProjectsWhileExecuting'),
  'task-abandoned': t('labels.reopenTheCancelledTaskBeforeChangingProjects'),
  'primary-fixed': t('labels.thePrimaryProjectIsFixedAfterChatStarts'),
  'branch-exists': t('labels.theTaskBranchAlreadyExistsItsStartingPoint'),
  'primary-reference': t('labels.thePrimaryProjectCannotBeAReference'),
  'worktree-exists': t('labels.thisProjectAlreadyHasAWorktree'),
  'repo-reference': t('labels.aReferenceProjectHasNoStartingPoint'),
  'task-active': t('labels.taskIsNotCompletedOrCancelled'),
  'conversation-open': t('labels.conversationStillExistsDeleteItBeforeCleaningIts'),
  'worktree-not-git': t('labels.eachProjectMustBeAGitRepositoryTo'),
  'worktree-locked': t('labels.lockedWithGitWorktreeLock'),
  'worktree-unreadable': t('labels.cannotReadItsGitStatus'),
  'worktree-dirty': t('labels.hasUncommittedChanges'),
  'worktree-alone': t('labels.hasCommitsNotReachableFromAnotherReference'),
  'worktree-not-found': t('labels.worktreeNotFoundItMayHaveBeenDeleted'),
  'worktree-in-use': t('labels.agentIsWorkingInThisDirectory'),
  'uncommitted-changes': t('labels.commitOrStashUncommittedChangesFirst'),
  'branch-elsewhere': t('labels.thisBranchIsCheckedOutInAnotherWorktree'),
  'branch-not-found': t('labels.branchNotFound'),
  'branch-switch-failed': t('labels.failedToSwitchBranch'),
  'invalid-branch-name': t('labels.invalidBranchName'),
  'invalid-tag-name': t('labels.invalidTagName'),
  'branch-name-taken': t('labels.aBranchWithThisNameAlreadyExists'),
  'git-no-changes': t('ConversationBranches.noChangesToCommit'),
  'git-no-branch': t('labels.noLocalBranchIsCheckedOutSwitchTo'),
  'git-no-remote': t('labels.currentBranchHasNoUpstreamAndProjectHas'),
  'git-update-diverged': t('labels.branchDivergedSwitchToUpdate'),
  'invalid-start': t('labels.startingPointMustBeABranch'),
  'start-not-found': t('labels.selectedStartingBranchNotFoundChooseAnotherIn'),
  blocked: t('labels.dependenciesAreNotCompletedAndAcceptedYet'),
  'dependency-cycle': t('labels.dependencyCyclesAreNotAllowed'),
  'worktree-failed': t('labels.failedToCreateGitWorktree'),
  'daemon-unavailable': t('labels.terminalDaemonIsNotRunningPnpmDevDaemon'),
  'port-process-changed': t('labels.serviceStoppedOrPortOwnershipChangedRefreshAnd'),
  'port-process-protected': t('PortsPanel.thisIsAnAgentProcessAndCannotBe'),
  'command-not-found': t('labels.agentCommandClaudeOrCodexNotFoundInstall'),
  'command-needs-shell': t('labels.thisWindowsCommandRequiresCmdAntumiStartsAgents'),
  'run-in-progress': t('labels.taskIsStartingPleaseWait'),
  'task-not-found': t('labels.taskNotFound'),
  'session-not-found': t('labels.conversationNoLongerExists'),
  'conversation-not-found': t('labels.conversationNotFound'),
  'conversation-running': t('labels.thisConversationSAgentIsStartingTryAgain'),
  'agent-capacity': t('labels.agentConcurrencyLimitReachedWaitForOtherConversations'),
  'conversation-same-agent': t('labels.chooseAnotherAgentForHandoff'),
  'invalid-workspace': t('labels.projectMustBeAnExistingAbsoluteDirectory'),
  'too-many-projects': t('labels.upTo10ProjectsPerConversation'),
  'duplicate-project': t('labels.theSameProjectDirectoryCannotBeSelectedTwice'),
  'skills-unavailable': t('labels.thisCoreHasNoSkillsLibrary'),
  'skills-invalid-url': t('labels.onlyHttpsGitRepositoryUrlsAreAccepted'),
  'skills-already-installed': t('labels.thisRepositoryIsAlreadyInstalled'),
  'skills-none-found': t('labels.noUsableSkillsFoundSkillsNameSkillMd'),
  'skills-search-failed': t('labels.skillMarketSearchFailed'),
  'skills-unknown': t('labels.skillRepositoryNotFound'),
  'skills-nothing-to-rollback': t('labels.noVersionToRollBackTo'),
  'skills-bad-commit': t('labels.commitNotFoundInRepositoryCheckForUpdates'),
  'skills-name-conflict': t('labels.twoRepositoriesContainSkillsWithTheSameName'),
  'skills-too-large': t('labels.skillFileIsTooLarge'),
  'mcp-unavailable': t('labels.thisCoreCannotManageMcpServers'),
  'mcp-unknown': t('labels.mcpServerNotFound'),
  'mcp-name-taken': t('labels.anMcpServerWithThisNameAlreadyExists'),
  'mcp-duplicate-key': t('labels.theSameKeyWasEnteredTwice'),
  'mcp-relative-cwd': t('labels.workingDirectoryMustBeAnAbsolutePath'),
  'mcp-insecure-url': t('labels.remoteServersRequireHttpsHttpIsAllowedOnly'),
  'mcp-import-gone': t('labels.thisServerIsNoLongerInTheOriginal'),
  'mcp-import-unsupported': t('labels.thisServerCannotBeImported'),
  'chat-starting': t('labels.agentIsStillStartingWaitBeforeSending'),
  'chat-busy': t('labels.agentIsStillProcessingThePreviousMessage'),
  'chat-image-too-large': t('labels.claudeCodeAcceptsImagesUpTo5mb'),
  'chat-idle': t('labels.noTurnIsCurrentlyRunning'),
  'chat-request-gone': t('labels.thisRequestIsNoLongerAwaitingAnAnswer'),
  'browser-unavailable': t('labels.browserIsNotRunning'),
  'browser-app-closed': t('labels.theBrowserRunsInTheAntumiAppOpen'),
  'browser-app-outdated': t('labels.antumiAppAndCoreVersionsDifferUpdateThem'),
  'browser-tab-not-found': t('labels.tabHasBeenClosed'),
  'browser-not-watching': t('labels.openThisConversationSBrowserPanelFirst'),
  'browser-user-driving': t('labels.youAreControllingThisTab'),
  'browser-ref-not-found': t('labels.elementIsNoLongerOnThePage'),
  'chat-not-running': t('labels.thisConversationSAgentIsNotRunningIn'),
  'chat-session': t('labels.thisIsNotATerminalPanelShellAnd'),
  'chat-start-timeout': t('labels.agentStartupTimedOut'),
  'daemon-outdated': t('labels.runningDaemonIsTooOldForChatRestart'),
  'stage-not-found': t('labels.earlierChatHistoryNotFound'),
  'chat-option-invalid': t('labels.thisOptionIsUnavailableHere'),
  'chat-nothing-queued': t('labels.noQueuedMessages'),
  'chat-no-steer': t('labels.thisAgentCannotAcceptInstructionsDuringATurn'),
  'chat-no-stop': t('labels.thisAgentCannotStopBackgroundWork'),
  'chat-not-stoppable': t('labels.noLongerRunningInBackground'),
  planning: t('labels.dependenciesAreUnfinishedContinuePlanningInChatOr'),
  'plan-only': t('labels.dependenciesAreUnfinishedYouCanPlanButCannot'),
  'not-planning': t('labels.onlyReadOnlyPlansNeedSavingApprovedExecution'),
  'not-running': t('labels.onlyRunningTasksCanBeSubmittedForReview'),
  'not-chat': t('labels.thisTaskHasNoChatAndCannotBe'),
  'agent-working': t('labels.agentIsStillWorkingSubmitAfterThisTurn'),
  'check-running': t('labels.projectChecksAreRunningWaitUntilTheyFinish'),
  'check-failed': t('labels.projectChecksFailedOutputWasSentToAgent'),
  'project-config-untrusted': t('labels.commandsInProjectConfigurationHaveNotBeenApproved'),
  'project-config-changed': t('labels.projectConfigurationChangedConfirmItAgain'),
  'project-config-unavailable': t('labels.thisCoreDoesNotSupportProjectConfiguration'),
  'no-chat': t('labels.thisTaskHasNotStartedAChat'),
  abandoned: t('labels.reopenTheCancelledTaskBeforeContinuing'),
  'task-done': t('labels.completedTasksCannotBeCancelled'),
  'quick-unsupported': t('labels.thisAgentDoesNotSupportThisOperationYet'),
  'quick-failed': t('labels.agentReturnedNoResult'),
  'quick-timeout': t('labels.agentResponseTimedOut'),
  'task-cancelled': t('labels.taskHasBeenCancelled'),
  'not-cancelled': t('labels.onlyCancelledTasksCanBeReopened'),
  'task-redone': t('labels.aSuccessorTaskAlreadyContinuesThisTaskIt'),
  'task-conversation': t('labels.thisConversationBelongsToATaskContinueFrom'),
  'managed-workspace': t('labels.conversationsWithoutAProjectRunInAntumiS'),
  'chat-unavailable': t('labels.thisCoreDoesNotSupportChat'),
  'dependencies-unfinished': t('labels.dependenciesAreUnfinishedOnlyPlanningIsAvailable'),
  'already-scheduled': t('labels.thisTaskIsAlreadyScheduled'),
  'schedule-settled': t('labels.thisScheduleIsNoLongerWaiting'),
  'schedule-busy': t('labels.thisScheduleIsStarting'),
  'schedule-not-found': t('labels.scheduleNotFound'),
  'schedule-no-text': t('labels.onlyConversationSchedulesCarryMessages'),
  'routine-not-found': t('labels.routineNotFound'),
  'discussion-not-found': t('labels.groupChatNotFound'),
  'discussion-member': t('labels.groupMembersCannotBeHandedOffToAnother'),
  'discussion-member-not-found': t('labels.memberNotFoundInGroupChat'),
  'discussion-member-busy': t('labels.theMentionedMemberIsStillAnsweringWaitUntil'),
  'discussion-not-running': t('labels.groupChatIsNotRunning'),
  'discussion-not-paused': t('labels.groupChatIsRunningPauseItOrWait'),
  'discussion-summing-up': t('labels.theChairIsWritingASummary'),
  'discussion-done': t('labels.groupChatHasAlreadyBeenSummarized'),
  'discussion-busy': t('labels.membersAreSpeakingPauseOrWaitBeforeChanging'),
  'no-reply': t('labels.agentReturnedNoTextAnswer'),
  'fork-turn-running': t('labels.thisTurnIsUnfinishedWaitBeforeForking'),
  'chat-item-not-found': t('labels.messageNotFound'),
  'routine-paused': t('labels.routineIsPaused'),
  'previous-running': t('labels.previousRunIsUnfinishedSkippingThisRun'),
  'routine-invalid-schedule': t('labels.recurringRuleHasNoTimeSpecified'),
  'routine-no-prompt': t('labels.routineNeedsInstructionsOrAnImage'),
  'agent-lost': t('labels.agentExitedWithoutLeavingAResult'),
  'task-started': t('labels.taskHasAlreadyStarted'),
  'task-finished': t('labels.taskIsNoLongerRunning'),
  'user-continued': t('labels.youResumedThisConversationYourself'),
  'plan-answered': t('labels.planAnsweredBeforeItsTime'),
  'agent-changed': t('labels.conversationHandedOffToAnotherAgent'),
  superseded: t('labels.quotaLimitReachedAgainUsingTheLatestLimit'),
  'auto-continue-off': t('labels.autoResumeAfterQuotaResetWasDisabled'),
  'usage-limit-settled': t('labels.thisQuotaLimitEventIsAlreadySettled'),
  'usage-limit-busy': t('labels.retryingPleaseWait'),
  'usage-limit-not-found': t('labels.quotaLimitRecordNotFound'),
  'usage-limit-retry-failed': t('labels.retryCouldNotResume')
}))

// Reasons whose message says what went wrong in the agent's own words, kept after the summary.
const REASON_WITH_DETAIL: Record<string, string> = localized(() => ({
  'skills-none-found': t('labels.noUsableSkillsFoundSkillsNameSkillMd'),
  'skills-name-conflict': t('labels.twoRepositoriesContainSkillsWithTheSameName'),
  'skills-invalid-selection': t('labels.skillSelectionInvalid'),
  'skills-update-confirmation': t('labels.skillUpdateConfirmation'),
  'chat-start-failed': t('labels.agentCouldNotStartInChatMode'),
  'chat-session-lost': t('labels.agentSOriginalSessionNoLongerExists'),
  // Chromium's own word on it (net::ERR_NAME_NOT_RESOLVED, a certificate), which says what to fix.
  'browser-navigation-failed': t('labels.cannotOpenPage'),
  'git-commit-failed': t('labels.commitFailed'),
  'git-push-failed': t('labels.commitWasKeptLocallyButPushFailed'),
  // core's own words name the branches involved.
  'git-push-name-mismatch': t('labels.notPushed'),
  'git-branch-changed': t('labels.notPushed'),
  'git-push-rejected': t('labels.pushRejected'),
  'git-operation-failed': t('labels.gitOperationFailed'),
  // Which file and what is wrong with it.
  'project-config-invalid': t('labels.invalidProjectConfigurationAntumiProjectJson')
}))

export function reasonText(reason: string, fallback: string): string {
  const summary = REASON_WITH_DETAIL[reason]
  if (summary) return fallback && fallback !== reason ? `${summary}：${fallback}` : summary
  return REASON_TEXT[reason] ?? fallback
}

function clock(date: Date): string {
  return date.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function timeOfDay(ms: number): string {
  return clock(new Date(ms))
}

// "9月25日 09:28": this app's timestamps are recent enough that the year is noise.
export function dayAndTime(ms: number): string {
  const date = new Date(ms)
  if (getLocale() === 'en') return `${date.toLocaleDateString('en', { month: 'short', day: 'numeric' })} ${clock(date)}`
  return t('labels.dateAndTime', { value1: date.getMonth() + 1, value2: date.getDate(), value3: clock(date) })
}

// A day and time in a chat, with the year once it is not this one: a conversation can go on for
// longer than the rest of the app's timestamps.
export function chatDayAndTime(ms: number, now = Date.now()): string {
  const year = new Date(ms).getFullYear()
  if (getLocale() === 'en' && year !== new Date(now).getFullYear()) {
    const date = new Date(ms)
    return `${date.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' })} ${clock(date)}`
  }
  return year === new Date(now).getFullYear() ? dayAndTime(ms) : t('labels._2502', { year: year, value2: dayAndTime(ms) })
}

// A chat message's time: the time alone today, and the day too before that, so a conversation
// picked up again days later still says when each message was.
export function messageTime(ms: number, now = Date.now()): string {
  const date = new Date(ms)
  return date.toDateString() === new Date(now).toDateString() ? clock(date) : chatDayAndTime(ms, now)
}

// How long ago, in a list that only needs to say roughly: past a month the day itself reads better.
export function agoText(ms: number, now = Date.now()): string {
  const minutes = Math.floor((now - ms) / 60_000)
  if (minutes < 1) return t('conversationState.justNow')
  if (minutes < 60) return t('conversationState.minutesAgo', { minutes: minutes })
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days === 0) return t('labels.hoursAgo', { value1: Math.floor(minutes / 60) })
  if (days === 1) return t('labels.yesterday')
  if (days < 7) return t('conversationState.daysAgo', { days: days })
  if (days < 28) return t('labels.weeksAgo', { value1: Math.floor(days / 7) })
  const date = new Date(ms)
  const day = t('SourceInboxView.monthAndDay', { value1: date.getMonth() + 1, value2: date.getDate() })
  return date.getFullYear() === new Date(now).getFullYear() ? day : t('SourceInboxView._1782', { value1: date.getFullYear(), day: day })
}
