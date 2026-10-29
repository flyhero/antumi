import type { ReactElement } from 'react'
import type { AgentKind } from '@antumi/protocol'
import cursorMark from '../assets/cursor.svg'

// Line icons on a 20px grid; they take the button's text color.
const stroked = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true
} as const

export function HelpIcon() {
  return (
    <svg {...stroked}>
      <circle cx="10" cy="10" r="7" />
      <path d="M7.8 7.5a2.2 2.2 0 0 1 4.4 0c0 1.5-2.2 1.7-2.2 3.2M10 13.5v.1" />
    </svg>
  )
}

export function StarIcon() {
  return <svg {...stroked}><path d="m10 2.5 2.3 4.7 5.2.8-3.7 3.7.9 5.2-4.7-2.5-4.7 2.5.9-5.2L2.5 8l5.2-.8L10 2.5Z" /></svg>
}

export function PlayIcon() {
  return (
    <svg {...stroked}>
      <path d="M6.5 4.9v10.2a.7.7 0 0 0 1.05.6l8.1-5.1a.7.7 0 0 0 0-1.2l-8.1-5.1a.7.7 0 0 0-1.05.6z" />
    </svg>
  )
}

export function PauseIcon() {
  return (
    <svg {...stroked}>
      <rect x="5.5" y="4.5" width="3" height="11" rx="0.8" />
      <rect x="11.5" y="4.5" width="3" height="11" rx="0.8" />
    </svg>
  )
}

export function CheckIcon() {
  return (
    <svg {...stroked}>
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  )
}

// Handing work in for review: a checked clipboard. An arrow into a tray read as a download.
export function SubmitIcon() {
  return (
    <svg {...stroked}>
      <path d="M7 4H5.8A1.3 1.3 0 0 0 4.5 5.3v10.4A1.3 1.3 0 0 0 5.8 17h8.4a1.3 1.3 0 0 0 1.3-1.3V5.3A1.3 1.3 0 0 0 14.2 4H13" />
      <rect x="7" y="2.8" width="6" height="2.6" rx=".8" />
      <path d="M7.3 11.2l1.9 1.9 3.6-3.8" />
    </svg>
  )
}

export function ReopenIcon() {
  return (
    <svg {...stroked}>
      <path d="M3.5 10a6.5 6.5 0 1 0 6.5-6.5 7 7 0 0 0-4.9 2L3.5 7" />
      <path d="M3.5 3.5V7H7" />
    </svg>
  )
}

export function MoreIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="10" r="1.4" />
      <circle cx="10" cy="10" r="1.4" />
      <circle cx="15" cy="10" r="1.4" />
    </svg>
  )
}

export function CloseIcon() {
  return (
    <svg {...stroked}>
      <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
    </svg>
  )
}

export function PlusIcon() {
  return (
    <svg {...stroked}>
      <path d="M10 4.5v11M4.5 10h11" />
    </svg>
  )
}

export function MaximizeIcon() {
  return (
    <svg {...stroked}>
      <path d="M11.5 4h4.5v4.5M8.5 16H4v-4.5M16 4l-5 5M4 16l5-5" />
    </svg>
  )
}

export function RestoreIcon() {
  return (
    <svg {...stroked}>
      <path d="M15.5 9H11V4.5M4.5 11H9v4.5M11 9l5-5M9 11l-5 5" />
    </svg>
  )
}

export function ChevronDownIcon() {
  return (
    <svg {...stroked}>
      <path d="M6 8l4 4 4-4" />
    </svg>
  )
}

// Claude's own mark, from Simple Icons 16.32.0 (the drawing is CC0; the logo is Anthropic's trademark).
function ClaudeMark() {
  return (
    <svg className="agent-mark agent-mark-claude" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  )
}

