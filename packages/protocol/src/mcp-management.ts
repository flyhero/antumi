export const MANAGEMENT_TOOLS = {
  profileList: 'antumi_agent_profile_list',
  profileCreate: 'antumi_agent_profile_create',
  squadList: 'antumi_squad_list',
  squadCreate: 'antumi_squad_create',
  scheduleList: 'antumi_schedule_list',
  scheduleCreate: 'antumi_schedule_create',
  routineList: 'antumi_routine_list',
  routineCreate: 'antumi_routine_create',
  skillList: 'antumi_skill_list',
  skillSearch: 'antumi_skill_search',
  skillInstall: 'antumi_skill_install',
  skillSetActivation: 'antumi_skill_set_activation',
  commandList: 'antumi_chat_command_list',
  commandCreate: 'antumi_chat_command_create'
} as const

export const MANAGEMENT_READ_TOOLS: readonly string[] = [
  MANAGEMENT_TOOLS.profileList, MANAGEMENT_TOOLS.squadList,
  MANAGEMENT_TOOLS.scheduleList, MANAGEMENT_TOOLS.routineList,
  MANAGEMENT_TOOLS.skillList, MANAGEMENT_TOOLS.skillSearch, MANAGEMENT_TOOLS.commandList
]
