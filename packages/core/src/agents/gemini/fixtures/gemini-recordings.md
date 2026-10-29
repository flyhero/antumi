# Gemini CLI recordings

Captured from the official `@google/gemini-cli` npm release **0.66.0** on 2026-10-29.
Installed with `npm install --prefix /tmp/antumi-gemini/prefix @google/gemini-cli@0.66.0`.
The process used an isolated `GEMINI_CLI_HOME`, `security.auth.selectedType: gemini-api-key`,
a fake `GEMINI_API_KEY`, and `GOOGLE_GEMINI_BASE_URL` pointing to a local scripted HTTP server.
No real Google credentials or model calls were used.

- `gemini-session.jsonl`: initialize and session/new, Plan → Default, `@mention.txt`,
  a shell command and approval, an edited file and approval, an Antumi MCP tool and approval,
  final response, context occupancy and prompt usage.
- `gemini-plan.jsonl`: initialize and session/new, Plan, write a Markdown file in Gemini's
  session-specific plans directory, native exit_plan_mode approval, Default and final response.

Session IDs, Node executable, temporary directories and the local MCP script path are normalized.
Logical timestamps preserve wire order; an outbound prompt gets a stable Antumi message ref.
All built-in commands are retained. The CLI and its environment were not patched.

The mock returned SSE `GenerateContentResponse` objects with one candidate, `finishReason: STOP`,
and either a functionCall or final text. Each response had promptTokenCount=100,
candidatesTokenCount=20, cachedContentTokenCount=30 and thoughtsTokenCount=5. The session invokes
run_shell_command, write_file and mcp_antumi_show_preview before its final text; the plan invokes
write_file and exit_plan_mode before its final text. Other generateContent calls return final text,
and countTokens returns totalTokens=100. The local MCP server offers one `show_preview` tool,
returning the text `Preview shown`.

Observed details:

- Tool ids are `<registered_name>__<model_call_id>`; input/output objects are absent.
- Mode changes are `[MODE_UPDATE] <mode>` text chunks, including outside a prompt.
- A plan write's completed diff has its entire newText; the permission has only its path.
- Prompt input includes cached tokens; thoughtTokens are separate from outputTokens.
- The MCP override ELECTRON_RUN_AS_NODE was explicitly blocked by the official CLI. Using
  system Node succeeds; production MCP launch uses Node instead of Electron accordingly.
- On macOS the recorder must use canonical temporary paths (`/private/tmp`), otherwise Gemini's
  plan policy can deny a path that passes its own plan-path validation.
- Shell output is empty in the captured completed update, despite the command succeeding.

Native resume is deliberately not used in Antumi v1. Its unbounded late history replay is
documented in [#29707](https://github.com/google-gemini/gemini-cli/issues/29707); conversation
tests verify that continuations and forks use session/new with an Antumi history handoff.