// OpenAI's blossom from openai.com/brand, used under its logo terms: the path unaltered, black or
// white only. The viewBox trims the file's wide margin so it matches Claude's size; some clear space stays.
function CodexMark() {
  return (
    <svg className="agent-mark agent-mark-codex" viewBox="138 138 440 440" fill="currentColor" aria-hidden="true">
      <path d="M508.749 317.399C516.777 287.314 508.991 253.884 485.389 230.282C461.788 206.681 428.36 198.895 398.273 206.923C376.231 184.928 343.39 174.956 311.148 183.596C278.906 192.234 255.45 217.292 247.36 247.361C217.291 255.451 192.233 278.91 183.595 311.149C174.957 343.391 184.927 376.232 206.924 398.274C198.896 428.359 206.683 461.789 230.284 485.391C253.885 508.992 287.313 516.779 317.401 508.75C339.442 530.745 372.286 540.717 404.525 532.079C436.767 523.441 460.223 498.384 468.313 468.315C498.383 460.224 523.44 436.766 532.078 404.526C540.716 372.285 530.747 339.443 508.749 317.402V317.399ZM470.899 244.776C486.892 260.77 493.488 282.601 490.687 303.412L415.577 260.046C412.411 258.218 408.509 258.218 405.345 260.046L317.401 310.82V277.526C317.401 275.191 318.652 273.005 320.676 271.837L387.644 233.174C414.178 218.353 448.346 222.223 470.901 244.776H470.899ZM357.837 311.144L398.275 334.491V381.185L357.837 404.532L317.398 381.185V334.491L357.837 311.144ZM264.776 269.693C265.207 239.305 285.644 211.649 316.453 203.393C338.3 197.54 360.505 202.744 377.127 215.573L302.014 258.937C298.848 260.764 296.898 264.144 296.898 267.798V369.346L268.065 352.699C266.043 351.531 264.776 349.353 264.776 347.017V269.691V269.693ZM203.391 316.454C209.244 294.608 224.854 277.978 244.276 269.999V356.73C244.276 360.384 246.226 363.763 249.392 365.591L337.337 416.365L308.503 433.013C306.481 434.181 303.961 434.188 301.939 433.02L234.971 394.357C208.868 378.789 195.138 347.261 203.391 316.454ZM244.775 470.9C228.781 454.906 222.186 433.075 224.986 412.264L300.096 455.63C303.263 457.457 307.164 457.457 310.328 455.63L398.273 404.856V438.149C398.273 440.485 397.022 442.671 394.997 443.839L328.029 482.502C301.495 497.322 267.327 493.452 244.772 470.9H244.775ZM450.897 445.982C450.466 476.371 430.029 504.027 399.22 512.283C377.373 518.136 355.168 512.932 338.547 500.102L413.659 456.738C416.826 454.911 418.775 451.532 418.775 447.877V346.329L447.609 362.977C449.631 364.145 450.897 366.323 450.897 368.659V445.985V445.982ZM512.282 399.221C506.429 421.068 490.819 437.697 471.397 445.676V358.946C471.397 355.292 469.448 351.912 466.281 350.085L378.336 299.311L407.17 282.663C409.192 281.495 411.712 281.487 413.734 282.655L480.702 321.318C506.805 336.887 520.536 368.415 512.282 399.221Z" />
    </svg>
  )
}

// Official favicon from https://cursor.com/docs-static/favicon.svg, kept unaltered.
function CursorMark() {
  return (
    <svg className="agent-mark agent-mark-cursor" viewBox="0 0 512 512" aria-hidden="true">
      <image href={cursorMark} width="512" height="512" />
    </svg>
  )
}

// OpenCode's mark, the two paths of its brand logo (sst/opencode,
// packages/console/app/src/asset/brand) unaltered, in one colour like Codex's: the frame, and the block it holds
// shown lighter as the logo does. The viewBox centres the 240-wide drawing in a square.
function OpenCodeMark() {
  return (
    <svg className="agent-mark agent-mark-opencode" viewBox="-30 0 300 300" fill="currentColor" aria-hidden="true">
      <path d="M180 240H60V120H180V240Z" opacity="0.45" />
      <path fillRule="evenodd" d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" />
    </svg>
  )
}

// Pi's mark, the three paths of pi.dev/favicon.svg unaltered, in one colour as its own two themes
// draw it (near black, near white).
function PiMark() {
  return (
    <svg className="agent-mark agent-mark-pi" viewBox="0 0 560 560" fill="currentColor" aria-hidden="true">
      <path d="M420 280H280V140H0V0H420V280Z" />
      <path d="M560 560H420V280H560V560Z" />
      <path d="M140 560H0V140H140V280H280V420H140V560Z" />
    </svg>
  )
}

function NoAgentMark() {
  return (
    <svg className="agent-mark agent-mark-none" {...stroked} strokeDasharray="2.4 2.2">
      <rect x="3" y="3" width="14" height="14" rx="4" />
    </svg>
  )
}

function DeepSeekMark() {
  return (
    <svg className="agent-mark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z" />
    </svg>
  )
}

