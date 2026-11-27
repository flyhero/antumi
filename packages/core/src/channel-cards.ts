import type { ChannelPlatform } from '@antumi/protocol'

// A card as core draws it, of no platform (docs/CHANNEL-LOOP.md): a heading, a few paragraphs of
// Markdown core put together, and buttons that carry nothing but a one-use token. A formatter per
// platform turns it into that platform's card; the gateway only posts what it is given.

export type CardTone = 'blue' | 'orange' | 'green' | 'red' | 'grey'
export type CardButton = { label: string; token: string; tone: 'primary' | 'danger' | 'default'; confirm?: string }
export type ChannelCard = {
  title: string
  tone: CardTone
  // Markdown, made safe with cardText where any of it is someone else's words.
  sections: string[]
  buttons: CardButton[]
  // A field the buttons send along (a reason to send back), with them in one form.
  input?: { name: string; placeholder: string; maxLength: number }
  note?: string
}

// Someone else's words in a card: no tag of the card's own (a mention of everyone, a coloured
// font), cut to a length a card holds.
export function cardText(text: string, limit = 2000): string {
  const shown = text.length > limit ? `${text.slice(0, limit)}…` : text
  return shown.replace(/<(?=\/?[a-zA-Z])/g, '<​')
}

// A user named by core, whom the card notifies.
export function cardMention(user: string): string {
  return `<at id=${user.replace(/[^\w-]/g, '')}></at>`
}

const plain = (content: string) => ({ tag: 'plain_text', content })
const TEMPLATE: Record<CardTone, string> = { blue: 'blue', orange: 'orange', green: 'green', red: 'red', grey: 'grey' }
const BUTTON: Record<CardButton['tone'], string> = { primary: 'primary_filled', danger: 'danger', default: 'default' }

// Feishu's (and Lark's) card JSON 2.0. update_multi from the start: a card can be redrawn only if it
// was posted able to be.
export function feishuCard(card: ChannelCard): Record<string, unknown> {
  // In a form each submitting button needs a name of its own; the token is what is read.
  const button = (each: CardButton, index: number, submit: boolean) => ({
    tag: 'button',
    text: plain(each.label),
    type: BUTTON[each.tone],
    ...(submit ? { name: `b${index}`, form_action_type: 'submit' } : {}),
    behaviors: [{ type: 'callback', value: { t: each.token } }],
    ...(each.confirm ? { confirm: { title: plain(each.label), text: plain(each.confirm) } } : {})
  })
  const row = (buttons: readonly CardButton[], submit: boolean) => ({
    tag: 'column_set',
    flex_mode: 'flow',
    columns: buttons.map((each, index) => ({ tag: 'column', width: 'auto', elements: [button(each, index, submit)] }))
  })
  const actions = card.buttons.length === 0 ? [] : card.input
    ? [{ tag: 'form', name: 'answer', elements: [
        { tag: 'input', name: card.input.name, placeholder: plain(card.input.placeholder), max_length: card.input.maxLength },
        row(card.buttons, true)
      ] }]
    : [row(card.buttons, false)]
  return {
    schema: '2.0',
    config: { update_multi: true },
    header: { title: plain(card.title), template: TEMPLATE[card.tone] },
    body: {
      elements: [
        ...card.sections.filter(Boolean).map((content) => ({ tag: 'markdown', content })),
        ...actions,
        ...(card.note ? [{ tag: 'markdown', content: card.note, text_size: 'notation' }] : [])
      ]
    }
  }
}

// The platforms that have cards; a platform not here never gets one (its descriptor says no).
export const CARD_FORMATTERS = { feishu: feishuCard, lark: feishuCard } satisfies Partial<Record<ChannelPlatform, (card: ChannelCard) => unknown>>

export function platformCard(platform: ChannelPlatform, card: ChannelCard): unknown | null {
  return platform === 'feishu' || platform === 'lark' ? CARD_FORMATTERS[platform](card) : null
}
