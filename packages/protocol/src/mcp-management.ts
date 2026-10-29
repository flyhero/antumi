export const MANAGEMENT_TOOLS = {
  profileList: 'antumi_agent_profile_list',
  profileCreate: 'antumi_agent_profile_create',
  profileUpdate: 'antumi_agent_profile_update',
  squadList: 'antumi_squad_list',
  squadCreate: 'antumi_squad_create',
  squadUpdate: 'antumi_squad_update',
  scheduleList: 'antumi_schedule_list',
  scheduleCreate: 'antumi_schedule_create',
  scheduleUpdate: 'antumi_schedule_update',
  routineList: 'antumi_routine_list',
  routineCreate: 'antumi_routine_create',
  routineUpdate: 'antumi_routine_update',
  skillList: 'antumi_skill_list',
  skillSearch: 'antumi_skill_search',
  skillInstall: 'antumi_skill_install',
  skillSetActivation: 'antumi_skill_set_activation',
  commandList: 'antumi_chat_command_list',
  commandCreate: 'antumi_chat_command_create',
  commandUpdate: 'antumi_chat_command_update'
} as const

export const MANAGEMENT_READ_TOOLS: readonly string[] = [
  MANAGEMENT_TOOLS.profileList, MANAGEMENT_TOOLS.squadList,
  MANAGEMENT_TOOLS.scheduleList, MANAGEMENT_TOOLS.routineList,
  MANAGEMENT_TOOLS.skillList, MANAGEMENT_TOOLS.skillSearch, MANAGEMENT_TOOLS.commandList
]

// Edits of what is already saved: they change it in place, and the same call twice leaves it as once.
export const MANAGEMENT_EDIT_TOOLS: readonly string[] = [
  MANAGEMENT_TOOLS.profileUpdate, MANAGEMENT_TOOLS.squadUpdate, MANAGEMENT_TOOLS.scheduleUpdate,
  MANAGEMENT_TOOLS.routineUpdate, MANAGEMENT_TOOLS.commandUpdate
]