function AntigravityMark() {
  return (
    <svg className="agent-mark" viewBox="-12 -10 460 420" fill="currentColor" aria-hidden="true">
      <path d="M392.71,390.14c24.17,18.13,60.42,6.04,27.19-27.2C320.21,266.25,341.35.34,217.5.34S114.79,266.25,15.1,362.94c-36.25,36.26,3.02,45.33,27.19,27.2C135.93,326.68,129.89,214.88,217.5,214.88s81.56,111.8,175.21,175.26Z" />
    </svg>
  )
}

// ZCode's mark: the three paths of the Z in Z.ai's logo (zai-org/ZCode,
// packages/ui/src/assets/provider-icons/logo-zai.svg) unaltered, without the tile behind them, in
// one colour. The viewBox centres the letter in a square.
function ZCodeMark() {
  return (
    <svg className="agent-mark agent-mark-zcode" viewBox="2.45 2.47 12.6 12.6" fill="currentColor" aria-hidden="true">
      <path d="M9.03854 3.86902L8.2306 5.01755C8.1036 5.19645 7.89598 5.306 7.67092 5.306H3.26767V3.86328C3.26767 3.86902 9.03854 3.86902 9.03854 3.86902Z" />
      <path d="M14.5209 3.86328L7.59573 13.6741H2.97913L9.90426 3.86328H14.5209Z" />
      <path d="M8.46146 13.6732L9.27514 12.5189C9.40214 12.34 9.60975 12.2305 9.83482 12.2305H14.2323V13.6732H8.46146Z" />
    </svg>
  )
}

function KimiMark() {
  return (
    <svg className="agent-mark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.846 0a1.923 1.923 0 110 3.846H20.15a.226.226 0 01-.227-.226V1.923C19.923.861 20.784 0 21.846 0z" />
      <path d="M11.065 11.199l7.257-7.2c.137-.136.06-.41-.116-.41H14.3a.164.164 0 00-.117.051l-7.82 7.756c-.122.12-.302.013-.302-.179V3.82c0-.127-.083-.23-.185-.23H3.186c-.103 0-.186.103-.186.23V19.77c0 .128.083.23.186.23h2.69c.103 0 .186-.102.186-.23v-3.25c0-.069.025-.135.069-.178l2.424-2.406a.158.158 0 01.205-.023l6.484 4.772a7.677 7.677 0 003.453 1.283c.108.012.2-.095.2-.23v-3.06c0-.117-.07-.212-.164-.227a5.028 5.028 0 01-2.027-.807l-5.613-4.064c-.117-.078-.132-.279-.028-.381z" />
    </svg>
  )
}

function GeminiMark() {
  return (
    <svg className="agent-mark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C10.5 7.5 7.5 10.5 0 12c7.5 1.5 10.5 4.5 12 12 1.5-7.5 4.5-10.5 12-12C16.5 10.5 13.5 7.5 12 0Z" />
    </svg>
  )
}

const AGENT_MARKS = { claude: ClaudeMark, codex: CodexMark, cursor: CursorMark, opencode: OpenCodeMark, pi: PiMark, dsh: DeepSeekMark, antigravity: AntigravityMark, zcode: ZCodeMark, kimi: KimiMark, gemini: GeminiMark } satisfies Record<AgentKind, () => ReactElement>

export function AgentIcon({ agent }: { agent: AgentKind | null }) {
  if (agent === null) return <NoAgentMark />
  const Mark = AGENT_MARKS[agent]
  return <Mark />
}

// Two columns side by side.
export function SplitIcon() {
  return (
    <svg {...stroked}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
      <path d="M10 3.5v13" />
    </svg>
  )
}

export function InspectorIcon() {
  return (
    <svg {...stroked}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
      <path d="M11.5 3.5v13M13.8 7.5h1.7M13.8 10h1.7" />
    </svg>
  )
}

// Something stands in the way: a triangle with a mark in it.
export function WarningIcon() {
  return (
    <svg {...stroked}>
      <path d="M8.6 3.6 2.9 13.4a1.6 1.6 0 0 0 1.4 2.4h11.4a1.6 1.6 0 0 0 1.4-2.4L11.4 3.6a1.6 1.6 0 0 0-2.8 0z" />
      <path d="M10 8v3M10 13.6v.1" />
    </svg>
  )
}

// A commit on its line, as git tools draw one.
export function CommitIcon() {
  return (
    <svg {...stroked}>
      <circle cx="10" cy="10" r="3" />
      <path d="M2.5 10H7M13 10h4.5" />
    </svg>
  )
}

// A window with its left column marked off: the sidebar.
export function SidebarIcon() {
  return (
    <svg {...stroked}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
      <path d="M8 3.5v13" />
    </svg>
  )
}

export function TerminalIcon() {
  return (
    <svg {...stroked}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
      <path d="M6 8l2.5 2L6 12M10.5 12.5H14" />
    </svg>
  )
}

export function PortsIcon() {
  return <svg {...stroked}><rect x="6.5" y="3" width="7" height="5" rx="1" /><path d="M10 8v4M4 12h12M4 12v4M10 12v4M16 12v4" /></svg>
}

// An open book, for reading. Its last page lies on the right one and turns over the spine while a
// read runs (see .book-page in the stylesheet); otherwise it is hidden.
export function BookIcon() {
  const right = 'M10 6.2C10 4.9 11.1 4 12.4 4h4.3a.8.8 0 0 1 .8.8v10a.8.8 0 0 1-.8.8h-4.2a2.5 2.5 0 0 0-2.5 2.5'
  return (
    <svg {...stroked}>
      <path d="M10 6.2C10 4.9 8.9 4 7.6 4H3.3a.8.8 0 0 0-.8.8v10a.8.8 0 0 0 .8.8h4.2a2.5 2.5 0 0 1 2.5 2.5" />
      <path d={right} />
      <path d="M10 6.2v11.9" />
      <path className="book-page" d={right} />
    </svg>
  )
}

export function DocumentIcon() {
  return (
    <svg {...stroked}>
      <path d="M5.5 2.5h6l3.5 3.5v11a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-14a.5.5 0 0 1 .5-.5z" />
      <path d="M11 2.5V6h3.5M7.5 10h5M7.5 13h5" />
    </svg>
  )
}

export function FileChangesIcon() {
  return (
    <svg {...stroked}>
      <rect x="4" y="2.5" width="12" height="15" rx="2" />
      <path d="M7.5 7h5M10 4.5v5M7.5 13h5" />
    </svg>
  )
}

export function GearIcon() {
  const teeth = [0, 45, 90, 135, 180, 225, 270, 315]
  return (
    <svg {...stroked}>
      <circle cx="10" cy="10" r="4.9" />
      <circle cx="10" cy="10" r="1.9" />
      {teeth.map((angle) => (
        <line key={angle} x1="10" y1="4.4" x2="10" y2="2.4" strokeWidth="2.4" transform={`rotate(${angle} 10 10)`} />
      ))}
    </svg>
  )
}

export function ArrowLeftIcon() {
  return (
    <svg {...stroked}>
      <path d="M16 10H4M9 5l-5 5 5 5" />
    </svg>
  )
}

export function ArrowRightIcon() {
  return (
    <svg {...stroked}>
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  )
}

export function CameraIcon() {
  return (
    <svg {...stroked}>
      <path d="M3 7h3l1.5-2h5L14 7h3v9H3z" />
      <circle cx="10" cy="11.5" r="2.5" />
    </svg>
  )
}

// A character and a letter, for putting words into another language.
export function TranslateIcon() {
  return (
    <svg {...stroked}>
      <path d="M3 5h8M7 3v2M5 5c.7 2.4 2.3 4.3 4.6 5.4M9.2 5c-.7 2.5-2.4 4.5-5 5.6M10.5 17l3.3-8 3.2 8M11.6 14.5h4.6" />
    </svg>
  )
}

export function GlobeIcon() {
  return (
    <svg {...stroked}>
      <circle cx="10" cy="10" r="7" />
      <path d="M3 10h14M10 3c2.5 2.5 2.5 11.5 0 14M10 3c-2.5 2.5-2.5 11.5 0 14" />
    </svg>
  )
}

export function CoffeeIcon() {
  return (
    <svg {...stroked}>
      <path d="M4 7h10v4.5a5 5 0 0 1-5 5 5 5 0 0 1-5-5z" />
      <path d="M14 8.5h1a2.5 2.5 0 0 1 0 5h-1.5M6.5 3.5c-1 1 .8 1.7 0 2.5M10 3.5c-1 1 .8 1.7 0 2.5" />
    </svg>
  )
}

// Three columns of cards, the task board.
export function BoardIcon() {
  return (
    <svg {...stroked}>
      <rect x="3" y="3.5" width="4" height="13" rx="1.2" />
      <rect x="8.5" y="3.5" width="4" height="9" rx="1.2" />
      <rect x="14" y="3.5" width="3" height="11" rx="1.2" />
    </svg>
  )
}

// A list of lines, each with a mark in front.
export function ListIcon() {
  return (
    <svg {...stroked}>
      <path d="M8 5.5h8.5M8 10h8.5M8 14.5h8.5" />
      <path d="M3.8 5.5h.4M3.8 10h.4M3.8 14.5h.4" />
    </svg>
  )
}

export function ArrowDownIcon() {
  return (
    <svg {...stroked}>
      <path d="M10 4v12M5 11l5 5 5-5" />
    </svg>
  )
}

export function ArrowUpIcon() {
  return (
    <svg {...stroked}>
      <path d="M10 16V4M5 9l5-5 5 5" />
    </svg>
  )
}

// The return key: what sends a message.
export function EnterIcon() {
  return (
    <svg {...stroked}>
      <path d="M15.5 4.5v5a2.5 2.5 0 0 1-2.5 2.5H4.5M8 8.5 4.5 12 8 15.5" />
    </svg>
  )
}

export function SearchIcon() {
  return (
    <svg {...stroked}>
      <circle cx="9" cy="9" r="5.5" />
      <path d="M13.2 13.2L17 17" />
    </svg>
  )
}

export function ZoomInIcon() {
  return (
    <svg {...stroked}>
      <circle cx="9" cy="9" r="5.5" />
      <path d="M13.2 13.2L17 17M6.8 9h4.4M9 6.8v4.4" />
    </svg>
  )
}

export function ZoomOutIcon() {
  return (
    <svg {...stroked}>
      <circle cx="9" cy="9" r="5.5" />
      <path d="M13.2 13.2L17 17M6.8 9h4.4" />
    </svg>
  )
}

// Most of a circle, its arrow pointing the way it turns.
export function RotateRightIcon() {
  return (
    <svg {...stroked}>
      <path d="M15.5 10.5A5.5 5.5 0 1 1 12.75 5.74" />
      <path d="M11.98 2.84L12.75 5.74L9.85 6.51" />
    </svg>
  )
}

export function RotateLeftIcon() {
  return (
    <svg {...stroked}>
      <path d="M4.5 10.5A5.5 5.5 0 1 0 7.25 5.74" />
      <path d="M8.02 2.84L7.25 5.74L10.15 6.51" />
    </svg>
  )
}

export function ContrastIcon() {
  return (
    <svg {...stroked}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor" />
    </svg>
  )
}

export function GaugeIcon() {
  return (
    <svg {...stroked}>
      <path d="M3.5 14.5a6.5 6.5 0 1 1 13 0" />
      <path d="M10 14.5l3.2-4.2" />
    </svg>
  )
}

export function SparkIcon() {
  return (
    <svg {...stroked}>
      <path d="M10 2.8l1.7 4.5 4.5 1.7-4.5 1.7L10 15.2l-1.7-4.5L3.8 9l4.5-1.7z" />
    </svg>
  )
}

// A robot: the agents installed on this computer.
export function RobotIcon() {
  return (
    <svg {...stroked}>
      <rect x="4" y="7" width="12" height="9" rx="2.5" />
      <path d="M10 7V4.6M2.5 10.5v2.5M17.5 10.5v2.5M8.4 13.4h3.2" />
      <circle cx="10" cy="3.6" r="1" />
      <circle cx="7.6" cy="10.6" r="0.6" fill="currentColor" />
      <circle cx="12.4" cy="10.6" r="0.6" fill="currentColor" />
    </svg>
  )
}

// A bolt: the skills an agent picks up.
export function BoltIcon() {
  return (
    <svg {...stroked}>
      <path d="M11.2 2.5L4.8 11h4.6l-0.8 6.5L15.2 9h-4.6z" />
    </svg>
  )
}

export function FolderIcon() {
  return (
    <svg {...stroked}>
      <path d="M2.8 5.6A1.6 1.6 0 0 1 4.4 4h3l1.7 1.9h6.5a1.6 1.6 0 0 1 1.6 1.6v6.9a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6z" />
    </svg>
  )
}

export function InfoIcon() {
  return (
    <svg {...stroked}>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 9.2v4.6" />
      <circle cx="10" cy="6.4" r="0.6" fill="currentColor" />
    </svg>
  )
}

// A group chat: two speech bubbles, one behind the other.
// A small team: one in front, two behind.
export function SquadIcon() {
  return (
    <svg {...stroked}>
      <circle cx="10" cy="7.2" r="2.4" />
      <path d="M5.6 16.2c.4-2.6 2.2-4.1 4.4-4.1s4 1.5 4.4 4.1" />
      <circle cx="4.6" cy="8.6" r="1.7" />
      <path d="M2.3 14.6c.3-1.6 1.2-2.6 2.5-2.9" />
      <circle cx="15.4" cy="8.6" r="1.7" />
      <path d="M17.7 14.6c-.3-1.6-1.2-2.6-2.5-2.9" />
    </svg>
  )
}

export function GroupChatIcon() {
  return (
    <svg {...stroked}>
      <path d="M3.7 3.5h8.1a1.4 1.4 0 0 1 1.4 1.4v4.9a1.4 1.4 0 0 1-1.4 1.4H7.6l-2.6 2.2v-2.2H3.7a1.4 1.4 0 0 1-1.4-1.4V4.9a1.4 1.4 0 0 1 1.4-1.4z" />
      <path d="M15.4 7.2h.9a1.4 1.4 0 0 1 1.4 1.4v4.9a1.4 1.4 0 0 1-1.4 1.4H15v2.2l-2.6-2.2H9.6a1.4 1.4 0 0 1-1.4-1.3" />
    </svg>
  )
}

export function ChatIcon() {
  return (
    <svg {...stroked}>
      <path d="M4.2 4h11.6a1.7 1.7 0 0 1 1.7 1.7v7a1.7 1.7 0 0 1-1.7 1.7H9.4L6 17.2v-2.8H4.2a1.7 1.7 0 0 1-1.7-1.7v-7A1.7 1.7 0 0 1 4.2 4z" />
      <path d="M6.5 8.2h7M6.5 11h4.5" />
    </svg>
  )
}

export function InboxIcon() {
  return (
    <svg {...stroked}>
      <path d="M3 11.5l2-6.4A1.5 1.5 0 0 1 6.4 4h7.2a1.5 1.5 0 0 1 1.4 1.1l2 6.4v3.8a1.2 1.2 0 0 1-1.2 1.2H4.2A1.2 1.2 0 0 1 3 15.3z" />
      <path d="M3 11.5h3.8l1 1.8h4.4l1-1.8H17" />
    </svg>
  )
}

export function ChartIcon() {
  return (
    <svg {...stroked}>
      <path d="M3.5 16.5h13" />
      <path d="M5.5 13.5v-3M9 13.5v-7M12.5 13.5V9M16 13.5V4.5" />
    </svg>
  )
}

export function RefreshIcon() {
  return (
    <svg {...stroked}>
      <path d="M16 9.5A6 6 0 0 0 5.2 6.2L4 7.5" />
      <path d="M4 4.2v3.3h3.3" />
      <path d="M4 10.5a6 6 0 0 0 10.8 3.3l1.2-1.3" />
      <path d="M16 15.8v-3.3h-3.3" />
    </svg>
  )
}

export function ChevronRightIcon() {
  return (
    <svg {...stroked}>
      <path d="M8 6l4 4-4 4" />
    </svg>
  )
}

export function SlidersIcon() {
  return (
    <svg {...stroked}>
      <path d="M6.5 3v7.5M6.5 14.5V17M13.5 3v2.5M13.5 9.5V17" />
      <circle cx="6.5" cy="12.5" r="2" />
      <circle cx="13.5" cy="7.5" r="2" />
    </svg>
  )
}

export function FilterIcon() {
  return (
    <svg {...stroked}>
      <path d="M3.5 4.5h13l-5 6v5l-3 1.5v-6.5z" />
    </svg>
  )
}

// Copying: one sheet over another.
export function CopyIcon() {
  return (
    <svg {...stroked}>
      <rect x="7" y="7" width="9.5" height="9.5" rx="2" />
      <path d="M13 7V5.2A1.7 1.7 0 0 0 11.3 3.5H5.2A1.7 1.7 0 0 0 3.5 5.2v6.1A1.7 1.7 0 0 0 5.2 13H7" />
    </svg>
  )
}

// Saving a copy: an arrow down into a tray.
export function DownloadIcon() {
  return (
    <svg {...stroked}>
      <path d="M3.5 13.2v2a1.3 1.3 0 0 0 1.3 1.3h10.4a1.3 1.3 0 0 0 1.3-1.3v-2" />
      <path d="M10 3.2v8.2M6.6 8 10 11.4 13.4 8" />
    </svg>
  )
}

export function PencilIcon() {
  return (
    <svg {...stroked}>
      <path d="M13.5 3.8l2.7 2.7-8.9 8.9-3.6.9.9-3.6z" />
      <path d="M11.8 5.5l2.7 2.7" />
    </svg>
  )
}

export function HandoffIcon() {
  return (
    <svg {...stroked}>
      <path d="M11.5 4.5L16 9l-4.5 4.5" />
      <path d="M16 9H9a5 5 0 0 0-5 5v1.5" />
    </svg>
  )
}

export function StopIcon() {
  return (
    <svg {...stroked}>
      <rect x="5" y="5" width="10" height="10" rx="2" />
    </svg>
  )
}

export function ExternalIcon() {
  return (
    <svg {...stroked}>
      <path d="M11.5 3.5h5v5M16.5 3.5l-7 7" />
      <path d="M14.5 11.5v3.8a1.2 1.2 0 0 1-1.2 1.2H4.7a1.2 1.2 0 0 1-1.2-1.2V6.7a1.2 1.2 0 0 1 1.2-1.2h3.8" />
    </svg>
  )
}

export function ImageIcon() {
  return (
    <svg {...stroked}>
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <circle cx="7.5" cy="8.5" r="1.3" />
      <path d="M3.5 14.5l3.8-3.8 3 3 2.2-2.2 4 4" />
    </svg>
  )
}

// A plug: an MCP server plugged into the agents.
// A puzzle piece, for what plugins add: Lucide's "puzzle" (ISC), drawn on its own 24 grid with the
// stroke scaled to match the 20-grid icons here.
export function PuzzleIcon() {
  return (
    <svg {...stroked} viewBox="0 0 24 24" strokeWidth={1.9}>
      <path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z" />
    </svg>
  )
}

// GitHub's and Jira's marks, from Simple Icons 16.35.0 (the drawings are CC0; the marks are their
// owners' trademarks), in one colour like the icons around them rather than in brand colours.
function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function JiraMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z" />
    </svg>
  )
}

const SOURCE_MARKS: Partial<Record<string, () => ReactElement>> = { github: GitHubMark, jira: JiraMark }

// A task source by its provider's own mark where there is one; any other (a plugin's) by the inbox.
export function SourceIcon({ provider }: { provider: string }) {
  const Mark = SOURCE_MARKS[provider] ?? InboxIcon
  return <Mark />
}

export function PlugIcon() {
  return (
    <svg {...stroked}>
      <path d="M7.2 2.8v3.4M12.8 2.8v3.4M5 6.2h10v2.6a5 5 0 0 1-10 0zM10 13.8v3.4" />
    </svg>
  )
}

export function PersonIcon() {
  return (
    <svg {...stroked}>
      <circle cx="10" cy="6.8" r="3" />
      <path d="M4.5 16.5a5.5 5.5 0 0 1 11 0" />
    </svg>
  )
}

export function LockIcon() {
  return (
    <svg {...stroked}>
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  )
}

export function CloudIcon() {
  return (
    <svg {...stroked}>
      <path d="M6 15.5h8.2a3.3 3.3 0 0 0 .4-6.6 4.8 4.8 0 0 0-9.2 1.2A2.7 2.7 0 0 0 6 15.5z" />
    </svg>
  )
}

export function TagIcon() {
  return (
    <svg {...stroked}>
      <path d="M3.5 3.5h6.2l6.8 6.8-6.2 6.2-6.8-6.8z" />
      <circle cx="7.2" cy="7.2" r="1.2" />
    </svg>
  )
}

export function BranchIcon() {
  return (
    <svg {...stroked}>
      <circle cx="6" cy="5" r="1.8" />
      <circle cx="6" cy="15" r="1.8" />
      <circle cx="14" cy="7" r="1.8" />
      <path d="M6 6.8v6.4M14 8.8c0 3.4-8 2.2-8 4.4" />
    </svg>
  )
}

// A folder with a minus, for taking a checkout away and keeping what it holds elsewhere.
export function FolderRemoveIcon() {
  return (
    <svg {...stroked}>
      <path d="M2.8 5.6A1.6 1.6 0 0 1 4.4 4h3l1.7 1.9h6.5a1.6 1.6 0 0 1 1.6 1.6v6.9a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6zM7.5 11h5" />
    </svg>
  )
}

// A pushpin, for keeping something at the top.
export function PinIcon() {
  return (
    <svg {...stroked}>
      <path d="M11 3l6 6M12.2 4.2 8.4 7.4l-3.2.5 6.9 6.9.5-3.2 3.2-3.8M8.6 11.4 3.5 16.5" />
    </svg>
  )
}

// A box with its lid, for putting something away.
export function ArchiveIcon() {
  return (
    <svg {...stroked}>
      <rect x="3" y="4" width="14" height="3.5" rx="1" />
      <path d="M4.5 7.5v7.8a1.2 1.2 0 0 0 1.2 1.2h8.6a1.2 1.2 0 0 0 1.2-1.2V7.5M8 10.5h4" />
    </svg>
  )
}

export function CodeIcon() {
  return (
    <svg {...stroked}>
      <path d="M6.5 6 2.8 10l3.7 4M13.5 6l3.7 4-3.7 4M11.3 4.5l-2.6 11" />
    </svg>
  )
}

export function LinkIcon() {
  return (
    <svg {...stroked}>
      <path d="M8.6 11.4a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9M11.4 8.6a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9" />
    </svg>
  )
}

// Two ways, for comparing one side with the other.
export function CompareIcon() {
  return (
    <svg {...stroked}>
      <path d="M4 7h11.5m0 0-3-3m3 3-3 3M16 13H4.5m0 0 3-3m-3 3 3 3" />
    </svg>
  )
}

// A branch joining back into the line it left.
export function MergeIcon() {
  return (
    <svg {...stroked}>
      <circle cx="6" cy="4.8" r="1.8" />
      <circle cx="6" cy="15.2" r="1.8" />
      <circle cx="14" cy="11" r="1.8" />
      <path d="M6 6.6v6.8M6 6.6c0 2.6 3.2 4.4 6.2 4.4" />
    </svg>
  )
}

export function TrashIcon() {
  return (
    <svg {...stroked}>
      <path d="M4 6h12M8 6V4.3h4V6M5.6 6l.7 9.7a.9.9 0 0 0 .9.8h5.6a.9.9 0 0 0 .9-.8L14.4 6M8.6 9v4.6M11.4 9v4.6" />
    </svg>
  )
}

export function ForkIcon() {
  return (
    <svg {...stroked}>
      <path d="M3.5 10H8m0 0 7.5-6.5m-4 0h4v4M8 10l7.5 6.5m-4 0h4v-4" />
    </svg>
  )
}

export function BookmarkIcon() {
  return (
    <svg {...stroked}>
      <path d="M6 3.5h8a1 1 0 0 1 1 1v12l-5-3.2-5 3.2v-12a1 1 0 0 1 1-1z" />
    </svg>
  )
}

export function PulseIcon() {
  return (
    <svg {...stroked}>
      <path d="M2.5 10h3.2l2-5 3.6 10 2.2-5h4" />
    </svg>
  )
}

// A bug: the debugging settings.
export function BugIcon() {
  return (
    <svg {...stroked}>
      <rect x="6" y="6.5" width="8" height="10" rx="4" />
      <path d="M7.5 6.8a2.5 2.5 0 0 1 5 0M10 9.5v7M6 10.5H3M14 10.5h3M6.2 14H3.5M13.8 14h2.7M6.5 7.5 4.5 5.5M13.5 7.5l2-2" />
    </svg>
  )
}

export function BellIcon() {
  return (
    <svg {...stroked}>
      <path d="M5 13.5V9a5 5 0 0 1 10 0v4.5l1.5 1.5h-13z" />
      <path d="M8.3 16.5a1.8 1.8 0 0 0 3.4 0" />
    </svg>
  )
}

export function ClockIcon() {
  return (
    <svg {...stroked}>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 6.5V10l2.5 1.5" />
    </svg>
  )
}

// A quotation mark: for quoting a passage into the next message.
export function QuoteIcon() {
  return (
    <svg {...stroked}>
      <path d="M4 14.5c2.6-.6 3.6-2.4 3.6-5V6H4v4h3.6M12 14.5c2.6-.6 3.6-2.4 3.6-5V6H12v4h3.6" />
    </svg>
  )
}

// A speech bubble with a plus: for adding a comment.
export function CommentAddIcon() {
  return (
    <svg {...stroked}>
      <path d="M10 16.5a6.5 6.5 0 1 0-5.6-3.2L3.5 16.5l3.3-.9A6.5 6.5 0 0 0 10 16.5z" />
      <path d="M10 7.2v5.6M7.2 10h5.6" />
    </svg>
  )
}
